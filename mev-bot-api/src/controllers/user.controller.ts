import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import * as userService from "../services/user.service";
import * as refreshTokenService from "../services/refreshToken.service";
import {
  generateTokenPair,
  generateAccessToken,
  verifyRefreshToken,
} from "../utils/jwt";

// Get all users
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.status(200).json(new ApiResponse("Users fetched successfully", users));
});

// Get user by ID
export const getUserById = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await userService.getUserById(req.params.id);
    if (!user) throw new ApiError("User not found", 404);
    res.status(200).json(new ApiResponse("User fetched successfully", user));
  }
);

// Register new user
export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const user = await userService.createUser({
      email,
      password,
    });

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const { accessToken, refreshToken } = generateTokenPair(tokenPayload);

    // Store refresh token in database
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

    await refreshTokenService.createRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiry
    );

    // Send the refreshToken as an httpOnly cookie
    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .status(201)
      .json(
        new ApiResponse("User registered successfully", {
          user,
          accessToken,
        })
      );
  }
);

// Login user
export const loginUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    const user = await userService.getUserByEmailForAuth(email);
    if (!user) {
      throw new ApiError("Invalid email or password", 401);
    }

    // Verify password
    const isPasswordValid = await userService.verifyPassword(
      password,
      user.password
    );

    if (!isPasswordValid) {
      throw new ApiError("Invalid email or password", 401);
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const { accessToken, refreshToken } = generateTokenPair(tokenPayload);

    // Store refresh token in database
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

    await refreshTokenService.createRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiry
    );

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Send the refreshToken as an httpOnly cookie
    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .status(200)
      .json(
        new ApiResponse("Login successful", {
          user: userWithoutPassword,
          accessToken,
        })
      );
  }
);

// Refresh token
export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (!refreshToken) {
      throw new ApiError("Refresh token not found in cookies", 401);
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if refresh token exists in database
    const storedToken = await refreshTokenService.findRefreshToken(
      refreshToken
    );
    if (!storedToken) {
      throw new ApiError("Invalid refresh token", 401);
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      await refreshTokenService.deleteRefreshToken(refreshToken);
      // Clear refresh token cookie when expired
      return res
        .clearCookie("refreshToken", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
        })
        .status(401)
        .json(new ApiResponse("Refresh token has expired", null));
    }

    // Generate new access token only (keep existing refresh token)
    const tokenPayload = {
      userId: storedToken.user.id,
      email: storedToken.user.email,
    };

    const accessToken = generateAccessToken(tokenPayload);

    res.status(200).json(
      new ApiResponse("Access token refreshed successfully", {
        accessToken,
        user: {
          userId: storedToken.user.id,
          email: storedToken.user.email,
        },
      })
    );
  }
);

// Logout user
export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new ApiError("Unauthorized", 401);
  }

  const refreshToken = req.cookies?.refreshToken as string | undefined;

  if (refreshToken) {
    // Ensure the token belongs to this user before deleting
    const storedToken = await refreshTokenService.findRefreshToken(
      refreshToken
    );
    if (storedToken && storedToken.userId === userId) {
      await refreshTokenService.deleteRefreshToken(refreshToken);
    }
  }

  // Clear refresh token cookie
  res
    .clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    })
    .status(200)
    .json(new ApiResponse("Logout successful", null));
});

// Update user
export const updateUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const updateData = req.body;

    const user = await userService.getUserById(id);
    if (!user) {
      throw new ApiError("User not found", 404);
    }

    const updatedUser = await userService.updateUser(id, updateData);
    res
      .status(200)
      .json(new ApiResponse("User updated successfully", updatedUser));
  }
);

// Delete user
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await userService.getUserById(id);
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  await userService.deleteUser(id);
  res.status(200).json(new ApiResponse("User deleted successfully", null));
});
