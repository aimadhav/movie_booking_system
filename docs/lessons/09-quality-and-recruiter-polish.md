# Step 9 — Quality and recruiter polish

## Concept

Production quality is demonstrated through evidence: tests for important risks, observable failures, repeatable startup, clear API documentation, and honest trade-off explanations.

## Application in this project

The standout evidence is a concurrency integration test. It proves that the database—not timing luck—prevents double booking.

## Code together

1. Add unit tests for pure state-transition rules.
2. Add integration tests against PostgreSQL for reservation, retry, expiry, and authorization.
3. Add request IDs and structured logs without logging passwords, tokens, or payment data.
4. Add an OpenAPI specification and a seed/demo script.
5. Improve the README with architecture, setup, test commands, and a short demo scenario.
6. Rehearse the resume bullets and system-design explanation.

## Review questions

1. Why is a concurrency test more valuable than a screenshot of a seat map?
2. Which logs help diagnose a failed reservation without exposing sensitive data?
3. When would Redis become useful, and why do we not use it as the first correctness mechanism?

## Completion check

Another developer can run the system, execute the tests, reproduce the double-booking proof, and understand the architecture from the repository.

