import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { catalogService } from "./catalog.service.js";
import { movieQuerySchema } from "./catalog.schemas.js";

export const catalogRouter = Router();

catalogRouter.get("/", asyncHandler(async (req, res) => {
  const result = await catalogService.listMovies(movieQuerySchema.parse(req.query));
  res.status(200).json(result);
}));
