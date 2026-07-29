# Concurrency Interview Questions

## How do you prevent double booking?

Availability is represented by one `ShowtimeSeat` row per `(showtime, seat)`. The reservation transaction locks the requested rows with `SELECT ... FOR UPDATE`, checks their current status, and changes them to `HELD` before committing. A second request for the same row waits, then sees the committed status and receives `409`.

## Why not use an in-memory lock?

An in-memory lock only protects one API process. It fails when the service has multiple replicas or a process restarts. PostgreSQL is already the durable source of inventory, so its transaction and row lock are the primary mechanism.

## Why sort seat IDs before locking?

Two overlapping requests can deadlock if one locks A1 then A2 while another locks A2 then A1. Sorting creates a consistent global order and greatly reduces that risk. PostgreSQL can still detect and abort a deadlock; the transaction layer handles retryable serialization failures.

## Why use SERIALIZABLE if rows are already locked?

The row locks protect the contested inventory rows. Serializable isolation additionally protects the transaction from unsafe concurrent schedules and makes the intended business invariant explicit. The service retries PostgreSQL's serialization-abort error a bounded number of times.

## What happens if the application crashes during a reservation?

If it crashes before commit, PostgreSQL rolls back the entire transaction. No booking, history, or hold is persisted. If it crashes after commit but before the response reaches the client, the client retries with the same idempotency key and receives the original booking.

