import { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export type LockedShowtimeSeat = {
  id: string;
  seatId: string;
  status: string;
  bookingId: string | null;
};

export const lockingRepository = {
  async acquireAdvisoryLock(tx: TransactionClient, key: string) {
    await tx.$queryRaw<{ acquired: boolean }[]>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS acquired`,
    );
  },

  lockShowtimeSeats(tx: TransactionClient, showtimeId: string, seatIds: string[]) {
    const identifiers = seatIds.map((id) => Prisma.sql`${id}::uuid`);
    return tx.$queryRaw<LockedShowtimeSeat[]>(Prisma.sql`
      SELECT id, "seatId", status::text, "bookingId"
      FROM "ShowtimeSeat"
      WHERE "showtimeId" = ${showtimeId}::uuid
        AND "seatId" IN (${Prisma.join(identifiers)})
      ORDER BY "seatId"
      FOR UPDATE
    `);
  },

  async lockBooking(tx: TransactionClient, bookingId: string) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM "Booking" WHERE id = ${bookingId}::uuid FOR UPDATE
    `);
  },
};
