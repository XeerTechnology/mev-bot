import { Router } from "express";
import {
  getOpportunities,
  getOpportunity,
} from "../controllers/opportunity.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

// GET /api/opportunities - Get all opportunities with pagination (protected)
router.get("/", authenticateToken, getOpportunities);

// GET /api/opportunities/:id - Get single opportunity by ID (protected)
router.get("/:id", authenticateToken, getOpportunity);

export default router;
