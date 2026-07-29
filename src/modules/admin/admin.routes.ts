import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { routeParam } from "../../utils/route-param.js";
import { adminService } from "./admin.service.js";
import {
  movieSchema,
  movieUpdateSchema,
  screenSchema,
  screenUpdateSchema,
  seatsSchema,
  showtimeSchema,
  theaterSchema,
  theaterUpdateSchema,
} from "./admin.schemas.js";

export const adminRouter = Router();
adminRouter.use(authenticate, authorize(UserRole.ADMIN));

adminRouter.post("/movies", asyncHandler(async (req, res) => {
  res.status(201).json(await adminService.createMovie(movieSchema.parse(req.body)));
}));
adminRouter.patch("/movies/:id", asyncHandler(async (req, res) => {
  res.status(200).json(await adminService.updateMovie(routeParam(req.params.id, "id"), movieUpdateSchema.parse(req.body)));
}));
adminRouter.post("/theaters", asyncHandler(async (req, res) => {
  res.status(201).json(await adminService.createTheater(theaterSchema.parse(req.body)));
}));
adminRouter.patch("/theaters/:id", asyncHandler(async (req, res) => {
  res.status(200).json(await adminService.updateTheater(routeParam(req.params.id, "id"), theaterUpdateSchema.parse(req.body)));
}));
adminRouter.post("/screens", asyncHandler(async (req, res) => {
  res.status(201).json(await adminService.createScreen(screenSchema.parse(req.body)));
}));
adminRouter.patch("/screens/:id", asyncHandler(async (req, res) => {
  res.status(200).json(await adminService.updateScreen(routeParam(req.params.id, "id"), screenUpdateSchema.parse(req.body)));
}));
adminRouter.post("/screens/:screenId/seats", asyncHandler(async (req, res) => {
  res.status(201).json(await adminService.addSeats(routeParam(req.params.screenId, "screenId"), seatsSchema.parse(req.body)));
}));
adminRouter.post("/showtimes", asyncHandler(async (req, res) => {
  res.status(201).json(await adminService.createShowtime(showtimeSchema.parse(req.body)));
}));
adminRouter.post("/showtimes/:id/cancel", asyncHandler(async (req, res) => {
  res.status(200).json(await adminService.cancelShowtime(routeParam(req.params.id, "id")));
}));
