# Indexes and Constraints

Constraints enforce truth. Indexes make known queries fast.

| Database rule | Reason |
| --- | --- |
| `UNIQUE(showtimeId, seatId)` | one inventory row for a seat at one showing |
| `UNIQUE(userId, idempotencyKey)` | retry cannot create duplicate booking |
| `UNIQUE(showtimeId, seatId)` on `SeatHold` | one active temporary hold per inventory seat |
| `INDEX(status, expiresAt)` on booking | worker finds due reservations efficiently |
| `INDEX(movieId, startsAt)` on showtime | browse schedules by movie and time |

Indexes are not added merely because a field exists. They cost disk and make writes slower. The chosen indexes correspond to the API's seat-map, schedule, expiry, and ownership queries.

