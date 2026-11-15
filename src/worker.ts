import { env } from "./config/env.js";
import { expireBookings } from "./jobs/expire-bookings.js";
import { prisma } from "./lib/prisma.js";
import { processPaymentInbox } from "./modules/payments/payment-events.service.js";

let running = false;
const run = async () => {
  if (running) return;
  running = true;
  try {
    const payments = await processPaymentInbox();
    const result = await expireBookings();
    console.log({ ...result, payments, message: "payment inbox and reservation expiry run completed" });
  } catch (error) {
    console.error({ error, message: "reservation expiry run failed" });
  } finally {
    running = false;
  }
};

void run();
const interval = setInterval(() => void run(), env.WORKER_INTERVAL_MS);

const shutdown = () => {
  clearInterval(interval);
  void prisma.$disconnect().finally(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
