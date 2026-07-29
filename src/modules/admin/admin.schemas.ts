import { z } from "zod";

const uuid = z.string().uuid();

export const movieSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).optional(),
  durationMin: z.number().int().positive().max(600),
  rating: z.string().trim().max(20).optional(),
});

export const theaterSchema = z.object({
  name: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(1_000),
});

export const screenSchema = z.object({
  theaterId: uuid,
  name: z.string().trim().min(1).max(100),
});

export const seatsSchema = z.object({
  seats: z.array(z.object({
    rowLabel: z.string().trim().min(1).max(8).transform((value) => value.toUpperCase()),
    number: z.number().int().positive().max(999),
    seatType: z.string().trim().min(1).max(30).default("STANDARD"),
  })).min(1).max(500),
}).refine((value) => new Set(value.seats.map((seat) => `${seat.rowLabel}:${seat.number}`)).size === value.seats.length, {
  message: "Seat labels must be unique within the request.",
});

export const showtimeSchema = z.object({
  movieId: uuid,
  screenId: uuid,
  startsAt: z.coerce.date().refine((value) => value > new Date(), "Showtime must be in the future."),
  priceCents: z.number().int().positive().max(1_000_000),
});

const nonEmpty = <Schema extends z.ZodObject<any>>(schema: Schema) => schema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided.",
);

export const movieUpdateSchema = nonEmpty(movieSchema);
export const theaterUpdateSchema = nonEmpty(theaterSchema);
export const screenUpdateSchema = nonEmpty(screenSchema.omit({ theaterId: true }));
