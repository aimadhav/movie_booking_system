import express from "express";
import pinoHttp from "pino-http";
import type { IncomingMessage } from "node:http";

import { authRouter } from "./modules/auth/auth.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { paymentRouter } from "./modules/payments/payment.routes.js";
import { showtimeRouter } from "./modules/showtimes/showtime.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { paymentWebhookRouter } from "./modules/payments/payment-webhooks.routes.js";
import { paymentLabRouter } from "./modules/payments/payment-lab.routes.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";

export const app = express();

const requestLogger = pinoHttp as unknown as (options: {
  genReqId: (request: IncomingMessage) => string | undefined;
  redact: { paths: string[]; censor: string };
}) => express.RequestHandler;
app.use(requestLogger({
  genReqId: (req) => req.headers["x-request-id"]?.toString(),
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-mock-signature"]'],
    censor: "[REDACTED]",
  },
}));
app.use((req, res, next) => {
  const origin = req.header("origin");
  const isLocalFrontend = origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  if (isLocalFrontend) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-Request-Id");
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use("/payments/webhooks", paymentWebhookRouter);
app.use(express.json({ limit: "100kb" }));
app.use("/payments/lab", paymentLabRouter);

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use("/auth", authRouter);
app.use("/movies", catalogRouter);
app.use("/showtimes", showtimeRouter);
app.use("/bookings", bookingRouter);
app.use("/payments", paymentRouter);
app.use("/admin", adminRouter);
app.use(notFound);
app.use(errorHandler);
