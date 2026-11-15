import { prisma } from "../../src/lib/prisma.js";
import {
  processPaymentEvent,
  receiveProviderEvent,
  signProviderEvent,
} from "../../src/modules/payments/payment-events.service.js";

const run = async () => {
  const [action, input] = process.argv.slice(2);
  if (action === "receive") {
    const raw = Buffer.from(input);
    const event = await receiveProviderEvent(raw, signProviderEvent(raw));
    console.log(JSON.stringify({ id: event.id, status: event.status }));
  } else if (action === "process") {
    const event = await processPaymentEvent(input);
    console.log(JSON.stringify({ id: event?.id, status: event?.status }));
  } else throw new Error("Expected receive or process.");
};
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
