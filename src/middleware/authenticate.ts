import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { UserRole } from "@prisma/client";

import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

type AccessToken = jwt.JwtPayload & { sub: string; role: UserRole };

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return next(new ApiError(401, "UNAUTHENTICATED", "A Bearer token is required."));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessToken;
    if (!payload.sub || !Object.values(UserRole).includes(payload.role)) {
      throw new Error("Invalid token claims.");
    }
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch {
    return next(new ApiError(401, "INVALID_TOKEN", "The access token is invalid or expired."));
  }
};
