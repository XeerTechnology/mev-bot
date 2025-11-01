import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue, ZodTypeAny } from "zod";

export const validate =
  (schema: ZodTypeAny, part: "body" | "params" | "query" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      let dataToValidate;

      switch (part) {
        case "params":
          dataToValidate = req.params;
          break;
        case "query":
          dataToValidate = req.query;
          break;
        case "body":
        default:
          dataToValidate = req.body;
          break;
      }

      schema.parse(dataToValidate);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.issues.map((err: ZodIssue) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }
      next(error); // Pass other errors to the next error handling middleware
    }
  };
