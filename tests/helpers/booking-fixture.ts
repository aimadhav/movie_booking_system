import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";

export const createBookingFixture = async (userCount = 2, seatCount = 3) => {
  const suffix = randomUUID();
  const users = await Promise.all(
    Array.from({ length: userCount }, (_, index) =>
      prisma.user.create({
        data: {
          email: `test-${suffix}-${index}@example.test`,
          passwordHash: "not-used",
        },
      }),
    ),
  );
  const movie = await prisma.movie.create({
    data: { title: `Test ${suffix}`, durationMin: 120 },
  });
  const theater = await prisma.theater.create({
    data: { name: `Test ${suffix}`, city: "Test", address: "Test fixture" },
  });
  const screen = await prisma.screen.create({
    data: { theaterId: theater.id, name: "Test screen" },
  });
  const seats = await Promise.all(
    Array.from({ length: seatCount }, (_, index) =>
      prisma.seat.create({
        data: { screenId: screen.id, rowLabel: "T", number: index + 1 },
      }),
    ),
  );
  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      screenId: screen.id,
      startsAt: new Date(Date.now() + 86_400_000),
      priceCents: 29900,
    },
  });
  await prisma.showtimeSeat.createMany({
    data: seats.map((seat) => ({ showtimeId: showtime.id, seatId: seat.id })),
  });
  return { users, movie, theater, screen, seats, showtime };
};

export type BookingFixture = Awaited<ReturnType<typeof createBookingFixture>>;

export const cleanupBookingFixture = async (fixture: BookingFixture) => {
  await prisma.$transaction(async (tx) => {
    const where = { booking: { showtimeId: fixture.showtime.id } };
    await tx.paymentEvent.deleteMany({ where });
    await tx.payment.deleteMany({ where });
    await tx.seatHold.deleteMany({
      where: { showtimeId: fixture.showtime.id },
    });
    await tx.showtimeSeat.deleteMany({
      where: { showtimeId: fixture.showtime.id },
    });
    await tx.booking.deleteMany({ where: { showtimeId: fixture.showtime.id } });
    await tx.showtime.delete({ where: { id: fixture.showtime.id } });
    await tx.theater.delete({ where: { id: fixture.theater.id } });
    await tx.movie.delete({ where: { id: fixture.movie.id } });
    await tx.user.deleteMany({
      where: { id: { in: fixture.users.map((user) => user.id) } },
    });
  });
};
