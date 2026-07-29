import { ShowtimeStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";

export const adminService = {
  createMovie: (input: { title: string; description?: string; durationMin: number; rating?: string }) =>
    prisma.movie.create({ data: input }),

  async updateMovie(id: string, input: Partial<{ title: string; description?: string; durationMin: number; rating?: string }>) {
    const movie = await prisma.movie.findUnique({ where: { id } });
    if (!movie) throw new ApiError(404, "MOVIE_NOT_FOUND", "Movie was not found.");
    return prisma.movie.update({ where: { id }, data: input });
  },

  createTheater: (input: { name: string; city: string; address: string }) =>
    prisma.theater.create({ data: input }),

  async updateTheater(id: string, input: Partial<{ name: string; city: string; address: string }>) {
    const theater = await prisma.theater.findUnique({ where: { id } });
    if (!theater) throw new ApiError(404, "THEATER_NOT_FOUND", "Theater was not found.");
    return prisma.theater.update({ where: { id }, data: input });
  },

  async createScreen(input: { theaterId: string; name: string }) {
    const theater = await prisma.theater.findUnique({ where: { id: input.theaterId } });
    if (!theater) throw new ApiError(404, "THEATER_NOT_FOUND", "Theater was not found.");
    return prisma.screen.create({ data: input });
  },

  async updateScreen(id: string, input: { name?: string }) {
    const screen = await prisma.screen.findUnique({ where: { id } });
    if (!screen) throw new ApiError(404, "SCREEN_NOT_FOUND", "Screen was not found.");
    return prisma.screen.update({ where: { id }, data: input });
  },

  async addSeats(screenId: string, input: { seats: Array<{ rowLabel: string; number: number; seatType: string }> }) {
    const screen = await prisma.screen.findUnique({ where: { id: screenId } });
    if (!screen) throw new ApiError(404, "SCREEN_NOT_FOUND", "Screen was not found.");
    await prisma.seat.createMany({ data: input.seats.map((seat) => ({ screenId, ...seat })) });
    return prisma.seat.findMany({ where: { screenId }, orderBy: [{ rowLabel: "asc" }, { number: "asc" }] });
  },

  async createShowtime(input: { movieId: string; screenId: string; startsAt: Date; priceCents: number }) {
    return prisma.$transaction(async (tx) => {
      const [movie, screen] = await Promise.all([
        tx.movie.findUnique({ where: { id: input.movieId } }),
        tx.screen.findUnique({ where: { id: input.screenId }, include: { seats: true } }),
      ]);
      if (!movie) throw new ApiError(404, "MOVIE_NOT_FOUND", "Movie was not found.");
      if (!screen) throw new ApiError(404, "SCREEN_NOT_FOUND", "Screen was not found.");
      if (screen.seats.length === 0) {
        throw new ApiError(409, "SCREEN_HAS_NO_SEATS", "Add seats before scheduling a showtime.");
      }

      const showtime = await tx.showtime.create({ data: { ...input, status: ShowtimeStatus.SCHEDULED } });
      await tx.showtimeSeat.createMany({
        data: screen.seats.map((seat) => ({ showtimeId: showtime.id, seatId: seat.id })),
      });
      return showtime;
    });
  },

  async cancelShowtime(showtimeId: string) {
    return prisma.$transaction(async (tx) => {
      const showtime = await tx.showtime.findUnique({ where: { id: showtimeId } });
      if (!showtime) throw new ApiError(404, "SHOWTIME_NOT_FOUND", "Showtime was not found.");
      if (showtime.status === ShowtimeStatus.CANCELLED) return showtime;

      const activeBookings = await tx.booking.findMany({
        where: { showtimeId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
        select: { id: true },
      });
      const bookingIds = activeBookings.map((booking) => booking.id);
      if (bookingIds.length > 0) {
        await tx.booking.updateMany({ where: { id: { in: bookingIds } }, data: { status: "CANCELLED", expiresAt: null } });
        await tx.payment.updateMany({ where: { bookingId: { in: bookingIds }, status: "SUCCEEDED" }, data: { status: "REFUNDED" } });
        await tx.seatHold.deleteMany({ where: { bookingId: { in: bookingIds } } });
      }
      await tx.showtimeSeat.updateMany({
        where: { showtimeId },
        data: { status: "AVAILABLE", bookingId: null },
      });
      return tx.showtime.update({ where: { id: showtimeId }, data: { status: ShowtimeStatus.CANCELLED } });
    });
  },
};
