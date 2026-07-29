import { z } from "zod";

export const reserveSchema = z.object({
  showtimeId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(10),
}).refine((value) => new Set(value.seatIds).size === value.seatIds.length, {
  message: "A seat can only be requested once.",
  path: ["seatIds"],
});

export const idempotencyKeySchema = z.string().trim().min(8).max(255);
