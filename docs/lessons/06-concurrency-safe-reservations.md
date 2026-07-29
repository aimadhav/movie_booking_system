# Step 6 — Concurrency-safe reservations

## Concept

An ACID transaction makes a group of database changes succeed or fail together. A row-level lock prevents another transaction from changing the same inventory row until the first finishes. An idempotency key makes a retried command return its original result rather than create duplicate work.

## Application in this project

The reserve command takes `showtimeId`, `seatIds`, and `Idempotency-Key`. In one short transaction it:

1. finds any existing booking for `(userId, idempotencyKey)`;
2. locks the requested `ShowtimeSeat` rows in sorted seat-ID order;
3. verifies every row is available;
4. creates the pending booking and its seat records;
5. marks inventory `HELD` and sets an expiry; and
6. commits.

The payment-provider call is deliberately not inside this transaction.

## Code together

1. Define the reservation command and errors.
2. Implement the transaction using `SELECT … FOR UPDATE` through a safe repository method.
3. Return `409` for unavailable seats.
4. Add the idempotency lookup and unique constraint handling.
5. Write a concurrent integration test with two clients requesting the same seat.

## Review questions

1. What race occurs in “read availability, then update later” code without a lock?
2. Why lock seats in a stable sorted order?
3. What result should a network retry with the same idempotency key receive?
4. Why must a transaction be short?

## Completion check

Two simultaneous requests for the same seat result in exactly one successful hold, and a repeated request with the same key returns the original booking.

