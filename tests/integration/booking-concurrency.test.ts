import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import { bookingService } from "../../src/modules/bookings/booking.service.js";

const suffix = Date.now().toString();
let userId: string;
let movieId: string;
let theaterId: string;
let showtimeId: string;
let seatId: string;

describe("concurrent reservations", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `concurrency-${suffix}@example.test`, passwordHash: "not-used" } });
    userId = user.id;
    const movie = await prisma.movie.create({ data: { title: `Concurrency ${suffix}`, durationMin: 120 } });
    movieId = movie.id;
    const theater = await prisma.theater.create({ data: { name: `Theater ${suffix}`, city: "Test", address: "Test address" } });
    theaterId = theater.id;
    const screen = await prisma.screen.create({ data: { theaterId: theater.id, name: "One" } });
    const seat = await prisma.seat.create({ data: { screenId: screen.id, rowLabel: "A", number: 1 } });
    seatId = seat.id;
    const showtime = await prisma.showtime.create({
      data: { movieId: movie.id, screenId: screen.id, startsAt: new Date(Date.now() + 86_400_000), priceCents: 25000 },
    });
    showtimeId = showtime.id;
    await prisma.showtimeSeat.create({ data: { showtimeId, seatId } });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.showtimeSeat.deleteMany({ where: { showtimeId } });
      await tx.booking.deleteMany({ where: { userId } });
      await tx.showtime.deleteMany({ where: { id: showtimeId } });
      await tx.movie.deleteMany({ where: { id: movieId } });
      await tx.theater.deleteMany({ where: { id: theaterId } });
      await tx.user.deleteMany({ where: { id: userId } });
    });
    await prisma.$disconnect();
  });

  it("allows only one hold for the same showtime seat", async () => {
    const results = await Promise.allSettled([
      bookingService.reserve({ userId, showtimeId, seatIds: [seatId], idempotencyKey: `request-a-${suffix}` }),
      bookingService.reserve({ userId, showtimeId, seatIds: [seatId], idempotencyKey: `request-b-${suffix}` }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const inventory = await prisma.showtimeSeat.findUniqueOrThrow({ where: { showtimeId_seatId: { showtimeId, seatId } } });
    expect(inventory.status).toBe("HELD");
  });
});
