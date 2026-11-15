import {
  BookingStatus,
  PaymentEventStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { runSerializable } from "../../lib/transaction.js";
import { lockingRepository } from "../../repositories/locking.repository.js";
import { ApiError } from "../../utils/api-error.js";

export const providerEventSchema = z
  .object({
    eventId: z.string().min(8).max(255),
    providerRef: z.string().min(8).max(255),
    bookingId: z.string().uuid(),
    amountCents: z.number().int().positive().max(2_147_483_647),
    currency: z.literal("INR"),
    method: z.enum(["UPI", "CARD", "WALLET"]),
    outcome: z.enum(["SUCCEEDED", "FAILED"]),
  })
  .strict();

export type MockProviderEvent = z.infer<typeof providerEventSchema>;

const webhookSecret = () => {
  if (env.PAYMENT_WEBHOOK_SECRET) return env.PAYMENT_WEBHOOK_SECRET;
  if (env.NODE_ENV !== "production")
    return "local-only-mock-provider-signing-secret-2026";
  throw new ApiError(
    503,
    "WEBHOOK_NOT_CONFIGURED",
    "Payment webhook signing is not configured.",
  );
};

export const signProviderEvent = (
  raw: Buffer,
  timestamp = Math.floor(Date.now() / 1000),
) => {
  const signature = createHmac("sha256", webhookSecret())
    .update(`${timestamp}.`)
    .update(raw)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
};

export const verifyProviderEvent = (
  raw: Buffer,
  signature: string | undefined,
  now = Date.now(),
) => {
  if (!Buffer.isBuffer(raw))
    throw new ApiError(
      400,
      "INVALID_WEBHOOK_BODY",
      "Send the signed raw JSON body with application/json content type.",
    );
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature ?? "");
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) {
    throw new ApiError(
      400,
      "INVALID_WEBHOOK_SIGNATURE",
      "Webhook signature is invalid or outside the replay window.",
    );
  }
  const expected = signProviderEvent(raw, Number(match[1])).split("v1=")[1];
  if (
    !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(match[2], "hex"))
  ) {
    throw new ApiError(
      400,
      "INVALID_WEBHOOK_SIGNATURE",
      "Webhook signature is invalid.",
    );
  }
  try {
    return providerEventSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ApiError(
        400,
        "INVALID_WEBHOOK_JSON",
        "Webhook body must be valid JSON.",
      );
    throw error;
  }
};

export const receiveProviderEvent = async (
  raw: Buffer,
  signature: string | undefined,
  options: { manualOnly?: boolean; labScenario?: string } = {},
) => {
  const payload = verifyProviderEvent(raw, signature);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return runSerializable(async (tx) => {
    await lockingRepository.acquireAdvisoryLock(
      tx,
      `provider-event:${payload.eventId}`,
    );
    const existing = await tx.paymentEvent.findUnique({
      where: { providerEventId: payload.eventId },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ApiError(
          409,
          "EVENT_ID_REUSED",
          "A provider event ID cannot identify different event content.",
        );
      }
      return tx.paymentEvent.update({
        where: { id: existing.id },
        data: { deliveryCount: { increment: 1 } },
      });
    }
    if (
      !(await tx.booking.findUnique({
        where: { id: payload.bookingId },
        select: { id: true },
      }))
    ) {
      throw new ApiError(
        404,
        "BOOKING_NOT_FOUND",
        "The provider event references an unknown booking.",
      );
    }
    return tx.paymentEvent.create({
      data: {
        providerEventId: payload.eventId,
        providerRef: payload.providerRef,
        bookingId: payload.bookingId,
        payload,
        payloadHash,
        manualOnly: options.manualOnly ?? false,
        labScenario: options.labScenario,
      },
    });
  });
};

export const processPaymentEvent = async (
  eventId: string,
  options: { includeManual?: boolean; now?: Date } = {},
) => {
  const now = options.now ?? new Date();
  try {
    return await runSerializable(async (tx) => {
      const claimed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "PaymentEvent" WHERE id = ${eventId}::uuid FOR UPDATE SKIP LOCKED
      `);
      if (!claimed.length) return null;
      const event = await tx.paymentEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      if (
        event.status !== PaymentEventStatus.RECEIVED ||
        (event.manualOnly && !options.includeManual) ||
        event.nextAttemptAt > now
      )
        return event;
      const payload = providerEventSchema.parse(event.payload);
      await lockingRepository.lockBooking(tx, event.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: event.bookingId },
        include: { seats: true },
      });
      const finish = (
        status: PaymentEventStatus,
        reason: string | null = null,
      ) =>
        tx.paymentEvent.update({
          where: { id: event.id },
          data: {
            status,
            lastError: reason,
            processedAt: now,
            attempts: { increment: 1 },
          },
        });

      if (payload.amountCents !== booking.totalCents)
        return finish(PaymentEventStatus.REJECTED, "AMOUNT_MISMATCH");
      const previous = await tx.payment.findUnique({
        where: { providerRef: payload.providerRef },
      });
      if (
        previous &&
        (previous.bookingId !== booking.id ||
          previous.amountCents !== payload.amountCents)
      ) {
        return finish(
          PaymentEventStatus.REJECTED,
          "PROVIDER_REFERENCE_MISMATCH",
        );
      }
      if (previous?.status === PaymentStatus.REFUNDED)
        return finish(PaymentEventStatus.PROCESSED, "ALREADY_REFUNDED");
      if (previous?.status === PaymentStatus.SUCCEEDED) {
        return finish(
          booking.status === BookingStatus.CONFIRMED
            ? PaymentEventStatus.PROCESSED
            : PaymentEventStatus.REFUND_REQUIRED,
          booking.status === BookingStatus.CONFIRMED
            ? "PAYMENT_ALREADY_APPLIED"
            : "PAYMENT_REQUIRES_COMPENSATION",
        );
      }

      await tx.payment.upsert({
        where: { providerRef: payload.providerRef },
        create: {
          bookingId: booking.id,
          providerRef: payload.providerRef,
          amountCents: payload.amountCents,
          status: payload.outcome,
          method: payload.method,
          idempotencyKey: `webhook:${payload.providerRef}`,
        },
        update: { status: payload.outcome },
      });
      if (payload.outcome === "FAILED")
        return finish(PaymentEventStatus.PROCESSED);

      const seats = await lockingRepository.lockShowtimeSeats(
        tx,
        booking.showtimeId,
        booking.seats.map((seat) => seat.seatId).sort(),
      );
      const canConfirm =
        booking.status === BookingStatus.PENDING_PAYMENT &&
        booking.expiresAt &&
        booking.expiresAt > now &&
        seats.length === booking.seats.length &&
        seats.length > 0 &&
        seats.every(
          (seat) => seat.status === "HELD" && seat.bookingId === booking.id,
        );

      if (!canConfirm) {
        if (
          booking.status === BookingStatus.PENDING_PAYMENT &&
          booking.expiresAt &&
          booking.expiresAt <= now
        ) {
          await tx.showtimeSeat.updateMany({
            where: { bookingId: booking.id, status: "HELD" },
            data: { status: "AVAILABLE", bookingId: null },
          });
          await tx.seatHold.deleteMany({ where: { bookingId: booking.id } });
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: "EXPIRED", expiresAt: null },
          });
        }
        return finish(
          PaymentEventStatus.REFUND_REQUIRED,
          "SEATS_CANNOT_BE_FULFILLED",
        );
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CONFIRMED", expiresAt: null },
      });
      await tx.showtimeSeat.updateMany({
        where: { bookingId: booking.id, status: "HELD" },
        data: { status: "BOOKED" },
      });
      await tx.seatHold.deleteMany({ where: { bookingId: booking.id } });
      return finish(PaymentEventStatus.PROCESSED);
    });
  } catch (error) {
    const event = await prisma.paymentEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.status !== "RECEIVED") throw error;
    const exhausted = event.attempts + 1 >= 5;
    await prisma.paymentEvent.updateMany({
      where: { id: eventId, status: "RECEIVED" },
      data: {
        attempts: { increment: 1 },
        status: exhausted ? "DEAD_LETTER" : "RECEIVED",
        nextAttemptAt: new Date(
          now.getTime() + Math.min(300_000, 5_000 * 2 ** event.attempts),
        ),
        lastError: error instanceof Error ? error.name : "PROCESSING_ERROR",
      },
    });
    throw error;
  }
};

export const processPaymentInbox = async () => {
  const candidates = await prisma.paymentEvent.findMany({
    where: {
      status: "RECEIVED",
      manualOnly: false,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { receivedAt: "asc" },
    take: 25,
    select: { id: true },
  });
  let processed = 0;
  let failed = 0;
  for (const event of candidates) {
    try {
      const result = await processPaymentEvent(event.id);
      if (result && result.status !== "RECEIVED") processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: candidates.length, processed, failed };
};
