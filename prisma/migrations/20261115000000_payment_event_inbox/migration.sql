CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REFUND_REQUIRED', 'REJECTED', 'DEAD_LETTER');

CREATE TABLE "PaymentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "providerEventId" VARCHAR(255) NOT NULL,
  "providerRef" VARCHAR(255) NOT NULL,
  "bookingId" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "deliveryCount" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "manualOnly" BOOLEAN NOT NULL DEFAULT false,
  "labScenario" VARCHAR(30),
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX "PaymentEvent_status_manualOnly_nextAttemptAt_idx" ON "PaymentEvent"("status", "manualOnly", "nextAttemptAt");
CREATE INDEX "PaymentEvent_bookingId_idx" ON "PaymentEvent"("bookingId");
