import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { bookingService } from "../bookings/booking.service.js";
import { paymentService } from "./payment.service.js";
import {
  processPaymentEvent,
  receiveProviderEvent,
  signProviderEvent,
  type MockProviderEvent,
} from "./payment-events.service.js";

export type PaymentLabScenario = "DUPLICATE" | "RESTART" | "LATE";

export const readPaymentLabRun = async (userId: string, bookingId: string) => {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      userId,
      paymentEvents: { some: { manualOnly: true, labScenario: { not: null } } },
    },
    include: {
      seats: { include: { seat: true } },
      payments: true,
      paymentEvents: { orderBy: { receivedAt: "asc" } },
    },
  });
  if (!booking)
    throw new ApiError(
      404,
      "LAB_RUN_NOT_FOUND",
      "This isolated lab run was not found for your account.",
    );
  const event = booking.paymentEvents[0];
  const inventory = await prisma.showtimeSeat.findUniqueOrThrow({
    where: {
      showtimeId_seatId: {
        showtimeId: booking.showtimeId,
        seatId: booking.seats[0].seatId,
      },
    },
  });
  const owner = inventory.bookingId
    ? await prisma.booking.findUnique({
        where: { id: inventory.bookingId },
        select: { id: true, status: true },
      })
    : null;
  const holds = await prisma.seatHold.count({
    where: { bookingId: booking.id },
  });
  const waiting = event.status === "RECEIVED";
  const late = event.labScenario === "LATE";
  const paymentCount = booking.payments.filter(
    (payment) => payment.status === "SUCCEEDED",
  ).length;
  const checks = waiting
    ? [
        {
          label: "Event committed before processing",
          passed: event.id.length > 0,
          detail: "A separate database read found the durable inbox row.",
        },
        {
          label: "No ticket confirmed prematurely",
          passed: booking.status === "PENDING_PAYMENT" && paymentCount === 0,
          detail:
            "The booking is pending and no successful local payment has been applied.",
        },
      ]
    : [
        {
          label: "One durable event",
          passed: booking.paymentEvents.length === 1,
          detail: `${booking.paymentEvents.length} inbox row; ${event.deliveryCount} deliveries received.`,
        },
        {
          label: "One successful payment record",
          passed: paymentCount === 1,
          detail: `${paymentCount} successful payment row for the original booking.`,
        },
        {
          label: late
            ? "Other customer's ticket protected"
            : "Booking and seats agree",
          passed: late
            ? booking.status === "EXPIRED" &&
              inventory.status === "BOOKED" &&
              owner?.id !== booking.id &&
              owner?.status === "CONFIRMED"
            : booking.status === "CONFIRMED" &&
              inventory.status === "BOOKED" &&
              inventory.bookingId === booking.id,
          detail: late
            ? "The original booking is expired; the seat still belongs to the second confirmed booking."
            : "The confirmed booking owns the BOOKED inventory row.",
        },
        {
          label: late ? "Compensation is explicit" : "Temporary hold removed",
          passed: late ? event.status === "REFUND_REQUIRED" : holds === 0,
          detail: late
            ? "REFUND_REQUIRED is an operator-visible flag. No real refund has been issued."
            : `${holds} temporary holds remain for this booking.`,
        },
      ];
  return {
    source: "postgresql" as const,
    runId: booking.id,
    scenario: event.labScenario as PaymentLabScenario,
    event: {
      id: event.id,
      providerEventId: event.providerEventId,
      status: event.status,
      deliveryCount: event.deliveryCount,
      attempts: event.attempts,
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
      lastError: event.lastError,
    },
    booking: {
      id: booking.id,
      status: booking.status,
      expiresAt: booking.expiresAt,
    },
    seat: {
      label: `${booking.seats[0].seat.rowLabel}${booking.seats[0].seat.number}`,
      status: inventory.status,
      ownerBookingId: inventory.bookingId,
    },
    payments: booking.payments.map((payment) => ({
      id: payment.id,
      providerRef: payment.providerRef,
      status: payment.status,
      amountCents: payment.amountCents,
    })),
    competitor: owner && owner.id !== booking.id ? owner : null,
    checks,
  };
};

export const createPaymentLabRun = async (
  userId: string,
  scenario: PaymentLabScenario,
) => {
  const suffix = randomUUID();
  const fixture = await prisma.$transaction(async (tx) => {
    const movie =
      (await tx.movie.findFirst({ select: { id: true } })) ??
      (await tx.movie.create({
        data: { title: "Payment lab sample", durationMin: 120 },
      }));
    const theater = await tx.theater.create({
      data: {
        name: `[LAB] ${suffix}`,
        city: "System Lab",
        address: "Isolated development fixture",
      },
    });
    const screen = await tx.screen.create({
      data: { theaterId: theater.id, name: "Payment sandbox" },
    });
    const seat = await tx.seat.create({
      data: { screenId: screen.id, rowLabel: "L", number: 1 },
    });
    const showtime = await tx.showtime.create({
      data: {
        movieId: movie.id,
        screenId: screen.id,
        startsAt: new Date(Date.now() + 86_400_000),
        priceCents: 29900,
      },
    });
    await tx.showtimeSeat.create({
      data: { showtimeId: showtime.id, seatId: seat.id },
    });
    return { seatId: seat.id, showtimeId: showtime.id };
  });
  const booking = await bookingService.reserve({
    ...fixture,
    userId,
    seatIds: [fixture.seatId],
    idempotencyKey: `lab-reserve-${suffix}`,
  });
  if (scenario === "LATE") {
    const expiredAt = new Date(Date.now() - 1000);
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: { expiresAt: expiredAt },
      }),
      prisma.seatHold.updateMany({
        where: { bookingId: booking.id },
        data: { expiresAt: expiredAt },
      }),
    ]);
    await bookingService.expire(booking.id);
    const competitor = await prisma.user.create({
      data: {
        email: `lab-other-${suffix}@example.test`,
        passwordHash: "lab-account-cannot-login",
      },
    });
    const otherBooking = await bookingService.reserve({
      userId: competitor.id,
      showtimeId: fixture.showtimeId,
      seatIds: [fixture.seatId],
      idempotencyKey: `lab-other-${suffix}`,
    });
    await paymentService.confirmMock({
      userId: competitor.id,
      bookingId: otherBooking.id,
      idempotencyKey: `lab-other-payment-${suffix}`,
    });
  }
  const payload: MockProviderEvent = {
    eventId: `evt_lab_${suffix}`,
    providerRef: `pay_lab_${suffix}`,
    bookingId: booking.id,
    amountCents: booking.totalCents,
    currency: "INR",
    method: "CARD",
    outcome: "SUCCEEDED",
  };
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = signProviderEvent(raw);
  const receive = () =>
    receiveProviderEvent(raw, signature, {
      manualOnly: true,
      labScenario: scenario,
    });
  const deliveries = await Promise.all(
    Array.from({ length: scenario === "DUPLICATE" ? 5 : 1 }, receive),
  );
  if (scenario !== "RESTART")
    await processPaymentEvent(deliveries[0].id, { includeManual: true });
  return readPaymentLabRun(userId, booking.id);
};

export const resumePaymentLabRun = async (
  userId: string,
  bookingId: string,
) => {
  const run = await readPaymentLabRun(userId, bookingId);
  await processPaymentEvent(run.event.id, { includeManual: true });
  return readPaymentLabRun(userId, bookingId);
};
