import { ShowtimeStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";

export const showtimeService = {
  async list(input: {
    movieId?: string;
    city?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where = {
      status: ShowtimeStatus.SCHEDULED,
      ...(input.movieId ? { movieId: input.movieId } : {}),
      ...(input.city ? { screen: { theater: { city: { equals: input.city, mode: "insensitive" as const } } } } : {}),
      ...(input.from || input.to ? { startsAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.showtime.findMany({
        where,
        include: { movie: true, screen: { include: { theater: true } } },
        orderBy: { startsAt: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.showtime.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  },

  async seatMap(showtimeId: string) {
    const showtime = await prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: {
        movie: true,
        screen: { include: { theater: true } },
        showtimeSeats: { include: { seat: true } },
      },
    });
    if (!showtime) throw new ApiError(404, "SHOWTIME_NOT_FOUND", "Showtime was not found.");

    return {
      id: showtime.id,
      startsAt: showtime.startsAt,
      priceCents: showtime.priceCents,
      movie: showtime.movie,
      theater: showtime.screen.theater,
      screen: { id: showtime.screen.id, name: showtime.screen.name },
      seats: showtime.showtimeSeats
        .map(({ seat, status }) => ({ id: seat.id, rowLabel: seat.rowLabel, number: seat.number, seatType: seat.seatType, status }))
        .sort((left, right) => left.rowLabel.localeCompare(right.rowLabel) || left.number - right.number),
    };
  },
};
