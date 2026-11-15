# CineLoop Frontend

CineLoop is the visual demo for the movie booking backend. The interface takes inspiration from American cinema sites with a dark film-first layout, original movie artwork, clear showtimes, and reserved-seat checkout. It retains Bengaluru locations, INR pricing, and the existing API contract.

The home page includes a featured-film carousel, now-showing and coming-soon collections, genre/title search, a theater directory, and a cinema experience section. Coming-soon films are explicitly previews and have no bookable showtimes. Date selection filters the actual loaded showtime inventory.

## What it demonstrates

- Movie discovery and showtime selection
- Showtime-specific seat inventory
- AVAILABLE, HELD, and BOOKED seat states
- Protected 10-minute reservation countdown
- Mock payment confirmation
- Booking history and cancellation
- JWT authentication and admin-only workflows
- Theater, screen, seat, and showtime provisioning
- A visual concurrency race where exactly one request wins a seat

## Data modes

The interface checks `http://127.0.0.1:3000/health` when it loads.

- **Live API:** Requests use the Express, Prisma, and PostgreSQL backend.
- **Demo mode:** The complete interface remains interactive with deterministic browser-local data when the backend is unavailable.

Demo mode exists for the hosted portfolio preview. It does not replace the live integration path.

## Local development

Use Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Then open `http://localhost:4173`.

To use real data, run these from the repository root in separate terminals:

```powershell
docker compose up -d
npm run dev
npm run dev:worker
```

The seeded admin account is `admin@cinema.local` with password `ChangeMe123!`.

## Validation

The payment failure experiments are available at `/payment-lab` and from System design lab. Live mode uses authenticated admin-only development endpoints backed by PostgreSQL. Offline mode is an explicitly labelled simulation. The interruption scenario stores an event without processing it: restart the API, restore the saved run ID, then process or replay the event. The late-payment scenario records a compensation requirement without issuing a real refund.

```powershell
npm run build
npm test
```

Social previews use the original featured-film artwork at `public/images/last-orbit.webp`.

Original fictional-film artwork lives in `public/images/`. The five WebP assets total less than 1 MB. Titles and poster typography are rendered by the interface. These are sample films, not real theatrical releases.
