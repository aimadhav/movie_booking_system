import { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/lib/prisma.js";

const suffix = Date.now().toString();
let server: Server;
let baseUrl: string;
let userId: string;

describe("authenticated session", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `session-${suffix}@example.test`,
        passwordHash: "not-used",
        role: UserRole.ADMIN,
      },
    });
    userId = user.id;

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns the current user for a valid access token", async () => {
    const accessToken = jwt.sign(
      { role: UserRole.ADMIN },
      env.JWT_SECRET,
      { subject: userId, expiresIn: "1m" },
    );

    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: userId,
      email: `session-${suffix}@example.test`,
      role: "ADMIN",
    });
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("rejects an expired access token", async () => {
    const expiredToken = jwt.sign(
      { role: UserRole.ADMIN },
      env.JWT_SECRET,
      { subject: userId, expiresIn: "-1s" },
    );

    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      error: {
        code: "INVALID_TOKEN",
      },
    });
  });
});
