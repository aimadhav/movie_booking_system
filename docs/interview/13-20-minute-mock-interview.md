# Realistic 20-Minute Mock Interview: Movie Booking System

This is a rehearsal script, not a speech to memorise. Use it to learn how to explain the project in your own words. A good interview is a conversation: answer the question directly, pause, and let the interviewer choose the next depth.

## How to practise

1. Read only the interviewer question.
2. Answer aloud without looking at the suggested answer.
3. Compare your answer with the guidance.
4. Repeat the weak parts until you can explain them naturally.

The goal is not to sound like you built a global ticketing company. The goal is to sound like an engineer who understands the problem, made defensible decisions, tested the important risk, and knows the next limitations.

---

## 0:00–2:00 — Opening

### Interviewer

“Tell me about yourself and a project you have worked on recently.”

### A strong natural answer

> I am interested in backend engineering because I enjoy taking a business problem and making its rules reliable in code and in the database. One project I built is a movie booking backend. I intentionally chose it because it is not only CRUD: two customers can try to buy the same seat at the same time, clients can retry after a timeout, and unpaid reservations must eventually be released.
>
> I built it with TypeScript, Express, PostgreSQL, and Prisma. The main ideas are pre-created showtime seat inventory, PostgreSQL transactions and row-level locks for reservations, idempotency keys for retries, a controlled booking state machine, mock payment confirmation, and a worker that expires abandoned holds.

### Why this answer works

- It starts with the problem, not a list of libraries.
- It gives the interviewer several technical threads to choose from.
- It does not claim that every production feature is complete.

### Common weak answer

> I made a movie booking application with React, Node, Express, PostgreSQL, and JWT.

This tells the interviewer very little about your engineering decisions. If they ask “what was difficult?”, you have not set up a strong answer.

---

## 2:00–4:00 — Project overview

### Interviewer

“What does the project do from a user’s point of view?”

### Suggested answer

> A customer can register and log in, browse movies and showtimes, inspect the seat map for a showtime, reserve one or more seats, confirm a mock payment, cancel a booking, and view their booking history. Admin users can create movies, theatres, screens, seats, and showtimes.
>
> When an admin creates a showtime, the service creates inventory records for all seats in that screen. A customer’s reservation changes selected inventory from available to held for a limited period. Payment confirmation changes it to booked. If payment does not happen, a worker expires the booking and releases the seats.

### Interviewer follow-up

“Why do you create inventory when the showtime is created?”

### Strong answer

> I wanted availability to be represented by a real database row, not calculated dynamically every time from bookings. The inventory record is the pair of showtime and physical seat. That gives the system a direct row to lock when customers compete for the same seat. It uses more rows, but it makes the reservation logic much simpler and safer.

### Key phrase to remember

> A physical seat is reusable across showtimes; availability belongs to the showtime-seat relationship.

---

## 4:00–7:00 — Data model discussion

### Interviewer

“Explain your main database tables.”

### Suggested answer

> The core catalogue tables are users, movies, theatres, screens, seats, and showtimes. A theatre has screens, a screen has physical seats, and a showtime connects a movie to a screen at a specific time.
>
> `ShowtimeSeat` is the important inventory table. It has a `showtimeId`, a `seatId`, a status of available, held, or booked, and an optional current booking owner. It has a unique constraint on `(showtimeId, seatId)` so a showtime cannot accidentally have two inventory rows for A1.
>
> `Booking` is the customer’s reservation aggregate. It starts as pending payment and has an expiry. `BookingSeat` preserves which seats the booking selected and the price at booking time. `SeatHold` represents temporary holds and is useful for operational expiry queries. `Payment` records mock payment attempts and has its own idempotency key.

### Interviewer follow-up

“Why do you need both ShowtimeSeat and BookingSeat?”

### Strong answer

> They have different responsibilities. ShowtimeSeat is mutable current inventory: it answers whether A1 can be bought for this showtime right now. BookingSeat is immutable booking history: it answers which seats were selected for a specific booking and the price charged. A seat can be held by one abandoned booking and later bought by another; current inventory should not erase the historical booking record.

### Interviewer follow-up

“Could this be modelled more simply?”

### Strong answer

> Yes. A smaller version could keep only a booking reference on ShowtimeSeat and omit BookingSeat. I kept BookingSeat because a booking-seat relationship has useful data of its own, especially price snapshots, ticket generation, refunds, and audit history. The added table is justified by that data rather than by normalization for its own sake.

### Interviewer follow-up

“What constraints are most important?”

### Strong answer

> The key constraints are unique screen-seat labels, unique showtime-seat inventory, unique `(userId, idempotencyKey)` for reservation retries, unique booking-seat membership, and unique temporary holds per showtime-seat. I treat those as a second line of defence after service validation, because future endpoints or multiple API instances must still respect the same rules.

---

## 7:00–12:00 — The reservation flow

### Interviewer

“How do you prevent two users booking the same seat?”

### Suggested answer

> Reservation is a short PostgreSQL transaction. First I make retries safe with an idempotency advisory lock keyed by the user and idempotency key. Then I check whether the same command already created a booking and return it if it did.
>
> For a new reservation, I lock the requested ShowtimeSeat rows using `SELECT FOR UPDATE`. Before locking, I sort the seat IDs so overlapping multi-seat requests acquire locks in a stable order. After the locks are acquired, I check every requested seat is still available. If any seat is not available, the request fails with a conflict.
>
> If all are available, I create a pending-payment booking, create booking-seat history and temporary hold rows, update the inventory rows to held, and commit. Because all of that happens in one transaction, it either all exists or none of it exists.

### Interviewer follow-up

“Explain the race condition without locking.”

### Strong answer

> Without locking, User A and User B can both read A1 as available. User A then writes held, and User B also writes held based on stale information. Both requests may appear successful. A row-level lock makes User B wait after User A acquires the lock. Once User A commits, User B reads the current locked row and sees that A1 is held, so B receives a 409 conflict.

### Interviewer follow-up

“Why lock ShowtimeSeat instead of Seat?”

### Strong answer

> Locking the physical Seat row would be too broad. A1 in Screen 1 at 7 PM and the same A1 at 10 PM are independent pieces of inventory. ShowtimeSeat is the correct concurrency boundary because it represents exactly one purchasable unit for one showing.

### Interviewer follow-up

“Why sort seat IDs before locking?”

### Strong answer

> Suppose one request wants A1 then A2, and another wants A2 then A1. If each locks in request order, both can hold one row and wait for the other: a deadlock. Sorting gives both transactions the same order. PostgreSQL can still detect a deadlock in unusual cases, but consistent ordering makes it much less likely.

### Interviewer follow-up

“Why use SERIALIZABLE isolation?”

### Strong answer

> The explicit row locks protect the contested inventory rows. Serializable isolation provides an additional database-level guarantee against unsafe concurrent schedules. PostgreSQL may abort a transaction with a serialization error, so the service retries that known error a small bounded number of times. I chose stronger correctness for the reservation path because duplicate ticket sales are a high-cost failure.

### Interviewer follow-up

“Does SERIALIZABLE make the system slow?”

### Strong answer

> It can reduce throughput if transactions are long or contention is very high. That is why the reservation transaction does only database work and remains short. It does not call payment providers, send email, or do slow work while locks are held. For a booking system, a short wait or retry is preferable to incorrect ownership.

---

## 12:00–14:00 — Idempotency and failure handling

### Interviewer

“What happens if the client times out and sends the reserve request again?”

### Suggested answer

> The client sends an Idempotency-Key. A booking is unique for `(userId, idempotencyKey)`. When the server receives a request, it takes an advisory transaction lock for that key, checks for an existing booking, and returns it if present. This covers the normal retry case.
>
> It also handles the more subtle case where the first request committed successfully but the response was lost. The retry returns the original booking instead of reserving additional seats.

### Interviewer follow-up

“Why is a unique constraint alone not enough?”

### Strong answer

> A unique constraint prevents duplicate rows, but two identical requests can both see no existing booking before either inserts one. One may then proceed far enough to lock seats while the other is waiting. The advisory lock serializes the identical command before the lookup. The unique constraint remains the durable backstop.

### Interviewer follow-up

“What if a transaction crashes halfway through?”

### Strong answer

> PostgreSQL rolls back the whole uncommitted transaction. It does not leave a booking without booking seats or a hold without inventory ownership. If the crash happens after commit, the database is already consistent; idempotency handles the client retry.

---

## 14:00–16:00 — Booking states and expiry

### Interviewer

“Why do you need a held state?”

### Suggested answer

> A customer needs time to complete payment. If I change inventory straight from available to booked, an abandoned checkout can permanently block a seat. If I leave it available while payment is in progress, another customer can buy it. Held is the temporary ownership state between those two outcomes.

### Interviewer follow-up

“How does expiry work?”

### Strong answer

> A pending booking has an expiry timestamp. A separate worker periodically finds pending bookings past that deadline. For each candidate, it locks the booking, rechecks the status and expiry inside the transaction, changes the booking to expired, releases only the inventory rows owned by that booking, and deletes temporary holds.

### Interviewer follow-up

“What if the worker runs twice?”

### Strong answer

> It is idempotent. The second worker run locks the booking and sees it is already expired, confirmed, or cancelled, so it does nothing. This matters because scheduled jobs can be retried or run on more than one process.

### Interviewer follow-up

“What if payment succeeds at the same time the worker expires the booking?”

### Strong answer

> Both operations lock the same booking before changing it. One wins first. If payment confirms before the expiry transaction locks it, the worker rechecks and skips a confirmed booking. If expiry wins first, payment sees an expired booking and fails. There is one legal final state, not an ambiguous mixture.

---

## 16:00–18:00 — Payments, scaling, and trade-offs

### Interviewer

“Why is payment mocked?”

### Suggested answer

> The project focuses on booking correctness. A real payment provider introduces external calls, webhooks, security, reconciliation, and possible disagreement between the provider and my database. The mock payment still demonstrates the important local behaviour: confirmation is idempotent and changes booking and inventory atomically. I documented the real-provider design as a next step rather than pretending the mock is production payment processing.

### Interviewer follow-up

“How would you integrate a real payment provider?”

### Strong answer

> I would give the provider its own idempotency key, persist its reference, and process signed webhooks idempotently. I would never call the provider while holding database seat locks. For ambiguous timeouts, I would query the provider and reconcile. For events such as email notification, I would use an outbox pattern so a committed booking event is not lost if publishing fails.

### Interviewer follow-up

“Why not use Redis locks?”

### Strong answer

> PostgreSQL already owns the durable inventory and can atomically lock, validate, and update it. Redis would introduce a second lock lifecycle with lease expiry and failure modes that must be coordinated with the database. Redis is useful later for caching, rate limiting, or pub/sub, but it is not the first correctness mechanism.

### Interviewer follow-up

“How would you scale it?”

### Strong answer

> I would first measure lock waits, transaction duration, connection-pool use, conflict rate, and database CPU. The API is stateless, so it can run multiple replicas. Movie and showtime catalogue reads can be cached, but seat maps and booking writes should remain authoritative on the primary database. The popular-showtime contention is concentrated on a small number of rows, so keeping transactions short is the most important first step. I would not shard before measured evidence shows the primary database is a bottleneck.

---

## 18:00–20:00 — Behavioral ownership questions

### Interviewer

“What was the toughest part of this project?”

### Strong answer

> The hardest part was identifying the correct unit of inventory. At first it is natural to think of a seat as available or unavailable, but that is wrong because the same physical chair is independent across showtimes. Once I modelled ShowtimeSeat, the rest of the design became clearer: it was the row to lock, the row to display in the seat map, and the row to update through held and booked states. The lesson was that good data modelling simplifies concurrency problems.

### Interviewer

“Tell me about a trade-off you made.”

### Strong answer

> I chose a modular monolith instead of microservices. Booking, inventory, and payment state need close transactional consistency, and a single database transaction makes the first version simpler and safer. The trade-off is that PostgreSQL remains the main write bottleneck, but I would only introduce distributed coordination after measuring a real scaling problem.

### Interviewer

“What would you improve with more time?”

### Strong answer

> I would add a real payment adapter and webhook reconciliation, metrics and tracing, a transactional outbox for notifications, load tests, rate limiting, and live seat updates through WebSockets or Server-Sent Events. I would retain the reserve API as the final authority, because real-time UI events can be delayed.

### Interviewer

“What did you learn from the project?”

### Strong answer

> I learned that correctness should not depend only on application code. The important rules are enforced across layers: validation gives good client errors, service methods own business rules, database constraints protect invariants, transactions keep related writes atomic, and tests demonstrate the concurrency guarantee. I also learned to be honest about boundaries: mock payment confirmation is not the same as real payment processing.

---

## Additional questions an interviewer may ask

### “How did you test concurrency?”

> I wrote an integration test against PostgreSQL. It creates one showtime seat and sends two reservation calls concurrently with different idempotency keys. The assertion is that exactly one call succeeds and the final inventory state is held. Unit tests alone cannot prove database locking behaviour, so this test needs a real PostgreSQL instance.

### “What are the most important indexes?”

> The unique showtime-seat index supports inventory lookup and correctness. Booking status plus expiry supports the expiry worker. Movie plus start time supports browsing scheduled shows. I add indexes for actual query patterns, because every index costs storage and slows writes.

### “How would you find a slow query?”

> I would capture the query and parameters, use `EXPLAIN ANALYZE`, compare estimated and actual rows, check whether the intended index is used, and measure before and after a change. I would not add indexes by instinct.

### “What security concerns are relevant?”

> Passwords are Argon2id hashes. JWTs are short-lived and verified in middleware. User identity comes from the token rather than request JSON. For production I would add refresh-token rotation, HTTPS, CORS policy, rate limiting, secret management, security headers, audit logs for admin actions, and dependency scanning.

### “Why do you not delete cancelled bookings?”

> Booking history is useful for support, refunds, analytics, and auditability. I use state transitions instead of deleting historical business records. Deleting a confirmed booking would also complicate foreign-key relationships and make investigation harder.

### “What if an administrator cancels a showtime?”

> The admin cancellation flow cancels active bookings, refunds mock successful payments, removes holds, releases inventory, and marks the showtime cancelled in one transaction. With a real payment provider, I would replace the mock refund with a provider refund workflow plus reconciliation.

---

## Questions you should ask the interviewer

Ask one or two, depending on time.

- “What reliability or scaling problem is the team currently spending the most time on?”
- “How does the team review database migrations and high-risk changes?”
- “What does strong ownership look like for an engineer in the first six months?”
- “How are architecture decisions documented and challenged on the team?”
- “What is one technical decision the team would make differently today?”

Avoid making salary, leave, or remote policy your only closing question in a technical discussion. Those are valid questions, but a technical question first leaves a stronger final impression.

---

## Self-review scorecard

After a rehearsal, score each item from 1 to 5 and write what to improve.

| Area | Score | Improvement note |
| --- | ---: | --- |
| Clear introduction without listing technologies |  |  |
| Explains why ShowtimeSeat exists |  |  |
| Explains the race condition and row lock |  |  |
| Explains idempotency and crash recovery |  |  |
| Explains expiry worker race safety |  |  |
| Explains one trade-off honestly |  |  |
| Explains real payment limitations honestly |  |  |
| Explains scaling without unnecessary buzzwords |  |  |
| Gives an ownership-focused behavioral answer |  |  |
| Asks a thoughtful closing question |  |  |

Do the first rehearsal with notes. Do the second without notes. By the third, deliberately ask a friend to interrupt you with follow-up questions.

---

## Hard follow-up round: interviewer interruptions

These questions are intentionally direct. Answer the first sentence clearly before adding detail.

### “You say your system prevents double booking. Can you prove it?”

> I can prove the intended invariant with both database design and an integration test. The unique showtime-seat row represents one inventory unit, the reservation transaction locks that row before checking and changing it, and the integration test sends two concurrent reservation attempts for the same row. It asserts that exactly one succeeds.

If pressed further:

> This is not a mathematical proof of all deployment behaviour, but it is evidence at the same layer where the risk exists: a real PostgreSQL database under concurrent requests. I would also monitor unexpected constraint violations and booking conflicts in production.

### “Why do you need both a lock and a unique constraint?”

> They protect different parts of the system. The lock serializes the read-check-update workflow so the service can return a meaningful seat-unavailable response. The unique constraint prevents invalid duplicate rows even if another future code path contains a bug. I prefer database constraints as durable guardrails, not only application logic.

### “Could two requests still deadlock?”

> It is possible in a database system with multiple locks, but sorting seat IDs gives equivalent requests the same acquisition order, which makes the common overlapping-seat deadlock unlikely. PostgreSQL will detect an actual deadlock and abort one transaction. The reservation service also handles retryable serialization failures in a bounded way.

### “Why not use optimistic locking instead?”

> Optimistic concurrency can work when collisions are rare: read a version, update only if the version is unchanged, and retry on conflict. Seats in popular showtimes are a known contention point. Pessimistic row locking is easier to reason about because a customer either waits briefly for the authoritative result or receives a conflict. I would consider optimistic locking for less contentious resources such as profile edits.

### “What happens if the user reserves A1 and A2, but A2 is already taken?”

> The transaction locks both requested inventory rows, checks all of them, and fails the whole reservation if any is unavailable. It does not partially reserve A1. That is atomicity: either the selected set is held together or no seat is held.

---

## Debugging and incident questions

### “A customer says they paid but their booking is still pending. How would you investigate?”

> First I would identify the booking ID, payment idempotency key, and provider reference. I would inspect structured logs using the request ID, then inspect the booking and payment records. With a real provider, I would verify webhook delivery and signature validation, query the provider’s authoritative payment status if necessary, and use a reconciliation job for unresolved states. I would avoid manually marking the booking confirmed without evidence.

### “Seats are stuck as HELD. What are the likely causes?”

> The expiry worker may be down, delayed, or failing. The worker query may be missing an index, there may be a state-transition bug, or a deployment might have stopped worker processes. I would inspect worker logs, count pending bookings past expiry, check the status and expiry index, and run the expiry operation safely. Because expiry is idempotent, retrying it is safe.

### “The booking endpoint suddenly has high latency. What do you inspect?”

> I would separate API latency from database latency. I would check request rate, p95 and p99 response time, database connection-pool saturation, transaction duration, lock wait time, conflict rate, slow-query logs, and database CPU. For a popular showtime, high lock wait can be normal contention; a long transaction that includes unrelated work is a design problem.

### “How would you fix a slow seat-map query?”

> I would inspect the exact query with `EXPLAIN ANALYZE`, verify the showtime inventory lookup uses the showtime-seat index, and look at how many rows are returned. I would not cache first without measurement. If it is read-heavy and updates can tolerate short staleness, I could cache the catalogue portion, but seat state should remain authoritative near the reservation action.

### “An admin accidentally cancels a showtime. Can you undo it?”

> In this project, cancellation is a business transition with refunds and released inventory, so undoing it is not simply changing a flag back. In a production system I would require audit logs, confirmation steps, role-based approval for high-impact actions, and a deliberate recovery workflow. The important lesson is that operational actions should be modeled as business events, not casual database edits.

---

## REST API and validation questions

### “Why use POST for reservation instead of PUT?”

> Reservation is a command that creates a server-generated booking and has workflow semantics, so POST is appropriate. I make the command safe to retry with an Idempotency-Key rather than assuming POST can never be repeated.

### “Why do you return 409 for a seat conflict?”

> The request is syntactically valid, but it conflicts with current resource state: the selected seat is no longer available. A 422 is more suitable for invalid request data, such as malformed IDs or duplicate seat IDs in the same request.

### “What is the difference between 401 and 403?”

> A 401 means the request is not authenticated: missing, invalid, or expired credentials. A 403 means the identity is known but does not have permission, such as a customer calling an admin endpoint.

### “How do you validate input?”

> Zod validates request bodies and query parameters at the HTTP boundary. It gives clients consistent 422 responses. Validation alone is not enough for correctness, so the service still checks resource existence, ownership, current booking state, and database constraints.

### “Why not return raw Prisma errors?”

> Raw database errors leak implementation details and produce inconsistent client contracts. The error middleware maps expected errors to stable HTTP codes and error codes, logs unexpected errors internally, and avoids returning sensitive details.

---

## SQL and database questions

### “What is an index, and why not index every column?”

> An index is a data structure that helps PostgreSQL locate rows without scanning the whole table. It costs disk, memory, and write performance because inserts and updates must maintain it. I index fields based on the actual query patterns: showtime seat lookup, expiry scans, user booking history, and showtime browsing.

### “What does `FOR UPDATE` actually do?”

> It selects rows and takes a row-level lock that prevents conflicting updates and locks until the transaction commits or rolls back. Other transactions requesting the same lock wait, then see the current committed row before deciding whether their business rule still allows the operation.

### “What is a transaction rollback?”

> A rollback discards all uncommitted changes from the transaction. In reservation, that means if creating a hold or updating inventory fails, PostgreSQL also removes the pending booking and booking-seat records created earlier in the same transaction.

### “Why is `Booking.expiresAt` the deadline instead of only a seat field?”

> The deadline belongs to one checkout attempt that can contain several seats. Keeping it on Booking provides one authoritative payment deadline. SeatHold also stores expiry for direct hold queries and cleanup operations, but it is written in the same transaction and does not replace the booking’s state or deadline.

---

## Toughest-parts behavioral variations

### “Tell me about a time you changed your design after learning more.”

> While designing inventory, I initially thought in terms of a seat having a simple availability flag. I realised that was incorrect because A1 can be booked for one showtime and free for another. I changed the model to create showtime-seat inventory. That decision clarified both the data model and the concurrency boundary. It reinforced that I should model the real business relationship before writing endpoints.

### “Tell me about a mistake you made in this project.”

> One early design risk was duplicating expiry information in several places without clearly naming an authority. I corrected that by treating the booking state and deadline as the business source of truth, then documenting why temporary hold rows also carry expiry for indexed operational queries. The lesson was that redundancy must have a clear purpose and consistency rule.

### “How did you decide what not to build?”

> I prioritised the correctness path first: inventory, transactions, locks, retries, state transitions, and expiry. I deliberately deferred real payment provider integration, notifications, WebSockets, and Redis because each adds a separate operational problem. I documented those extensions rather than adding incomplete versions that would make the system harder to defend.

### “How do you deal with something you do not know?”

> I reduce it to a smaller verifiable question. For example, rather than saying I understand concurrency generally, I wrote a test with two concurrent reservation attempts against PostgreSQL and checked the final inventory state. I read the database and library documentation, make an explicit assumption, and validate it with code or measurement.

---

## Alternative interview formats

### If the interviewer asks for a five-minute system design

Start with these points only:

1. Model availability as one showtime-seat row.
2. Pre-create those rows when the showtime is scheduled.
3. Lock selected rows inside a short database transaction.
4. Create a pending booking with an expiry.
5. Confirm payment in a separate idempotent command.
6. Expire abandoned holds with an idempotent worker.

Then pause. Let the interviewer ask where they want detail.

### If the interviewer asks you to explain code

Open `src/modules/bookings/booking.service.ts`. Start from the method input and narrate the transaction in order. Do not read every line. Explain the business reason for each important block: idempotency, lock ordering, availability check, atomic writes, and serialization retry.

### If the interviewer says “design BookMyShow”

Say your project is a focused version of that problem. Clarify expected scale, geography, payment requirements, real-time seat updates, and cancellation/refund policy. Then present the same core inventory model before discussing caching, event streaming, sharding, or WebSockets.

---

## Final rehearsal checklist

You are ready for a project discussion when you can do all of these without notes:

- explain the project in 60–90 seconds;
- explain why `Seat` and `ShowtimeSeat` are separate;
- describe one race condition and how the lock prevents it;
- explain an idempotency key using a timeout/retry example;
- explain held versus booked versus expired;
- name one realistic limitation without sounding defensive;
- explain what you would measure before scaling;
- answer “what was hardest?” with a concrete design lesson;
- ask the interviewer one thoughtful engineering question.

If you can do those clearly, you will appear far stronger than someone who only lists frameworks or claims to have used advanced tools without understanding their trade-offs.

---

## Collaboration, prioritization, and ownership questions

### “If you were working with a frontend engineer, what contract would you agree on?”

> I would agree on the request and response shapes, authentication flow, consistent error codes, pagination, date and money formats, and the seat-map refresh behavior. For reservation, I would make it explicit that the UI can show a seat as available but the reserve endpoint is authoritative. The frontend must handle a 409 conflict gracefully because another customer can reserve the seat between viewing and submitting.

### “How would you break this project into work for a small team?”

> I would keep the core booking transaction owned by one engineer until its invariants and tests are stable. Another engineer could work on auth and admin catalogue APIs, another on the customer browse experience, and another on observability and deployment. I would agree on the Prisma schema and API contracts before parallel work, because changes to the booking model affect every module.

### “How would you review a pull request that changes reservation logic?”

> I would ask which invariant changes, where the transaction boundary is, which rows are locked, whether all failure paths roll back, whether retries remain idempotent, and what new test proves the changed behavior. I would be especially cautious about adding network calls, logging sensitive values, or changing lock order inside the transaction.

### “What would you do if product asked for a feature that conflicts with correctness?”

> I would clarify the business goal and explain the risk in concrete terms. For example, if product asked to make held seats appear available until payment finishes, I would explain that it can cause two customers to believe they own the same seat. I would offer alternatives such as a shorter hold period, a visible countdown, a queue for high-demand releases, or clearer seat-state messaging.

### “How would you prioritize the next features?”

> I would prioritize by risk and user impact. First, operational visibility and integration testing because they protect the existing booking guarantee. Next, real payment reconciliation because it affects money and customer trust. Then notification and ticketing features. WebSockets and caching would follow measured performance or user-experience needs.

---

## Recruiter-style rapid questions

Try answering each in 20–30 seconds.

### “What is the most important file in the project?”

> `booking.service.ts`, because it owns the business-critical reservation transaction. But the guarantee is not only in that file: it depends on the schema constraints, the locking repository, the booking state rules, and the integration test.

### “What is the most important test?”

> The concurrent-reservation integration test. It tests the failure mode that a normal CRUD test misses: two requests competing for one inventory row in a real PostgreSQL database.

### “What would happen if you removed the database transaction?”

> The system could persist partial work: a booking without holds, a hold without inventory ownership, or inventory changed without booking history. It would also make error recovery and concurrency reasoning much harder.

### “What would happen if you removed the idempotency key?”

> A network retry could create another booking or duplicate a payment confirmation. The customer may see one request, but mobile networks and browsers can resend it. Idempotency makes retries safe.

### “What is one thing the system deliberately does not guarantee?”

> It does not implement a real external payment provider or guarantee delivery of notifications. The mock payment demonstrates local consistency; production payment confirmation needs webhooks and reconciliation, while notifications need an outbox and retry strategy.

### “What makes this a backend project rather than only a database project?”

> The database protects core invariants, but the application defines commands, validates input, authenticates users, applies RBAC and ownership, maps errors to a usable API contract, schedules expiry work, and exposes the system through maintainable modules. Both layers matter.

---

## Last-minute reminder before an interview

Do not try to mention every concept. Start with the problem, answer the interviewer’s question, and go deep only when invited. A calm explanation of one transaction you genuinely understand is more impressive than a fast list of ACID, Redis, microservices, Kafka, and Kubernetes.
