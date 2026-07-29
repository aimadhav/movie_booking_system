# System Overview

## Runtime topology

```mermaid
flowchart LR
  Client[Client] -->|JWT + REST| Api[Express API]
  Api --> Auth[Authentication and RBAC]
  Api --> Services[Application services]
  Services --> Prisma[Prisma + targeted SQL]
  Prisma --> Db[(PostgreSQL)]
  Worker[Expiry worker] --> Db
```

The API is stateless. Multiple API instances can serve requests because PostgreSQL owns the booking truth, locks, and constraints. The worker can run in a separate process; its expiry operation is safe to retry.

## Module boundaries

| Module | Owns |
| --- | --- |
| `auth` | registration, password hashing, JWT issuance |
| `admin` | movies, theatres, screens, seats, showtimes, initial seat inventory |
| `catalog` / `showtimes` | customer-facing browse and seat-map reads |
| `bookings` | reservation transaction, state transitions, cancellation, expiry |
| `payments` | mock payment confirmation and payment idempotency |
| `jobs` | scheduled discovery of expired pending bookings |

## Reservation sequence

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant P as PostgreSQL

  C->>A: Reserve seats + Idempotency-Key
  A->>P: Begin SERIALIZABLE transaction
  A->>P: Advisory lock on user + key
  A->>P: Return original booking if key exists
  A->>P: Lock requested ShowtimeSeat rows FOR UPDATE
  A->>P: Create booking, history, and temporary holds
  A->>P: Mark inventory HELD
  A->>P: Commit
  A-->>C: PENDING_PAYMENT booking + expiry time
```

No payment-provider call occurs while database rows are locked. Confirmation is a separate transaction.

