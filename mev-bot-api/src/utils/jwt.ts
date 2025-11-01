import jwt from "jsonwebtoken";
import { ApiError } from "./apiError";

// Token payload interface
export interface TokenPayload {
  userId: string;
  email: string;
}

// JWT configuration
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "your-refresh-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

// Generate access token
export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "mev-backend",
    audience: "mev-frontend",
  } as jwt.SignOptions);
};

// Generate refresh token
export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: "mev-backend",
    audience: "mev-frontend",
  } as jwt.SignOptions);
};

// Verify access token
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: "mev-backend",
      audience: "mev-frontend",
    }) as TokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError("Access token has expired", 401);
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError("Invalid access token", 401);
    }
    throw new ApiError("Token verification failed", 401);
  }
};

// Verify refresh token
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: "mev-backend",
      audience: "mev-frontend",
    }) as TokenPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError("Refresh token has expired", 401);
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError("Invalid refresh token", 401);
    }
    throw new ApiError("Token verification failed", 401);
  }
};

// Generate token pair
export const generateTokenPair = (payload: TokenPayload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};
