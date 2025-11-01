import { prisma } from "../config/db";

export const createRefreshToken = async (
  userId: string,
  token: string,
  expiresAt: Date
) => {
  return prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
};

export const findRefreshToken = async (token: string) => {
  return prisma.refreshToken.findUnique({
    where: { token },
    include: {
      user: true,
    },
  });
};

export const deleteRefreshToken = async (token: string) => {
  return prisma.refreshToken.delete({
    where: { token },
  });
};

export const deleteAllUserRefreshTokens = async (userId: string) => {
  return prisma.refreshToken.deleteMany({
    where: { userId },
  });
};

export const deleteExpiredRefreshTokens = async () => {
  return prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
};

export const getUserRefreshTokens = async (userId: string) => {
  return prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};
