import { z } from "zod";

export const confirmPaymentSchema = z.object({ bookingId: z.string().uuid() });

export const processMockPaymentSchema = confirmPaymentSchema.extend({
  method: z.enum(["UPI", "CARD", "WALLET"]),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
});
