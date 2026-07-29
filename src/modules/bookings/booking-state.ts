import { BookingStatus } from "@prisma/client";

import { ApiError } from "../../utils/api-error.js";

const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.EXPIRED],
  CONFIRMED: [BookingStatus.CANCELLED],
  CANCELLED: [],
  EXPIRED: [],
};

export const assertBookingTransition = (from: BookingStatus, to: BookingStatus) => {
  if (!allowedTransitions[from].includes(to)) {
    throw new ApiError(409, "INVALID_BOOKING_TRANSITION", `Cannot transition a booking from ${from} to ${to}.`);
  }
};
