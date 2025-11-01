import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(`Route not found - ${req.originalUrl}`, 404));
};
