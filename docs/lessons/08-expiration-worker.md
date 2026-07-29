# Step 8 — Reservation expiration worker

## Concept

Background jobs handle work that should happen independently of an incoming request. In production, jobs may run more than once, run late, or be interrupted. Therefore cleanup must be **idempotent**: running it repeatedly produces the same correct final state.

## Application in this project

The worker finds `PENDING_PAYMENT` bookings past `expiresAt`, locks their inventory, marks the booking `EXPIRED`, deletes its temporary hold records, and returns inventory to `AVAILABLE`.

## Code together

1. Define the expiry query and its index.
2. Implement one safe `expireBookings(now)` service operation.
3. Wrap it in a scheduler only after the service is tested.
4. Test running the worker twice and a payment/expiry race.
5. Add structured logs: number found, released, skipped, and failed.

## Review questions

1. Why should job logic be safe to run twice?
2. Why lock inventory during expiry?
3. What should happen if the worker runs five minutes late?

## Completion check

An unpaid expired hold becomes available, and rerunning the worker does not corrupt a confirmed booking.

