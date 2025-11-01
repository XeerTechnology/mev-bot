import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import * as opportunityService from "../services/opportunity.service";

// Get all opportunities with pagination
export const getOpportunities = asyncHandler(
  async (req: Request, res: Response) => {
    // Extract pagination params from query string, with defaults
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;

    const result = await opportunityService.getOpportunities({
      page,
      pageSize,
    });

    res
      .status(200)
      .json(new ApiResponse("Opportunities fetched successfully", result));
  }
);

// Get single opportunity by ID
export const getOpportunity = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const opportunity = await opportunityService.getOpportunityById(id);

    if (!opportunity) {
      throw new ApiError("Opportunity not found", 404);
    }

    res
      .status(200)
      .json(new ApiResponse("Opportunity fetched successfully", opportunity));
  }
);
