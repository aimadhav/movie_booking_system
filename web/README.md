# CineLoop Frontend

CineLoop is the recruiter-facing visual demo for the movie booking backend. It uses original branding and a premium cinema-discovery interface inspired by modern ticketing products.

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

```powershell
npm run build
npm test
```

The social preview is stored at `public/og.png`. It was generated specifically for CineLoop and contains no third-party cinema branding or copyrighted movie artwork.
