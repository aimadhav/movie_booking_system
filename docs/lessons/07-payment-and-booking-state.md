# Step 7 — Payment and booking state

## Concept

A state machine lists legal states and transitions. It prevents “impossible” states such as confirming an expired booking. External side effects, such as payment calls, require explicit failure handling because they cannot be rolled back by our database transaction.

## Application in this project

```text
PENDING_PAYMENT → CONFIRMED
PENDING_PAYMENT → CANCELLED | EXPIRED
CONFIRMED       → CANCELLED  (only if our cancellation policy allows it)
```

The client sends a command—`confirm` or `cancel`—not a status value. The service verifies the current state before changing it.

## Code together

1. Define allowed transitions in one place.
2. Implement a mock payment confirmation with a payment idempotency key.
3. Confirm the booking and change held inventory to `BOOKED` atomically.
4. Implement cancellation according to a documented policy.
5. Test every allowed and forbidden transition.

## Review questions

1. Why is `PATCH /bookings/:id { status: "CONFIRMED" }` weak API design?
2. What happens if the payment provider succeeds but our process crashes before storing the result?
3. Why should payment confirmation also be idempotent?

## Completion check

Only legal transitions succeed, payment retries are safe, and a confirmed booking owns booked seat inventory.

