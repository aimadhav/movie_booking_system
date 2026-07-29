import { prisma } from "../../lib/prisma.js";

export const catalogService = {
  async listMovies(input: { page: number; pageSize: number; search?: string }) {
    const where = input.search
      ? { title: { contains: input.search, mode: "insensitive" as const } }
      : undefined;
    const [items, total] = await prisma.$transaction([
      prisma.movie.findMany({
        where,
        orderBy: { title: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.movie.count({ where }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  },
};
