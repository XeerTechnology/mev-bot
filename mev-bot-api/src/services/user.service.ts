import { prisma } from "../config/db";
import { User, UserWithoutPassword } from "../types";
import { RegisterUserInput, UpdateUserInput } from "../schemas";
import bcrypt from "bcryptjs";
import { ApiError } from "../utils/apiError";

// Helper function to exclude password from user object
const excludePassword = (user: User): UserWithoutPassword => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export const getAllUsers = async (): Promise<UserWithoutPassword[]> => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });
  return users.map(excludePassword);
};

export const getUserById = async (
  id: string
): Promise<UserWithoutPassword | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  return user ? excludePassword(user) : null;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { email },
  });
  return user;
};

export const getUserByEmailForAuth = async (
  email: string
): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { email },
  });
  return user;
};

export const createUser = async (
  userData: RegisterUserInput
): Promise<UserWithoutPassword> => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: userData.email },
  });

  if (existingUser) {
    throw new ApiError("User with this email already exists", 409);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(userData.password, 12);

  const user = await prisma.user.create({
    data: {
      email: userData.email,
      password: hashedPassword,
    },
  });

  return excludePassword(user);
};

export const updateUser = async (
  id: string,
  updateData: UpdateUserInput
): Promise<UserWithoutPassword | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return null;
  }

  // If email is being updated, check for conflicts
  if (updateData.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: updateData.email },
    });
    if (existingUser && existingUser.id !== id) {
      throw new ApiError("User with this email already exists", 409);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...(updateData.email ? { email: updateData.email } : {}),
      ...(updateData.password
        ? { password: await bcrypt.hash(updateData.password, 12) }
        : {}),
    },
  });

  return excludePassword(updatedUser);
};

export const deleteUser = async (id: string): Promise<boolean> => {
  try {
    await prisma.user.delete({
      where: { id },
    });
    return true;
  } catch (error) {
    return false;
  }
};

export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};
