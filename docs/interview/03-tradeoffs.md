# Design Trade-offs

## Why PostgreSQL locks instead of Redis distributed locks?

PostgreSQL owns the inventory and can atomically lock, validate, and update it. Redis would add a second coordination system with lease-expiry and split-brain failure modes. Redis becomes useful later for caching catalogue reads, rate limiting, and fan-out; it is not needed to make the first booking system correct.

## Why a monolith instead of microservices?

Booking, payment state, and inventory require tight transactional consistency. A modular monolith keeps those invariants in one database transaction and reduces operational overhead. Service boundaries can be extracted later if measured scale or team ownership demands it.

## Why a mock payment gateway?

Real payment gateways require secrets, webhooks, reconciliation, PCI scope, and external failure handling. The mock endpoint still demonstrates the important local design: confirmation is idempotent and transitions inventory atomically. A real provider would be integrated behind a payment-provider interface plus webhook processing.

## Why retain BookingSeat and SeatHold as well as ShowtimeSeat?

`ShowtimeSeat` is the current mutable inventory record. `BookingSeat` keeps the immutable seat and price snapshot needed for receipts and history. `SeatHold` is a temporary indexed relation used for operational inspection and cleanup. `Booking.expiresAt` remains the booking deadline; the hold expiry is deliberately denormalized and written in the same transaction for direct hold queries.

## Why not allow arbitrary PATCH status updates?

`PATCH { status: "CONFIRMED" }` makes it too easy to skip payment validation or confirm an expired booking. Command endpoints map directly to legal actions and pass through one state-transition rule.

