import { Router } from "express";
import {
  getUsers,
  getUserById,
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";
import { validate } from "../middlewares/zod.middleware";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  registerUserSchema,
  loginUserSchema,
  refreshTokenSchema,
  logoutSchema,
  updateUserSchema,
  userParamsSchema,
} from "../schemas";

const router = Router();

// GET /api/users - Get all users (protected)
// router.get("/", authenticateToken, getUsers);

// POST /api/users/register - Register new user
router.post("/register", validate(registerUserSchema), registerUser);

// POST /api/users/login - Login user
router.post("/login", validate(loginUserSchema), loginUser);

// POST /api/users/refresh-token - Refresh access token (reads refresh token from cookie)
router.get("/refresh-token", refreshToken);

// GET /api/users/:id - Get user by ID (protected)
router.get("/:id", authenticateToken, validate(userParamsSchema), getUserById);

// POST /api/users/logout - Logout user (protected)
router.post("/logout", authenticateToken, logoutUser);

// PUT /api/users/:id - Update user (protected)
router.put("/:id", authenticateToken, validate(updateUserSchema), updateUser);

// DELETE /api/users/:id - Delete user (protected)
router.delete(
  "/:id",
  authenticateToken,
  validate(userParamsSchema),
  deleteUser
);

export default router;
