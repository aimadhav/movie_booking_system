import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { routeParam } from "../../utils/route-param.js";
import { paymentService } from "../payments/payment.service.js";
import { bookingService } from "./booking.service.js";
import { idempotencyKeySchema, reserveSchema } from "./booking.schemas.js";

export const bookingRouter = Router();
bookingRouter.use(authenticate);

const headerKey = (value: string | undefined) => {
  if (!value) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  return idempotencyKeySchema.parse(value);
};

bookingRouter.post("/reserve", asyncHandler(async (req, res) => {
  const input = reserveSchema.parse(req.body);
  const result = await bookingService.reserve({
    userId: req.auth!.userId,
    ...input,
    idempotencyKey: headerKey(req.header("idempotency-key")),
  });
  res.status(201).json(result);
}));

bookingRouter.get("/me", asyncHandler(async (req, res) => {
  res.status(200).json({ items: await bookingService.listForUser(req.auth!.userId) });
}));

bookingRouter.post("/:id/cancel", asyncHandler(async (req, res) => {
  res.status(200).json(await bookingService.cancel(req.auth!.userId, routeParam(req.params.id, "id")));
}));

bookingRouter.post("/:id/confirm", asyncHandler(async (req, res) => {
  const result = await paymentService.confirmMock({
    bookingId: routeParam(req.params.id, "id"),
    userId: req.auth!.userId,
    idempotencyKey: headerKey(req.header("idempotency-key")),
  });
  res.status(200).json(result);
}));
