import { BookingStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { bookingService } from "../modules/bookings/booking.service.js";

export const expireBookings = async (now = new Date()) => {
  const candidates = await prisma.booking.findMany({
    where: { status: BookingStatus.PENDING_PAYMENT, expiresAt: { lte: now } },
    select: { id: true },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });
  let expired = 0;
  for (const candidate of candidates) {
    if (await bookingService.expire(candidate.id, now)) expired += 1;
  }
  return { scanned: candidates.length, expired };
};
