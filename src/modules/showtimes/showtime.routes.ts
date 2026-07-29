import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { routeParam } from "../../utils/route-param.js";
import { showtimeQuerySchema } from "./showtime.schemas.js";
import { showtimeService } from "./showtime.service.js";

export const showtimeRouter = Router();

showtimeRouter.get("/", asyncHandler(async (req, res) => {
  res.status(200).json(await showtimeService.list(showtimeQuerySchema.parse(req.query)));
}));

showtimeRouter.get("/:id/seats", asyncHandler(async (req, res) => {
  res.status(200).json(await showtimeService.seatMap(routeParam(req.params.id, "id")));
}));
