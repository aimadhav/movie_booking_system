import { Router, raw } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { receiveProviderEvent } from "./payment-events.service.js";

export const paymentWebhookRouter = Router();
paymentWebhookRouter.post(
  "/mock",
  raw({ type: "application/json", limit: "100kb" }),
  asyncHandler(async (req, res) => {
    const event = await receiveProviderEvent(
      req.body,
      req.header("x-mock-signature"),
    );
    res
      .status(200)
      .json({
        accepted: true,
        eventId: event.id,
        status: event.status,
        deliveryCount: event.deliveryCount,
      });
  }),
);
