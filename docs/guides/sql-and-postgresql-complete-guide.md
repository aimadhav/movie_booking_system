# SQL and PostgreSQL Guide for This Project

This is a practical guide for backend interviews and the movie booking system. It does not try to list every SQL feature ever created. It teaches the parts you need to read, write, explain, and debug a production-style relational backend.

## 1. The mental model

SQL is a declarative language. You describe **what data you want**, and the database planner chooses how to retrieve it.

```sql
SELECT title, "durationMin"
FROM "Movie"
WHERE "durationMin" > 120
ORDER BY title;
```

The query says what rows and columns are wanted. PostgreSQL decides whether to scan the table, use an index, join a table, or choose another plan.

### Relational terms

| Term | Meaning | Booking example |
| --- | --- | --- |
| Table | Collection of related rows | `ShowtimeSeat` |
| Row | One record | A1 for one showtime |
| Column | One attribute | `status` |
| Primary key | Stable unique identity | `ShowtimeSeat.id` |
| Foreign key | Reference to another row | `Booking.userId` |
| Constraint | Rule enforced by database | unique showtime-seat pair |
| Index | Structure that speeds lookups | expiry-worker index |

## 2. Basic SELECT queries

### Select columns

```sql
SELECT id, email, role
FROM "User";
```

Avoid `SELECT *` in application queries unless every column is truly needed. Explicit columns document the API need and avoid loading sensitive values such as `passwordHash`.

### Filter rows with WHERE

```sql
SELECT id, title, "startsAt"
FROM "Showtime"
WHERE status = 'SCHEDULED'
  AND "startsAt" >= NOW();
```

Common operators:

```sql
WHERE price > 100
WHERE status IN ('HELD', 'BOOKED')
WHERE "expiresAt" IS NULL
WHERE title LIKE 'The%'
WHERE "startsAt" BETWEEN $1 AND $2
```

Use `IS NULL`, not `= NULL`. `NULL` means unknown or absent, so normal equality cannot compare it.

### Sort and limit

```sql
SELECT id, title
FROM "Movie"
ORDER BY title ASC
LIMIT 20 OFFSET 40;
```

`OFFSET` pagination is easy but becomes slower for very deep pages because PostgreSQL still has to walk past skipped rows. Cursor pagination is often better for huge, frequently changing lists.

## 3. INSERT, UPDATE, and DELETE

### Insert

```sql
INSERT INTO "Movie" (title, "durationMin", rating)
VALUES ('The Last Orbit', 128, 'PG-13')
RETURNING id, title;
```

`RETURNING` lets PostgreSQL return created or updated data without a second query.

### Update

```sql
UPDATE "ShowtimeSeat"
SET status = 'HELD', "bookingId" = $1
WHERE id = $2
  AND status = 'AVAILABLE'
RETURNING id, status, "bookingId";
```

That conditional update is a simple form of optimistic concurrency control. It changes the row only if it remains available. This project uses row locks because seat contention is a first-class concern and multiple dependent writes must be coordinated.

### Delete

```sql
DELETE FROM "SeatHold"
WHERE "bookingId" = $1;
```

Deleting is not always the correct business action. Delete temporary `SeatHold` rows after expiry, but retain `Booking` and `BookingSeat` history using state changes such as `CANCELLED` or `EXPIRED`.

## 4. Primary keys, foreign keys, and constraints

### Primary key

```sql
CREATE TABLE "Movie" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL
);
```

A primary key identifies one row. UUIDs are convenient when API servers can create IDs independently. Sequential IDs are smaller and friendlier to indexes but expose approximate record volume and require central sequence allocation.

### Foreign key

```sql
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"(id);
```

This prevents a booking from referencing a user that does not exist.

### ON DELETE behavior

| Action | Meaning | Project use |
| --- | --- | --- |
| `RESTRICT` | refuse deletion when children exist | do not delete a movie with bookings |
| `CASCADE` | delete children automatically | deleting a test screen removes its seats |
| `SET NULL` | remove optional relationship | inventory owner cleared when appropriate |

Pick delete behavior from business meaning, not convenience. Cascading from a user to bookings would be a poor choice for purchase history.

### Unique constraint

```sql
ALTER TABLE "ShowtimeSeat"
ADD CONSTRAINT "ShowtimeSeat_showtimeId_seatId_key"
UNIQUE ("showtimeId", "seatId");
```

This guarantees exactly one inventory record for a physical seat at a particular showtime. A normal application `find` check is not enough because two servers can run the check simultaneously.

### Check constraints

The current project uses service validation for values such as positive prices. In a larger database, a database check can add another guardrail:

```sql
ALTER TABLE "Showtime"
ADD CONSTRAINT "Showtime_price_positive"
CHECK ("priceCents" > 0);
```

## 5. Joins

Joins combine related rows using keys.

### INNER JOIN

Returns only matching rows.

```sql
SELECT m.title, s."startsAt"
FROM "Showtime" s
JOIN "Movie" m ON m.id = s."movieId"
WHERE s.status = 'SCHEDULED';
```

### LEFT JOIN

Returns every row on the left even if the right side is missing.

```sql
SELECT m.title, COUNT(s.id) AS showtime_count
FROM "Movie" m
LEFT JOIN "Showtime" s ON s."movieId" = m.id
GROUP BY m.id, m.title;
```

Movies with zero showtimes still appear because the movie table is on the left.

### Booking history query

```sql
SELECT
  b.id AS booking_id,
  b.status,
  b."totalCents",
  m.title,
  st."startsAt",
  seat."rowLabel",
  seat.number
FROM "Booking" b
JOIN "Showtime" st ON st.id = b."showtimeId"
JOIN "Movie" m ON m.id = st."movieId"
JOIN "BookingSeat" bs ON bs."bookingId" = b.id
JOIN "Seat" seat ON seat.id = bs."seatId"
WHERE b."userId" = $1
ORDER BY b."createdAt" DESC, seat."rowLabel", seat.number;
```

This is the SQL mental model behind the booking-history API, even though Prisma constructs much of the ordinary query for us.

## 6. Aggregation

### Count, sum, average

```sql
SELECT
  status,
  COUNT(*) AS booking_count,
  SUM("totalCents") AS total_cents
FROM "Booking"
GROUP BY status;
```

Use `GROUP BY` when aggregation is per category.

### HAVING

`WHERE` filters rows before aggregation. `HAVING` filters aggregated groups.

```sql
SELECT "showtimeId", COUNT(*) AS seat_count
FROM "BookingSeat" bs
JOIN "Booking" b ON b.id = bs."bookingId"
GROUP BY "showtimeId"
HAVING COUNT(*) > 100;
```

### Useful business query: occupancy

```sql
SELECT
  ss."showtimeId",
  COUNT(*) FILTER (WHERE ss.status = 'BOOKED') AS booked,
  COUNT(*) AS capacity
FROM "ShowtimeSeat" ss
GROUP BY ss."showtimeId";
```

PostgreSQL's `FILTER` syntax makes conditional aggregates readable.

## 7. Window functions

Window functions calculate across related rows without collapsing them into one row per group.

```sql
SELECT
  b.id,
  b."userId",
  b."createdAt",
  ROW_NUMBER() OVER (
    PARTITION BY b."userId"
    ORDER BY b."createdAt" DESC
  ) AS booking_number_for_user
FROM "Booking" b;
```

Useful interview distinction:

- `GROUP BY` collapses rows into one row per group.
- A window function keeps each original row and adds a calculated value.

## 8. Transactions

### Basic transaction

```sql
BEGIN;

UPDATE "ShowtimeSeat"
SET status = 'HELD'
WHERE id = $1;

INSERT INTO "Booking" (...)
VALUES (...);

COMMIT;
```

If a statement fails, use `ROLLBACK`. In application code, Prisma's transaction function performs commit on success and rollback when an error is thrown.

### ACID

| Property | Meaning in this project |
| --- | --- |
| Atomicity | booking, holds, and inventory update together or not at all |
| Consistency | constraints and business rules hold before and after commit |
| Isolation | concurrent seat requests do not see an unsafe intermediate state |
| Durability | committed booking survives process restart |

### Do not do this in a transaction

- Call an external payment API.
- Send an email.
- Wait for user input.
- Perform slow image processing.
- Run an unbounded report query.

Long transactions hold connections and locks, increasing latency and deadlock risk.

## 9. Isolation levels

### Read Committed

PostgreSQL's default isolation level. Each statement sees data committed before that statement begins. Good for much ordinary CRUD.

### Repeatable Read

A transaction sees a stable snapshot. It prevents non-repeatable reads but has different trade-offs under concurrent writes.

### Serializable

PostgreSQL ensures the result is equivalent to transactions running one at a time. It may abort one transaction when a concurrent pattern cannot be serialized safely.

The booking service uses serializable transactions and retries PostgreSQL error `P2034` a bounded number of times.

### Important interview answer

Serializable does not mean “nothing can run concurrently.” It means PostgreSQL prevents unsafe concurrent outcomes, sometimes by making one transaction wait or abort and retry.

## 10. Row-level locking

### Lock query

```sql
SELECT id, "seatId", status
FROM "ShowtimeSeat"
WHERE "showtimeId" = $1
  AND "seatId" IN ($2, $3)
ORDER BY "seatId"
FOR UPDATE;
```

The lock lasts until commit or rollback. A competing `FOR UPDATE` on the same row waits.

### Why ORDER BY seatId?

Stable lock order reduces deadlocks when requests overlap. Without it, one request can lock A1 then wait for A2 while another locks A2 then waits for A1.

### Lock types to know

| Syntax | Use |
| --- | --- |
| `FOR UPDATE` | rows will be updated or ownership will change |
| `FOR NO KEY UPDATE` | weaker update lock when key does not change |
| `FOR SHARE` | protect rows from destructive changes while reading |
| `FOR KEY SHARE` | protect referenced keys |

For a booking interview, explain `FOR UPDATE` confidently; the others are useful context, not mandatory memorisation.

## 11. Deadlocks and retries

A deadlock happens when transactions form a wait cycle. PostgreSQL detects it and aborts one transaction.

Example:

1. Transaction A locks A1.
2. Transaction B locks A2.
3. A requests A2 and waits.
4. B requests A1 and waits.

Prevention and handling:

- lock rows in a consistent order;
- keep transactions short;
- avoid mixing unrelated locks;
- catch known transient database errors and retry a bounded number of times;
- do not retry every error blindly.

## 12. Idempotency in SQL terms

An idempotent command has the same final effect when repeated.

```sql
CREATE UNIQUE INDEX "Booking_userId_idempotencyKey_key"
ON "Booking" ("userId", "idempotencyKey");
```

On retry, query the booking by that unique pair and return it. The project also uses a PostgreSQL advisory transaction lock for the key to serialize concurrent identical requests before the first booking row is inserted.

## 13. Indexes

### What an index does

An index is usually a B-tree structure that makes selected lookups efficient. PostgreSQL decides whether it is cheaper to use the index or scan the table.

```sql
CREATE INDEX "Booking_status_expiresAt_idx"
ON "Booking" (status, "expiresAt");
```

This serves the worker query:

```sql
SELECT id
FROM "Booking"
WHERE status = 'PENDING_PAYMENT'
  AND "expiresAt" <= NOW()
ORDER BY "expiresAt";
```

### Composite index order matters

For `(status, expiresAt)`, PostgreSQL can efficiently use the leading `status` and then narrow by expiry. It is not the same as `(expiresAt, status)`.

Rule of thumb: put equality filters first, then range or ordering columns, but verify with `EXPLAIN ANALYZE`.

### Index costs

- More disk space
- Slower inserts, updates, and deletes
- More memory pressure
- More maintenance work

Do not index every column. Index real query patterns and measure.

### Partial index example

If almost all bookings are completed and the worker only needs pending bookings, a later optimization could be:

```sql
CREATE INDEX "Booking_pending_expiry_idx"
ON "Booking" ("expiresAt")
WHERE status = 'PENDING_PAYMENT';
```

This is not added blindly to the starter project. It should follow real data and query measurements.

## 14. EXPLAIN ANALYZE

Use this to see how PostgreSQL actually executes a query.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM "Booking"
WHERE status = 'PENDING_PAYMENT'
  AND "expiresAt" <= NOW();
```

Look for:

- sequential scan versus index scan;
- estimated rows versus actual rows;
- actual execution time;
- loops and nested-loop growth;
- buffer reads and cache hits.

Do not run `EXPLAIN ANALYZE` on a write query in production without understanding it: it executes the statement. Wrap risky investigation in a transaction and roll back when appropriate.

## 15. Common SQL mistakes

### SQL injection

Never concatenate untrusted input into SQL:

```ts
// Unsafe: never do this
const query = `SELECT * FROM "Movie" WHERE title = '${title}'`;
```

Use parameterized queries. Prisma's tagged SQL helpers parameterize values, including the raw `FOR UPDATE` query in this project.

### N+1 queries

Bad pattern: fetch 20 bookings, then fetch seats in a loop, producing 21 or more database queries.

Fix with joins, Prisma relation includes, batching, or a deliberate data-loader pattern.

### Missing transaction

If booking creation, inventory update, and hold creation happen in separate commits, failures can leave impossible partial state.

### Wrong NULL comparison

```sql
-- Wrong
WHERE "expiresAt" = NULL

-- Correct
WHERE "expiresAt" IS NULL
```

### Unbounded reads

Avoid endpoints that return every booking or every movie without a page size, date range, or limit.

## 16. Schema migrations

Migrations are versioned schema changes. They let local development, CI, staging, and production evolve the database in a known order.

### Safe migration pattern

1. Add a new nullable column or new table.
2. Deploy code that writes both old and new forms when necessary.
3. Backfill historical data in controlled batches.
4. Switch reads to the new form.
5. Add stricter constraint after data is valid.
6. Remove the old form in a later release.

Avoid renaming or dropping a live column in the same deployment that application servers still use.

## 17. Useful project queries

### Find expired bookings

```sql
SELECT id
FROM "Booking"
WHERE status = 'PENDING_PAYMENT'
  AND "expiresAt" <= NOW()
ORDER BY "expiresAt"
LIMIT 100;
```

### Inspect current seat state for a showtime

```sql
SELECT seat."rowLabel", seat.number, ss.status, ss."bookingId"
FROM "ShowtimeSeat" ss
JOIN "Seat" seat ON seat.id = ss."seatId"
WHERE ss."showtimeId" = $1
ORDER BY seat."rowLabel", seat.number;
```

### Count booking status by showtime

```sql
SELECT b."showtimeId", b.status, COUNT(*)
FROM "Booking" b
GROUP BY b."showtimeId", b.status
ORDER BY b."showtimeId", b.status;
```

### Identify unexpected inconsistent inventory

```sql
SELECT ss.id, ss.status, ss."bookingId"
FROM "ShowtimeSeat" ss
LEFT JOIN "Booking" b ON b.id = ss."bookingId"
WHERE ss.status IN ('HELD', 'BOOKED')
  AND b.id IS NULL;
```

In a healthy system, this should return no rows. Such reconciliation queries are useful operational checks.

## 18. SQL interview questions and answers

### What is normalization?

Normalization reduces unnecessary duplication and update anomalies by storing each fact in the appropriate table. In this project, a physical seat belongs to a screen, while availability belongs to a showtime-seat relation. Do not over-normalize blindly: carefully justified duplication can improve operational queries, such as temporary hold expiry data.

### What is a foreign key?

A foreign key ensures a referenced parent row exists. `Booking.userId` cannot reference a nonexistent user. It protects referential integrity across application code paths.

### What is the difference between WHERE and HAVING?

`WHERE` filters individual rows before grouping. `HAVING` filters groups after aggregate functions run.

### What is the difference between INNER JOIN and LEFT JOIN?

INNER JOIN returns only matching rows. LEFT JOIN preserves every row from the left side and fills unmatched right-side columns with NULL.

### What is a transaction isolation level?

It defines how concurrent transactions see and affect one another. Higher isolation protects against more anomalies but can increase waiting or retries. Reservation uses serializable isolation because correctness is critical.

### What is the difference between a lock and an index?

An index improves lookup speed. A lock coordinates concurrent access to rows. Indexes help find the seats; locks prevent conflicting reservation changes.

### Why do databases use a query planner?

There are often several valid ways to execute SQL. The planner estimates cost using table statistics and chooses a plan. `EXPLAIN ANALYZE` lets engineers inspect whether that choice matches reality.

## 19. Practice exercises

### Exercise 1

Write a query that returns every available seat for a given showtime, ordered by row and number.

<details>
<summary>Answer</summary>

```sql
SELECT seat.id, seat."rowLabel", seat.number, seat."seatType"
FROM "ShowtimeSeat" ss
JOIN "Seat" seat ON seat.id = ss."seatId"
WHERE ss."showtimeId" = $1
  AND ss.status = 'AVAILABLE'
ORDER BY seat."rowLabel", seat.number;
```

</details>

### Exercise 2

Why is this unsafe?

```sql
SELECT status FROM "ShowtimeSeat" WHERE id = $1;
-- application checks AVAILABLE
UPDATE "ShowtimeSeat" SET status = 'HELD' WHERE id = $1;
```

<details>
<summary>Answer</summary>

Another transaction can change the row between the SELECT and UPDATE. Use a transaction with `FOR UPDATE`, or use one conditional update plus explicit conflict handling when that is enough for the operation.

</details>

### Exercise 3

What index serves the expiry worker query and why?

<details>
<summary>Answer</summary>

`Booking(status, expiresAt)` serves a query that first identifies pending bookings and then filters or orders by expiry. The worker does not need to scan confirmed and cancelled bookings.

</details>

### Exercise 4

Explain why deleting a confirmed booking is usually a bad idea.

<details>
<summary>Answer</summary>

It destroys purchase history needed for customer support, reporting, refunds, and auditability. Use a state transition and retain the related booking-seat and payment history.

</details>

## 20. What to remember for interviews

- SQL describes desired data; PostgreSQL chooses an execution plan.
- Constraints enforce correctness; indexes improve performance.
- Transactions make dependent changes atomic.
- Locks coordinate concurrent access; they are not the same as indexes.
- Use parameterized queries to prevent injection.
- Measure with `EXPLAIN ANALYZE` before changing indexes.
- Keep transactions short and avoid network calls inside them.
- Model the correct business relationship before trying to solve concurrency in code.

For this project, the sentence to remember is:

> PostgreSQL is the source of truth for seat inventory. I lock showtime-seat rows inside a short transaction, validate availability, create the pending booking and holds atomically, and use constraints plus idempotency to make retries and concurrent requests safe.
