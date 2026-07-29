# Code Walkthrough Exercises

## Reservation transaction

Open `src/modules/bookings/booking.service.ts` and explain, in order:

1. why seat IDs are sorted;
2. why the idempotency advisory lock comes before the existing-booking lookup;
3. why `FOR UPDATE` targets `ShowtimeSeat`;
4. why booking, history, holds, and inventory update are in one transaction;
5. why external payment work is absent from this method.

## Failure drills

| Scenario | Expected outcome |
| --- | --- |
| Same request retried with same key | original booking returned |
| Different customer requests a held seat | `409 SEAT_UNAVAILABLE` |
| Worker runs twice | second run skips already expired booking |
| Payment arrives after expiry | rejected as expired |
| Customer cancels before payment | held inventory released |
| Customer cancels confirmed future booking | inventory released; mock payment refunded |

## Live explanation exercise

Start a timer and explain `booking.service.ts` without reading this document. Then compare your explanation to the source and identify any step you could not justify.

