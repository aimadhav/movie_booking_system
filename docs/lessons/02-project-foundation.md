# Step 2 — Project foundation

## Concept

A backend should separate HTTP concerns from business rules and persistence. Configuration must come from the environment, not hard-coded source files. A reproducible local environment lets another developer run the same system without guessing setup steps.

## Application in this project

```text
Route/controller → service → repository/database
```

- Routes translate HTTP into a command and response.
- Services own business rules and transaction boundaries.
- Repositories isolate database queries.
- Middleware handles cross-cutting concerns such as authentication, request logging, and errors.

## Code together

1. Review `package.json`, `.env.example`, and `docker-compose.yml`.
2. Install dependencies and start PostgreSQL in Docker.
3. Add the Express application, health endpoint, centralized error format, and graceful shutdown.
4. Generate Prisma Client and run the initial migration.

## Review questions

1. Why should `DATABASE_URL` not be committed to source control?
2. Why does a controller not contain booking rules?
3. What is the difference between a `404` and an unexpected `500`?

## Completion check

`GET /health` succeeds locally, invalid routes return the standard error format, and the database starts from one documented command.

