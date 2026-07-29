import { randomUUID } from "node:crypto";

export const createReference = (prefix: string) =>
  `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
