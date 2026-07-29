import { ApiError } from "./api-error.js";

export const routeParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(422, "INVALID_ROUTE_PARAMETER", `${name} must be provided once.`);
  }
  return value;
};
