CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "ShowtimeStatus" AS ENUM ('SCHEDULED', 'CANCELLED');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ShowtimeSeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Movie" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "durationMin" INTEGER NOT NULL,
  "rating" VARCHAR(20),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Theater" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Theater_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Screen" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "theaterId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Seat" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "screenId" UUID NOT NULL,
  "rowLabel" VARCHAR(8) NOT NULL,
  "number" INTEGER NOT NULL,
  "seatType" VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Showtime" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "movieId" UUID NOT NULL,
  "screenId" UUID NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "status" "ShowtimeStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "showtimeId" UUID NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "idempotencyKey" VARCHAR(255) NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShowtimeSeat" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "showtimeId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "status" "ShowtimeSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
  "bookingId" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShowtimeSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingSeat" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "priceCents" INTEGER NOT NULL,
  CONSTRAINT "BookingSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeatHold" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "showtimeId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "providerRef" VARCHAR(255),
  "amountCents" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Theater_city_idx" ON "Theater"("city");
CREATE UNIQUE INDEX "Screen_theaterId_name_key" ON "Screen"("theaterId", "name");
CREATE UNIQUE INDEX "Seat_screenId_rowLabel_number_key" ON "Seat"("screenId", "rowLabel", "number");
CREATE INDEX "Showtime_movieId_startsAt_idx" ON "Showtime"("movieId", "startsAt");
CREATE INDEX "Showtime_screenId_startsAt_idx" ON "Showtime"("screenId", "startsAt");
CREATE UNIQUE INDEX "ShowtimeSeat_showtimeId_seatId_key" ON "ShowtimeSeat"("showtimeId", "seatId");
CREATE INDEX "ShowtimeSeat_bookingId_idx" ON "ShowtimeSeat"("bookingId");
CREATE UNIQUE INDEX "Booking_userId_idempotencyKey_key" ON "Booking"("userId", "idempotencyKey");
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");
CREATE UNIQUE INDEX "BookingSeat_bookingId_seatId_key" ON "BookingSeat"("bookingId", "seatId");
CREATE INDEX "BookingSeat_seatId_idx" ON "BookingSeat"("seatId");
CREATE UNIQUE INDEX "SeatHold_showtimeId_seatId_key" ON "SeatHold"("showtimeId", "seatId");
CREATE INDEX "SeatHold_expiresAt_idx" ON "SeatHold"("expiresAt");
CREATE INDEX "SeatHold_bookingId_idx" ON "SeatHold"("bookingId");
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

ALTER TABLE "Screen" ADD CONSTRAINT "Screen_theaterId_fkey" FOREIGN KEY ("theaterId") REFERENCES "Theater"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowtimeSeat" ADD CONSTRAINT "ShowtimeSeat_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShowtimeSeat" ADD CONSTRAINT "ShowtimeSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowtimeSeat" ADD CONSTRAINT "ShowtimeSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
