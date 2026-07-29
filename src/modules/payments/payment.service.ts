import { BookingStatus, PaymentMethod, PaymentStatus, Prisma, ShowtimeSeatStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { lockingRepository } from "../../repositories/locking.repository.js";
import { ApiError } from "../../utils/api-error.js";
import { createReference } from "../../utils/ids.js";
import { assertBookingTransition } from "../bookings/booking-state.js";

const paymentInclude = { booking: { select: { userId: true } } } as const;

type MockPaymentOutcome = "SUCCEEDED" | "FAILED";

const isSerializationFailure = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

const runSerializable = async <Result>(work: (tx: Prisma.TransactionClient) => Promise<Result>) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Transaction retry limit reached.");
};

const serializePayment = (payment: {
  id: string;
  bookingId: string;
  providerRef: string | null;
  amountCents: number;
  status: PaymentStatus;
  method: PaymentMethod;
  createdAt: Date;
}) => ({
  id: payment.id,
  bookingId: payment.bookingId,
  providerRef: payment.providerRef,
  amountCents: payment.amountCents,
  status: payment.status,
  method: payment.method,
  createdAt: payment.createdAt,
});

export const paymentService = {
  async processMock(input: {
    bookingId: string;
    userId: string;
    idempotencyKey: string;
    method: PaymentMethod;
    outcome: MockPaymentOutcome;
  }) {
    const payment = await runSerializable(async (tx) => {
      await lockingRepository.acquireAdvisoryLock(tx, `payment:${input.idempotencyKey}`);
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: paymentInclude });
      if (existing) {
        if (existing.bookingId !== input.bookingId || existing.booking.userId !== input.userId) {
          throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key belongs to another payment command.");
        }
        return existing;
      }

      await lockingRepository.lockBooking(tx, input.bookingId);
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking || booking.userId !== input.userId) {
        throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found.");
      }
      if (booking.expiresAt && booking.expiresAt <= new Date()) {
        throw new ApiError(409, "BOOKING_EXPIRED", "This reservation has expired.");
      }
      if (booking.status !== BookingStatus.PENDING_PAYMENT) {
        throw new ApiError(409, "INVALID_BOOKING_TRANSITION", `Cannot process payment for a ${booking.status} booking.`);
      }

      const created = await tx.payment.create({
        data: {
          bookingId: booking.id,
          amountCents: booking.totalCents,
          status: input.outcome === "SUCCEEDED" ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
          method: input.method,
          providerRef: createReference("mockpay"),
          idempotencyKey: input.idempotencyKey,
        },
        include: paymentInclude,
      });

      if (input.outcome === "FAILED") return created;

      assertBookingTransition(booking.status, BookingStatus.CONFIRMED);
      await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.CONFIRMED, expiresAt: null } });
      await tx.showtimeSeat.updateMany({
        where: { bookingId: booking.id, status: ShowtimeSeatStatus.HELD },
        data: { status: ShowtimeSeatStatus.BOOKED },
      });
      await tx.seatHold.deleteMany({ where: { bookingId: booking.id } });
      return created;
    });

    return serializePayment(payment);
  },

  async confirmMock(input: { bookingId: string; userId: string; idempotencyKey: string }) {
    return paymentService.processMock({
      ...input,
      method: PaymentMethod.UPI,
      outcome: "SUCCEEDED",
    });
  },
};
