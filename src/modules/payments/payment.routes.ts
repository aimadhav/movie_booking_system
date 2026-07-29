import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { idempotencyKeySchema } from "../bookings/booking.schemas.js";
import { confirmPaymentSchema, processMockPaymentSchema } from "./payment.schemas.js";
import { paymentService } from "./payment.service.js";

export const paymentRouter = Router();
paymentRouter.use(authenticate);

paymentRouter.post("/mock/confirm", asyncHandler(async (req, res) => {
  const key = req.header("idempotency-key");
  if (!key) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  const { bookingId } = confirmPaymentSchema.parse(req.body);
  const result = await paymentService.confirmMock({
    bookingId,
    userId: req.auth!.userId,
    idempotencyKey: idempotencyKeySchema.parse(key),
  });
  res.status(200).json(result);
}));

paymentRouter.post("/mock/process", asyncHandler(async (req, res) => {
  const key = req.header("idempotency-key");
  if (!key) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  const input = processMockPaymentSchema.parse(req.body);
  const result = await paymentService.processMock({
    ...input,
    userId: req.auth!.userId,
    idempotencyKey: idempotencyKeySchema.parse(key),
  });
  res.status(200).json(result);
}));
