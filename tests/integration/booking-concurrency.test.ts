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
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { bookingService } from "../../src/modules/bookings/booking.service.js";
import { paymentService } from "../../src/modules/payments/payment.service.js";
import {
  cleanupBookingFixture,
  createBookingFixture,
  type BookingFixture,
} from "../helpers/booking-fixture.js";

let fixture: BookingFixture;
let server: Server;
let baseUrl: string;
const reserveHttp = async (
  userIndex: number,
  seatIndexes: number[],
  key: string,
) => {
  const user = fixture.users[userIndex];
  const token = jwt.sign({ role: "CUSTOMER" }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "5m",
  });
  const response = await fetch(`${baseUrl}/bookings/reserve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": key,
    },
    body: JSON.stringify({
      showtimeId: fixture.showtime.id,
      seatIds: seatIndexes.map((index) => fixture.seats[index].id),
    }),
  });
  return { status: response.status, body: await response.json() };
};

describe("reservation concurrency and database invariants", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    fixture = await createBookingFixture(25, 3);
  });
  afterEach(async () => {
    vi.useRealTimers();
    if (fixture) await cleanupBookingFixture(fixture);
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.$disconnect();
  });

  it("gives 25 customers competing for one seat one HTTP success and 24 meaningful conflicts", async () => {
    const results = await Promise.all(
      fixture.users.map((_, index) =>
        reserveHttp(index, [0], `hot-seat-command-${index}`),
      ),
    );
    const winners = results.filter((result) => result.status === 201);
    const losers = results.filter((result) => result.status !== 201);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(24);
    for (const result of losers) {
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe("SEAT_UNAVAILABLE");
    }
    const inventory = await prisma.showtimeSeat.findUniqueOrThrow({
      where: {
        showtimeId_seatId: {
          showtimeId: fixture.showtime.id,
          seatId: fixture.seats[0].id,
        },
      },
    });
    expect(inventory).toMatchObject({
      status: "HELD",
      bookingId: winners[0].body.id,
    });
    expect(
      await prisma.booking.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(1);
    expect(
      await prisma.seatHold.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(1);
    expect(
      await prisma.bookingSeat.count({
        where: { booking: { showtimeId: fixture.showtime.id } },
      }),
    ).toBe(1);
  }, 60_000);

  it("returns one booking to 25 concurrent retries of the same command", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        reserveHttp(0, [0, 1], "same-logical-command"),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    expect(
      await prisma.booking.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(1);
    expect(
      await prisma.seatHold.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(2);
    expect(
      await prisma.bookingSeat.count({
        where: { booking: { showtimeId: fixture.showtime.id } },
      }),
    ).toBe(2);
    const changed = await reserveHttp(0, [2], "same-logical-command");
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  }, 60_000);

  it("reserves overlapping groups atomically without a partial losing booking", async () => {
    const results = await Promise.all([
      reserveHttp(0, [0, 1], "overlap-command-first"),
      reserveHttp(1, [2, 1], "overlap-command-second"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      results.find((result) => result.status === 409)?.body.error.code,
    ).toBe("SEAT_UNAVAILABLE");
    const inventory = await prisma.showtimeSeat.findMany({
      where: { showtimeId: fixture.showtime.id },
    });
    expect(inventory.filter((seat) => seat.status === "HELD")).toHaveLength(2);
    expect(
      inventory.filter(
        (seat) => seat.status === "AVAILABLE" && seat.bookingId === null,
      ),
    ).toHaveLength(1);
    expect(
      await prisma.booking.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(1);
    expect(
      await prisma.seatHold.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(2);
  });

  it("lets independent seats succeed and scopes idempotency keys to the customer", async () => {
    const results = await Promise.all([
      reserveHttp(0, [0], "same-key-different-customer"),
      reserveHttp(1, [1], "same-key-different-customer"),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].body.id).not.toBe(results[1].body.id);
    expect(
      await prisma.booking.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(2);
    expect(
      await prisma.seatHold.count({
        where: { showtimeId: fixture.showtime.id },
      }),
    ).toBe(2);
  });

  it("rejects payment at the deadline while expiration releases inventory", async () => {
    const booking = await bookingService.reserve({
      userId: fixture.users[0].id,
      showtimeId: fixture.showtime.id,
      seatIds: [fixture.seats[0].id],
      idempotencyKey: "expiry-race-reservation",
    });
    const deadline = new Date(booking.expiresAt!);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(deadline);
    const results = await Promise.allSettled([
      paymentService.confirmMock({
        userId: fixture.users[0].id,
        bookingId: booking.id,
        idempotencyKey: "expiry-race-payment",
      }),
      bookingService.expire(booking.id, deadline),
    ]);
    expect(results[0].status).toBe("rejected");
    if (results[0].status === "rejected")
      expect(results[0].reason.code).toMatch(
        /BOOKING_EXPIRED|INVALID_BOOKING_TRANSITION/,
      );
    expect(results[1]).toMatchObject({ status: "fulfilled", value: true });
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "EXPIRED" });
    expect(
      await prisma.payment.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await prisma.seatHold.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    expect(
      await prisma.showtimeSeat.findFirst({
        where: { showtimeId: fixture.showtime.id, seatId: fixture.seats[0].id },
      }),
    ).toMatchObject({ status: "AVAILABLE", bookingId: null });
  });

  it("does not release a confirmed seat when a stale expiration candidate is processed", async () => {
    const booking = await bookingService.reserve({
      userId: fixture.users[0].id,
      showtimeId: fixture.showtime.id,
      seatIds: [fixture.seats[0].id],
      idempotencyKey: "paid-before-expiration",
    });
    await paymentService.confirmMock({
      userId: fixture.users[0].id,
      bookingId: booking.id,
      idempotencyKey: "paid-before-expiration-payment",
    });
    expect(
      await bookingService.expire(booking.id, new Date(Date.now() + 3_600_000)),
    ).toBe(false);
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toMatchObject({ status: "CONFIRMED" });
    expect(
      await prisma.showtimeSeat.findFirst({
        where: { showtimeId: fixture.showtime.id, seatId: fixture.seats[0].id },
      }),
    ).toMatchObject({ status: "BOOKED", bookingId: booking.id });
  });
});
