import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`Movie booking API listening on port ${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received; shutting down.`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
