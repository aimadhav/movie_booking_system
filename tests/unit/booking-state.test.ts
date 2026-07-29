import { BookingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../src/utils/api-error.js";
import { assertBookingTransition } from "../../src/modules/bookings/booking-state.js";

describe("booking state transitions", () => {
  it("allows a pending booking to be confirmed", () => {
    expect(() => assertBookingTransition(BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)).not.toThrow();
  });

  it("prevents an expired booking from being confirmed", () => {
    expect(() => assertBookingTransition(BookingStatus.EXPIRED, BookingStatus.CONFIRMED)).toThrow(ApiError);
  });

  it("prevents a cancelled booking from being reused", () => {
    expect(() => assertBookingTransition(BookingStatus.CANCELLED, BookingStatus.PENDING_PAYMENT)).toThrow(
      "Cannot transition a booking from CANCELLED to PENDING_PAYMENT.",
    );
  });
});
