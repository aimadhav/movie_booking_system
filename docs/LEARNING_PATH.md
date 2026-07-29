# Movie Booking System — Pair-Programming Learning Path

This repository is a learning project, not a code dump. We will build it in small vertical slices and use the same loop every time:

```text
1. Learn the concept
2. Apply it to the movie-booking problem
3. Design the smallest correct change
4. Write the code together
5. Review the code and test the invariant
6. Explain the trade-off in interview language
```

You should drive the keyboard when possible. I will explain terms, ask design questions, suggest a small next change, and review your solution. We do not advance merely because code compiles; we advance when you can explain *why* it is correct.

## Roadmap

| Step | Lesson | Deliverable | Main interview skill |
| --- | --- | --- | --- |
| 1 | [Domain model and invariants](lessons/01-domain-model-and-invariants.md) | ERD and database rules | Data modelling and normalization |
| 2 | [Project foundation](lessons/02-project-foundation.md) | Runnable API and local database | Layered architecture and configuration |
| 3 | [Identity and RBAC](lessons/03-authentication-and-rbac.md) | Register/login and roles | Authentication vs authorization |
| 4 | [Catalogue and scheduling](lessons/04-catalogue-and-scheduling.md) | Admin and customer catalogue APIs | REST design, validation, indexing |
| 5 | [Showtime seat inventory](lessons/05-showtime-seat-inventory.md) | Per-showtime availability | Relationship modelling and invariants |
| 6 | [Safe reservations](lessons/06-concurrency-safe-reservations.md) | Transactional seat holds | ACID, locks, idempotency |
| 7 | [Payment and state transitions](lessons/07-payment-and-booking-state.md) | Mock confirmation and cancellation | State machines and external side effects |
| 8 | [Reservation expiration](lessons/08-expiration-worker.md) | Idempotent cleanup worker | Background jobs and failure recovery |
| 9 | [Quality and recruiter polish](lessons/09-quality-and-recruiter-polish.md) | Tests, observability, docs | How to demonstrate engineering maturity |
| 10 | [Frontend as a system-design demo](lessons/10-frontend-as-system-design-demo.md) | CineLoop booking UI and concurrency lab | Making backend guarantees visible |
| 11 | [Mock payment gateway and reconciliation](lessons/11-mock-payment-gateway-and-reconciliation.md) | Decline, retry, confirmation, and booking history | Payment idempotency and distributed-system failure modes |

## Rules for our sessions

- We begin every new step by reading its lesson document—not by editing files.
- We write one small, reviewable change at a time.
- We test the failure case, not only the happy path.
- We commit only after you can describe what changed and why.
- We keep a short "What I learned" note in each pull request or commit message.

## Definition of done for the project

The project is done when it can demonstrate—not simply claim—that:

- two clients cannot reserve the same showtime seat;
- retrying a request creates no duplicate booking;
- expired holds return inventory to availability;
- invalid state changes are rejected;
- failed payment attempts can be retried without losing the seat hold or duplicating a charge;
- confirmed payments appear from authoritative backend state in My Bookings;
- the API runs locally from documented commands; and
- the frontend visibly distinguishes live API data from portfolio demo data;
- you can clearly explain each guarantee to a recruiter.
