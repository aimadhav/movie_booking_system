import { BookingStatus, Prisma, ShowtimeSeatStatus, ShowtimeStatus } from "@prisma/client";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { runSerializable } from "../../lib/transaction.js";
import { lockingRepository } from "../../repositories/locking.repository.js";
import { ApiError } from "../../utils/api-error.js";
import { assertBookingTransition } from "./booking-state.js";

const bookingInclude = {
  showtime: { include: { movie: true, screen: { include: { theater: true } } } },
  seats: { include: { seat: true } },
  payments: true,
} as const;

const serializeBooking = (booking: any) => ({
  id: booking.id,
  status: booking.status,
  totalCents: booking.totalCents,
  expiresAt: booking.expiresAt,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
  showtime: {
    id: booking.showtime.id,
    startsAt: booking.showtime.startsAt,
    movie: booking.showtime.movie,
    theater: booking.showtime.screen.theater,
    screen: { id: booking.showtime.screen.id, name: booking.showtime.screen.name },
  },
  seats: booking.seats.map((bookingSeat: any) => ({
    id: bookingSeat.seat.id,
    rowLabel: bookingSeat.seat.rowLabel,
    number: bookingSeat.seat.number,
    seatType: bookingSeat.seat.seatType,
    priceCents: bookingSeat.priceCents,
  })),
  payments: booking.payments.map((payment: any) => ({
    id: payment.id,
    providerRef: payment.providerRef,
    amountCents: payment.amountCents,
    status: payment.status,
    method: payment.method,
    createdAt: payment.createdAt,
  })),
});

const releasePendingBooking = async (tx: Prisma.TransactionClient, bookingId: string, status: BookingStatus) => {
  const booking = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found.");
  assertBookingTransition(booking.status, status);
  await tx.showtimeSeat.updateMany({
    where: { bookingId, status: ShowtimeSeatStatus.HELD },
    data: { status: ShowtimeSeatStatus.AVAILABLE, bookingId: null },
  });
  await tx.seatHold.deleteMany({ where: { bookingId } });
  return tx.booking.update({ where: { id: bookingId }, data: { status, expiresAt: null }, include: bookingInclude });
};

export const bookingService = {
  async reserve(input: { userId: string; showtimeId: string; seatIds: string[]; idempotencyKey: string }) {
    const seatIds = [...input.seatIds].sort();
    const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60_000);
    const booking = await runSerializable(async (tx) => {
      await lockingRepository.acquireAdvisoryLock(tx, `reserve:${input.userId}:${input.idempotencyKey}`);
      const existing = await tx.booking.findUnique({
        where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
        include: bookingInclude,
      });
      if (existing) {
        const originalSeats = existing.seats.map((seat) => seat.seatId).sort();
        if (existing.showtimeId !== input.showtimeId || JSON.stringify(originalSeats) !== JSON.stringify(seatIds)) {
          throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This key already identifies a different reservation.");
        }
        return existing;
      }

      const showtime = await tx.showtime.findUnique({ where: { id: input.showtimeId } });
      if (!showtime || showtime.status !== ShowtimeStatus.SCHEDULED) {
        throw new ApiError(404, "SHOWTIME_NOT_FOUND", "A scheduled showtime was not found.");
      }
      if (showtime.startsAt <= new Date()) {
        throw new ApiError(409, "SHOWTIME_STARTED", "Reservations are closed for this showtime.");
      }

      const lockedSeats = await lockingRepository.lockShowtimeSeats(tx, input.showtimeId, seatIds);
      if (lockedSeats.length !== seatIds.length) {
        throw new ApiError(422, "INVALID_SEATS", "One or more seats do not belong to this showtime.");
      }
      if (lockedSeats.some((seat) => seat.status !== ShowtimeSeatStatus.AVAILABLE)) {
        throw new ApiError(409, "SEAT_UNAVAILABLE", "One or more seats are no longer available.");
      }

      const created = await tx.booking.create({
        data: {
          userId: input.userId,
          showtimeId: input.showtimeId,
          idempotencyKey: input.idempotencyKey,
          totalCents: showtime.priceCents * seatIds.length,
          expiresAt,
          seats: { create: seatIds.map((seatId) => ({ seatId, priceCents: showtime.priceCents })) },
        },
        include: bookingInclude,
      });

      await tx.showtimeSeat.updateMany({
        where: { id: { in: lockedSeats.map((seat) => seat.id) }, status: ShowtimeSeatStatus.AVAILABLE },
        data: { status: ShowtimeSeatStatus.HELD, bookingId: created.id },
      });
      await tx.seatHold.createMany({
        data: seatIds.map((seatId) => ({ showtimeId: input.showtimeId, seatId, bookingId: created.id, expiresAt })),
      });
      return created;
    });
    return serializeBooking(booking);
  },

  async listForUser(userId: string) {
    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: bookingInclude,
      orderBy: { createdAt: "desc" },
    });
    return bookings.map(serializeBooking);
  },

  async cancel(userId: string, bookingId: string) {
    const booking = await runSerializable(async (tx) => {
      await lockingRepository.lockBooking(tx, bookingId);
      const current = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { showtime: { select: { startsAt: true } } },
      });
      if (!current || current.userId !== userId) {
        throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found.");
      }
      if (current.status === BookingStatus.PENDING_PAYMENT) {
        return releasePendingBooking(tx, bookingId, BookingStatus.CANCELLED);
      }
      if (current.status !== BookingStatus.CONFIRMED) {
        throw new ApiError(409, "INVALID_BOOKING_TRANSITION", "This booking cannot be cancelled.");
      }
      if (current.showtime.startsAt <= new Date()) {
        throw new ApiError(409, "CANCELLATION_CLOSED", "Confirmed bookings cannot be cancelled after the showtime starts.");
      }
      assertBookingTransition(current.status, BookingStatus.CANCELLED);
      await tx.showtimeSeat.updateMany({
        where: { bookingId, status: ShowtimeSeatStatus.BOOKED },
        data: { status: ShowtimeSeatStatus.AVAILABLE, bookingId: null },
      });
      await tx.payment.updateMany({
        where: { bookingId, status: "SUCCEEDED" },
        data: { status: "REFUNDED" },
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED },
        include: bookingInclude,
      });
    });
    return serializeBooking(booking);
  },

  async expire(bookingId: string, now = new Date()) {
    return runSerializable(async (tx) => {
      await lockingRepository.lockBooking(tx, bookingId);
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.status !== BookingStatus.PENDING_PAYMENT || !booking.expiresAt || booking.expiresAt > now) {
        return false;
      }
      await releasePendingBooking(tx, bookingId, BookingStatus.EXPIRED);
      return true;
    });
  },
};
