# Booking State Machine

Clients submit commands such as `reserve`, `confirm`, and `cancel`; they never set an arbitrary status.

```mermaid
stateDiagram-v2
  [*] --> PENDING_PAYMENT: reserve
  PENDING_PAYMENT --> CONFIRMED: mock payment succeeds
  PENDING_PAYMENT --> CANCELLED: customer cancels
  PENDING_PAYMENT --> EXPIRED: deadline passes
  CONFIRMED --> CANCELLED: before showtime, mock refund
```

`assertBookingTransition` is a small pure function with unit tests. Keeping legal transitions in one place prevents endpoints from drifting into inconsistent rules.

On expiry or pending cancellation, held seats become available. On confirmed cancellation, booked seats are released only before the showtime and the mock payment is marked refunded.

