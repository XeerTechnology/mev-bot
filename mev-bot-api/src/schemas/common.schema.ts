import { z } from "zod";

// Common validation schemas that can be reused across the application

// Pagination schema
export const paginationSchema = z.object({
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1))
    .default(() => 1),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(100))
    .default(() => 10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Search schema
export const searchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(100, "Search query too long"),
  filters: z.record(z.string(), z.string()).optional(),
});

// Date range schema
export const dateRangeSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Start date must be before end date",
      path: ["endDate"],
    }
  );

// File upload schema
export const fileUploadSchema = z.object({
  file: z.object({
    fieldname: z.string(),
    originalname: z.string(),
    encoding: z.string(),
    mimetype: z.string(),
    size: z.number().max(5 * 1024 * 1024, "File size must be less than 5MB"), // 5MB limit
    buffer: z.instanceof(Buffer),
  }),
});

// Environment variables schema (useful for config validation)
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(65535))
    .default(() => 3000),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  API_KEY: z.string().min(1).optional(),
});

// Generic ID parameter schema
export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid ID format"),
  }),
});

// Generic query parameters schema
export const queryParamsSchema = z.object({
  query: z.object({
    include: z.string().optional(),
    fields: z.string().optional(),
    ...paginationSchema.shape,
  }),
});

// Export types
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type EnvInput = z.infer<typeof envSchema>;
export type IdParam = z.infer<typeof idParamSchema>["params"];
export type QueryParams = z.infer<typeof queryParamsSchema>["query"];
