import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";

const publicUser = (user: { id: string; email: string; role: UserRole; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

const createToken = (user: { id: string; role: UserRole }) =>
  jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: "15m" });

export const authService = {
  async register(input: { email: string; password: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ApiError(409, "EMAIL_IN_USE", "An account with this email already exists.");
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
      },
    });

    return { user: publicUser(user), accessToken: createToken(user) };
  },

  async login(input: { email: string; password: string }) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    return { user: publicUser(user), accessToken: createToken(user) };
  },
};
