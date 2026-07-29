# Step 5 — Showtime seat inventory

## Concept

When a value depends on two entities, model the relationship explicitly. Pre-creating inventory converts a difficult “calculate availability” question into a direct, lockable row lookup.

## Application in this project

When a showtime is created, the service copies every physical seat in its screen into `ShowtimeSeat` records with state `AVAILABLE`. The seat map reads those rows, joined with physical labels.

## Code together

1. Write the service operation that creates a showtime and all its inventory in one transaction.
2. Add `GET /showtimes/:id/seats` with seat labels and availability.
3. Test that inventory contains exactly one row per screen seat.
4. Test that two different showtimes can each have A10.

## Review questions

1. Why create inventory when the showtime is created rather than on the first seat-map request?
2. What failure could lazy creation cause under concurrent first requests?
3. What does the unique showtime-seat constraint prove?

## Completion check

Scheduling a 60-seat screen creates exactly 60 available inventory rows, and the seat map makes no guess about availability.

