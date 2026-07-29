import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env before seeding.");
}

const prisma = new PrismaClient();

const seed = async () => {
  const passwordHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: "admin@cinema.local" },
    update: { role: "ADMIN", passwordHash },
    create: { email: "admin@cinema.local", passwordHash, role: "ADMIN" },
  });

  const movie = await prisma.movie.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      title: "The Last Orbit",
      description: "A crew races to return home after a deep-space mission goes wrong.",
      durationMin: 128,
      rating: "PG-13",
    },
  });

  let theater = await prisma.theater.findFirst({ where: { name: "Aurora Cinema", city: "Bengaluru" } });
  if (!theater) theater = await prisma.theater.create({ data: { name: "Aurora Cinema", city: "Bengaluru", address: "42 MG Road" } });
  const screen = await prisma.screen.upsert({
    where: { theaterId_name: { theaterId: theater.id, name: "Screen 1" } },
    update: {},
    create: { theaterId: theater.id, name: "Screen 1" },
  });

  await prisma.seat.createMany({
    data: ["A", "B", "C", "D"].flatMap((rowLabel) =>
      Array.from({ length: 8 }, (_, index) => ({
        screenId: screen.id,
        rowLabel,
        number: index + 1,
        seatType: rowLabel === "D" ? "PREMIUM" : "STANDARD",
      })),
    ),
    skipDuplicates: true,
  });

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  let showtime = await prisma.showtime.findFirst({ where: { movieId: movie.id, screenId: screen.id, startsAt } });
  if (!showtime) {
    showtime = await prisma.showtime.create({ data: { movieId: movie.id, screenId: screen.id, startsAt, priceCents: 29900 } });
  }
  const seats = await prisma.seat.findMany({ where: { screenId: screen.id } });
  await prisma.showtimeSeat.createMany({
    data: seats.map((seat) => ({ showtimeId: showtime.id, seatId: seat.id })),
    skipDuplicates: true,
  });

  console.log({ admin: "admin@cinema.local", password: "ChangeMe123!", showtimeId: showtime.id });
};

seed()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
