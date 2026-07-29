# Step 1 — Domain model and invariants

## Concept

A **domain model** represents the real-world things and relationships the system must understand. An **invariant** is a rule that must be true after every successful operation, even during failures or concurrent requests.

Database constraints are valuable because they protect invariants even if a future API endpoint contains a bug.

## Application in this project

The key modelling decision is to separate a physical `Seat` from a `ShowtimeSeat`.

```text
Seat          = chair A10 in Screen 1
ShowtimeSeat  = chair A10 for the 7:00 PM show of a specific movie
```

Availability belongs on `ShowtimeSeat`, because A10 can be booked at 7:00 PM and available at 10:00 PM.

## Invariants we must protect

- A screen has no duplicate physical seat label: `(screenId, rowLabel, number)` is unique.
- A showtime has at most one inventory row per physical seat: `(showtimeId, seatId)` is unique.
- A booking cannot list the same seat twice.
- A retry from the same user with the same idempotency key creates at most one booking.

## Code together

1. Draw the entities and their relationships.
2. Read `prisma/schema.prisma` one model at a time.
3. For each `@@unique` or `@@index`, write down what problem it solves.
4. Create the first migration only after we agree that the model represents the business rules.

## Review questions

1. Why is `available: boolean` on `Seat` incorrect?
2. Which rule is enforced by `UNIQUE(showtimeId, seatId)`?
3. What can an application-level validation check miss that a database constraint catches?

## Completion check

You can describe why availability is a property of the showtime-seat relationship and identify the database constraint that prevents duplicate inventory rows.

