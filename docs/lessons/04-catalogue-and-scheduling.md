# Step 4 — Catalogue and scheduling

## Concept

REST APIs model resources and commands using predictable URLs, HTTP methods, status codes, validation, and pagination. Indexes speed up known query patterns, but each index adds write cost and storage.

## Application in this project

Admins create movies, theatres, screens, seats, and showtimes. Customers list movies and query showtimes. We choose indexes based on expected reads, such as "showtimes for a movie ordered by start time."

## Code together

1. Add validated admin commands for movies, theatres, screens, seats, and showtimes.
2. Add customer read endpoints for movies and showtimes.
3. Add pagination and explicit sorting where lists can grow.
4. Seed a small, realistic cinema and verify foreign-key failures.

## Review questions

1. Why is `DELETE /movies/:id` not necessarily safe when showtimes exist?
2. Why index `(movieId, startsAt)` instead of only `movieId` for our list query?
3. What does `422 Unprocessable Entity` mean here?

## Completion check

An admin can schedule a movie in a screen; a customer can query its showtimes; invalid references and invalid times fail cleanly.

