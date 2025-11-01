// Re-export Zod types for convenience
export type {
  RegisterUserInput,
  LoginUserInput,
  UpdateUserInput,
  UserParams,
  RefreshTokenInput,
  LogoutInput,
} from "../schemas";

// Base user type
export interface User {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

// User without password for API responses
export interface UserWithoutPassword {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponseData<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any[];
}

// Validation error type
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}
