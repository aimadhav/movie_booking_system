CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'WALLET');

ALTER TABLE "Payment"
ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'UPI';
