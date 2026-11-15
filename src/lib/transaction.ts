import { Prisma } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";

import { prisma } from "./prisma.js";

export const isRetryableTransactionError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return (
    error.code === "P2034" ||
    (error.code === "P2010" &&
      ["40001", "40P01"].includes(String(error.meta?.code)))
  );
};

export const runSerializable = async <Result>(
  work: (tx: Prisma.TransactionClient) => Promise<Result>,
) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 7) throw error;
      await delay(
        Math.min(200, 10 * 2 ** attempt) + Math.floor(Math.random() * 20),
      );
    }
  }
  throw new Error("Transaction retry limit reached.");
};
