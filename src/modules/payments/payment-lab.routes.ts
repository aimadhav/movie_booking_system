import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createPaymentLabRun,
  readPaymentLabRun,
  resumePaymentLabRun,
} from "./payment-lab.service.js";

export const paymentLabRouter = Router();
paymentLabRouter.use((_req, _res, next) => {
  if (env.NODE_ENV === "production" || !env.ENABLE_PAYMENT_LAB)
    return next(
      new ApiError(
        404,
        "LAB_DISABLED",
        "The payment lab is available only in enabled development/test environments.",
      ),
    );
  return next();
});
paymentLabRouter.use(authenticate, authorize("ADMIN"));
paymentLabRouter.post(
  "/runs",
  asyncHandler(async (req, res) => {
    const { scenario } = z
      .object({ scenario: z.enum(["DUPLICATE", "RESTART", "LATE"]) })
      .strict()
      .parse(req.body);
    res.status(201).json(await createPaymentLabRun(req.auth!.userId, scenario));
  }),
);
paymentLabRouter.get(
  "/runs/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await readPaymentLabRun(
        req.auth!.userId,
        z.string().uuid().parse(req.params.id),
      ),
    );
  }),
);
paymentLabRouter.post(
  "/runs/:id/resume",
  asyncHandler(async (req, res) => {
    res.json(
      await resumePaymentLabRun(
        req.auth!.userId,
        z.string().uuid().parse(req.params.id),
      ),
    );
  }),
);
