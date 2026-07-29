import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { ApiError } from "../utils/api-error.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten(),
      },
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return res.status(409).json({
      error: { code: "UNIQUE_CONSTRAINT", message: "The resource already exists." },
    });
  }

  req.log.error({ err: error }, "request failed");
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
};
