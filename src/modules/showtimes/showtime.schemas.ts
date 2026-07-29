import { z } from "zod";

export const showtimeQuerySchema = z.object({
  movieId: z.string().uuid().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).refine((value) => !value.from || !value.to || value.to > value.from, {
  message: "The end time must be after the start time.",
});
