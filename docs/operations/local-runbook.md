# Local Runbook

## Start the system

```bash
Copy-Item .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

Run the expiry worker in another terminal:

```bash
npm run dev:worker
```

The seed command creates `admin@cinema.local` with password `ChangeMe123!`. This credential is for local development only.

## Verification commands

```bash
npm run typecheck
npm test
npm run test:integration
```

The integration test requires Docker PostgreSQL running and migrations applied. It demonstrates that only one of two concurrent requests can hold the same seat.

