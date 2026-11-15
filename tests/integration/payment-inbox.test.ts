import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";
import * as transactions from "../../src/lib/transaction.js";
import { bookingService } from "../../src/modules/bookings/booking.service.js";
import { paymentService } from "../../src/modules/payments/payment.service.js";
import {
  processPaymentEvent,
  receiveProviderEvent,
  signProviderEvent,
  type MockProviderEvent,
} from "../../src/modules/payments/payment-events.service.js";
import {
  cleanupBookingFixture,
  createBookingFixture,
  type BookingFixture,
} from "../helpers/booking-fixture.js";

const execute = promisify(execFile);
let fixture: BookingFixture;
let server: Server;
let baseUrl: string;
const reserve = () =>
  bookingService.reserve({
    userId: fixture.users[0].id,
    showtimeId: fixture.showtime.id,
    seatIds: [fixture.seats[0].id],
    idempotencyKey: `inbox-reserve-${randomUUID()}`,
  });
const payloadFor = (booking: {
  id: string;
  totalCents: number;
}): MockProviderEvent => ({
  eventId: `evt_${randomUUID()}`,
  providerRef: `provider_${randomUUID()}`,
  bookingId: booking.id,
  amountCents: booking.totalCents,
  currency: "INR",
  method: "CARD",
  outcome: "SUCCEEDED",
});
const deliver = (payload: MockProviderEvent, signature?: string) => {
  const raw = Buffer.from(JSON.stringify(payload));
  return fetch(`${baseUrl}/payments/webhooks/mock`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mock-signature": signature ?? signProviderEvent(raw),
    },
    body: raw,
  });
};

describe("signed payment inbox and recovery", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    fixture = await createBookingFixture();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (fixture) await cleanupBookingFixture(fixture);
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.$disconnect();
  });

  it("accepts five duplicate HTTP deliveries and applies one payment even with two competing processors", async () => {
    const booking = await reserve();
    const payload = payloadFor(booking);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => deliver(payload)),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const events = await prisma.paymentEvent.findMany({
      where: { bookingId: booking.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ deliveryCount: 5, status: "RECEIVED" });
    await Promise.all([
      processPaymentEvent(events[0].id),
      processPaymentEvent(events[0].id),
    ]);
    await processPaymentEvent(events[0].id);
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
    expect(
      await prisma.paymentEvent.findUnique({ where: { id: events[0].id } }),
    ).toMatchObject({ status: "PROCESSED", attempts: 1 });
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.seatHold.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await prisma.showtimeSeat.findFirst({
        where: { showtimeId: fixture.showtime.id, seatId: fixture.seats[0].id },
      }),
    ).toMatchObject({ status: "BOOKED", bookingId: booking.id });
  });

  it("rejects tampered bodies and stale signatures before storing any event", async () => {
    const booking = await reserve();
    const payload = payloadFor(booking);
    const raw = Buffer.from(JSON.stringify(payload));
    expect(
      (
        await deliver(
          { ...payload, amountCents: payload.amountCents + 1 },
          signProviderEvent(raw),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await deliver(
          payload,
          signProviderEvent(raw, Math.floor(Date.now() / 1000) - 600),
        )
      ).status,
    ).toBe(400);
    expect(
      await prisma.paymentEvent.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
  });

  it("rejects an event ID reused for different content", async () => {
    const payload = payloadFor(await reserve());
    expect((await deliver(payload)).status).toBe(200);
    const response = await deliver({
      ...payload,
      amountCents: payload.amountCents + 1,
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("EVENT_ID_REUSED");
    expect(
      await prisma.paymentEvent.count({
        where: { bookingId: payload.bookingId },
      }),
    ).toBe(1);
  });

  it("quarantines a validly signed event with the wrong amount", async () => {
    const booking = await reserve();
    const payload = {
      ...payloadFor(booking),
      amountCents: booking.totalCents + 1,
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const received = await receiveProviderEvent(raw, signProviderEvent(raw));
    expect(await processPaymentEvent(received.id)).toMatchObject({
      status: "REJECTED",
      lastError: "AMOUNT_MISMATCH",
    });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("processes an inbox event in a fresh Node process after the receiving process exits", async () => {
    const booking = await reserve();
    const helper = fileURLToPath(
      new URL("../helpers/payment-inbox-process.ts", import.meta.url),
    );
    const options = {
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 20_000,
      windowsHide: true,
    };
    const receiver = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        helper,
        "receive",
        JSON.stringify(payloadFor(booking)),
      ],
      options,
    );
    const received = JSON.parse(receiver.stdout.trim());
    expect(received.status).toBe("RECEIVED");
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "PENDING_PAYMENT" });
    const processor = await execute(
      process.execPath,
      ["--import", "tsx", helper, "process", received.id],
      options,
    );
    expect(JSON.parse(processor.stdout.trim()).status).toBe("PROCESSED");
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
  });

  it("flags a late charge for compensation and preserves the second customer's booked seat", async () => {
    const booking = await reserve();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await bookingService.expire(booking.id);
    const replacement = await bookingService.reserve({
      userId: fixture.users[1].id,
      showtimeId: fixture.showtime.id,
      seatIds: [fixture.seats[0].id],
      idempotencyKey: "replacement-reservation",
    });
    await paymentService.confirmMock({
      userId: fixture.users[1].id,
      bookingId: replacement.id,
      idempotencyKey: "replacement-payment",
    });
    const payload = payloadFor(booking);
    const raw = Buffer.from(JSON.stringify(payload));
    const event = await receiveProviderEvent(raw, signProviderEvent(raw));
    expect(await processPaymentEvent(event.id)).toMatchObject({
      status: "REFUND_REQUIRED",
    });
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "EXPIRED" });
    expect(
      await prisma.booking.findUnique({ where: { id: replacement.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.showtimeSeat.findFirst({
        where: { showtimeId: fixture.showtime.id, seatId: fixture.seats[0].id },
      }),
    ).toMatchObject({ status: "BOOKED", bookingId: replacement.id });
    expect(
      await prisma.payment.findFirst({ where: { bookingId: booking.id } }),
    ).toMatchObject({ status: "SUCCEEDED" });
    const replay = Buffer.from(
      JSON.stringify({ ...payload, eventId: `evt_${randomUUID()}` }),
    );
    const secondEvent = await receiveProviderEvent(
      replay,
      signProviderEvent(replay),
    );
    expect(await processPaymentEvent(secondEvent.id)).toMatchObject({
      status: "REFUND_REQUIRED",
    });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
  });

  it("deduplicates the same provider payment across different event IDs without downgrading success", async () => {
    const booking = await reserve();
    const payload = payloadFor(booking);
    for (const current of [
      payload,
      {
        ...payload,
        eventId: `evt_${randomUUID()}`,
        outcome: "FAILED" as const,
      },
    ]) {
      const raw = Buffer.from(JSON.stringify(current));
      const event = await receiveProviderEvent(raw, signProviderEvent(raw));
      await processPaymentEvent(event.id);
    }
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
    expect(
      await prisma.payment.findFirst({ where: { bookingId: booking.id } }),
    ).toMatchObject({ status: "SUCCEEDED" });
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
  });

  it("protects lab fixture creation with authentication and the ADMIN role", async () => {
    const url = `${baseUrl}/payments/lab/runs`;
    const body = JSON.stringify({ scenario: "DUPLICATE" });
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
      ).status,
    ).toBe(401);
    const token = jwt.sign({ role: "CUSTOMER" }, env.JWT_SECRET, {
      subject: fixture.users[0].id,
    });
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body,
        })
      ).status,
    ).toBe(403);
  });

  it("retains a failed processing attempt and succeeds after its backoff", async () => {
    const booking = await reserve();
    const raw = Buffer.from(JSON.stringify(payloadFor(booking)));
    const event = await receiveProviderEvent(raw, signProviderEvent(raw));
    vi.spyOn(transactions, "runSerializable").mockRejectedValueOnce(
      new Error("Injected transaction outage"),
    );
    await expect(processPaymentEvent(event.id)).rejects.toThrow(
      "Injected transaction outage",
    );
    vi.restoreAllMocks();
    const pending = await prisma.paymentEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(pending).toMatchObject({ status: "RECEIVED", attempts: 1 });
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await processPaymentEvent(event.id, {
        now: new Date(pending.nextAttemptAt.getTime() + 1),
      }),
    ).toMatchObject({ status: "PROCESSED", attempts: 2 });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(1);
  });

  it("keeps manual lab events paused until an explicit resume", async () => {
    const booking = await reserve();
    const raw = Buffer.from(JSON.stringify(payloadFor(booking)));
    const event = await receiveProviderEvent(raw, signProviderEvent(raw), {
      manualOnly: true,
      labScenario: "RESTART",
    });
    expect(await processPaymentEvent(event.id)).toMatchObject({
      status: "RECEIVED",
      attempts: 0,
    });
    expect(
      await processPaymentEvent(event.id, { includeManual: true }),
    ).toMatchObject({ status: "PROCESSED", attempts: 1 });
  });
});
