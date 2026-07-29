import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { ApiError } from "../utils/api-error.js";

export const authorize = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return next(new ApiError(403, "FORBIDDEN", "You do not have permission for this action."));
  }
  return next();
};
