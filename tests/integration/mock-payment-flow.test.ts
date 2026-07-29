import { PaymentMethod } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import { bookingService } from "../../src/modules/bookings/booking.service.js";
import { paymentService } from "../../src/modules/payments/payment.service.js";

const suffix = Date.now().toString();
let userId: string;
let movieId: string;
let theaterId: string;
let showtimeId: string;
let seatId: string;

describe("mock payment flow", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `payment-${suffix}@example.test`, passwordHash: "not-used" },
    });
    userId = user.id;

    const movie = await prisma.movie.create({
      data: { title: `Payment Flow ${suffix}`, durationMin: 110 },
    });
    movieId = movie.id;

    const theater = await prisma.theater.create({
      data: { name: `Payment Theater ${suffix}`, city: "Test", address: "Test address" },
    });
    theaterId = theater.id;

    const screen = await prisma.screen.create({ data: { theaterId, name: "Gateway Screen" } });
    const seat = await prisma.seat.create({
      data: { screenId: screen.id, rowLabel: "P", number: 1, seatType: "PREMIUM" },
    });
    seatId = seat.id;

    const showtime = await prisma.showtime.create({
      data: {
        movieId,
        screenId: screen.id,
        startsAt: new Date(Date.now() + 86_400_000),
        priceCents: 34900,
      },
    });
    showtimeId = showtime.id;
    await prisma.showtimeSeat.create({ data: { showtimeId, seatId } });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      const bookings = await tx.booking.findMany({ where: { userId }, select: { id: true } });
      const bookingIds = bookings.map((booking) => booking.id);
      await tx.seatHold.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.showtimeSeat.deleteMany({ where: { showtimeId } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await tx.showtime.deleteMany({ where: { id: showtimeId } });
      await tx.movie.deleteMany({ where: { id: movieId } });
      await tx.theater.deleteMany({ where: { id: theaterId } });
      await tx.user.deleteMany({ where: { id: userId } });
    });
    await prisma.$disconnect();
  });

  it("keeps seats held after a decline, then confirms the booking on a successful retry", async () => {
    const booking = await bookingService.reserve({
      userId,
      showtimeId,
      seatIds: [seatId],
      idempotencyKey: `reserve-${suffix}`,
    });

    const failed = await paymentService.processMock({
      bookingId: booking.id,
      userId,
      idempotencyKey: `payment-failed-${suffix}`,
      method: PaymentMethod.CARD,
      outcome: "FAILED",
    });

    expect(failed.status).toBe("FAILED");
    expect(failed.method).toBe("CARD");

    const afterFailure = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { heldSeats: true, seatHolds: true },
    });
    expect(afterFailure.status).toBe("PENDING_PAYMENT");
    expect(afterFailure.heldSeats[0]?.status).toBe("HELD");
    expect(afterFailure.seatHolds).toHaveLength(1);

    const sameFailedAttempt = await paymentService.processMock({
      bookingId: booking.id,
      userId,
      idempotencyKey: `payment-failed-${suffix}`,
      method: PaymentMethod.CARD,
      outcome: "SUCCEEDED",
    });
    expect(sameFailedAttempt.id).toBe(failed.id);
    expect(sameFailedAttempt.status).toBe("FAILED");

    const succeeded = await paymentService.processMock({
      bookingId: booking.id,
      userId,
      idempotencyKey: `payment-success-${suffix}`,
      method: PaymentMethod.UPI,
      outcome: "SUCCEEDED",
    });

    expect(succeeded.status).toBe("SUCCEEDED");
    expect(succeeded.method).toBe("UPI");

    const afterSuccess = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { heldSeats: true, seatHolds: true, payments: true },
    });
    expect(afterSuccess.status).toBe("CONFIRMED");
    expect(afterSuccess.expiresAt).toBeNull();
    expect(afterSuccess.heldSeats[0]?.status).toBe("BOOKED");
    expect(afterSuccess.seatHolds).toHaveLength(0);
    expect(afterSuccess.payments.map((payment) => payment.status).sort()).toEqual(["FAILED", "SUCCEEDED"]);

    const history = await bookingService.listForUser(userId);
    expect(history[0]).toMatchObject({
      id: booking.id,
      status: "CONFIRMED",
      payments: expect.arrayContaining([
        expect.objectContaining({ status: "SUCCEEDED", method: "UPI" }),
      ]),
    });
  });
});
