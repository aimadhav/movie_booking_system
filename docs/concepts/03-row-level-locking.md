# Row-Level Locking

Two customers can read an available seat before either customer writes. That is a race condition.

```mermaid
sequenceDiagram
  participant A as Customer A
  participant B as Customer B
  participant DB as PostgreSQL
  A->>DB: SELECT A1 FOR UPDATE
  DB-->>A: Lock granted
  B->>DB: SELECT A1 FOR UPDATE
  DB-->>B: Wait for lock
  A->>DB: Set A1 HELD; COMMIT
  DB-->>B: Lock granted; A1 now HELD
  B-->>B: Return 409 SEAT_UNAVAILABLE
```

The service locks `ShowtimeSeat`, not `Seat`, because availability is scoped to one showtime. It sorts seat IDs before locking. Stable order reduces deadlock risk when requests overlap on several seats.

**Trade-off:** locks make the losing request wait briefly. That small wait is preferable to selling the same ticket twice.

