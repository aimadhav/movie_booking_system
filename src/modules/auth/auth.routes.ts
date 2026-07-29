import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { authService } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(async (req, res) => {
  const result = await authService.register(registerSchema.parse(req.body));
  res.status(201).json(result);
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body));
  res.status(200).json(result);
}));
