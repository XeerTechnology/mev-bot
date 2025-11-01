import { Contract, isAddress } from 'ethers';
import { prisma } from '../config/db';
import { logger } from './logger';
import { provider } from './provider';
import { config } from '../config/env.config';
import erc20Abi from '../abi/erc20.json';

/**
 * Interface for token information
 */
export interface TokenInfo {
  id?: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Check if token exists in database
 * @param tokenAddress - The token address to check
 * @returns Promise<TokenInfo | null> - Token information if found, null otherwise
 */
export async function getTokenFromDb(
  tokenAddress: string,
): Promise<TokenInfo | null> {
  try {
    if (!isAddress(tokenAddress)) {
      logger.warn(`Invalid token address: ${tokenAddress}`);
      return null;
    }

    const normalizedAddress = tokenAddress.toLowerCase();
    const token = await prisma.token.findUnique({
      where: {
        chainId_tokenAddress: {
          chainId: config.chainId,
          tokenAddress: normalizedAddress,
        },
      },
    });

    if (token) {
      logger.info(
        `Token found in database: ${token.tokenSymbol} (${token.tokenAddress})`,
      );
      return {
        id: token.id,
        tokenAddress: token.tokenAddress,
        tokenName: token.tokenName,
        tokenSymbol: token.tokenSymbol,
        tokenDecimals: token.tokenDecimals,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      };
    }

    return null;
  } catch (error) {
    logger.error('Error getting token from database:', error);
    throw error;
  }
}

/**
 * Fetch token data from blockchain (name, symbol, decimals)
 * @param tokenAddress - The token address to fetch
 * @param providerInstance - Optional provider instance (uses default if not provided)
 * @returns Promise<TokenInfo | null> - Token information if successful, null if token doesn't exist
 */
export async function fetchTokenFromChain(
  tokenAddress: string,
  providerInstance?: any,
): Promise<TokenInfo | null> {
  try {
    if (!isAddress(tokenAddress)) {
      logger.warn(`Invalid token address: ${tokenAddress}`);
      return null;
    }

    const normalizedAddress = tokenAddress.toLowerCase();
    const tokenContract = new Contract(
      normalizedAddress,
      erc20Abi,
      providerInstance || provider(), // Get fresh provider with random RPC if not provided
    );

    // Fetch token data in parallel
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name().catch(() => 'Unknown'),
      tokenContract.symbol().catch(() => 'UNKNOWN'),
      tokenContract.decimals().catch(() => 18),
    ]);

    // Handle case where decimals might be returned as bigint
    const decimalsNum =
      typeof decimals === 'bigint' ? Number(decimals) : decimals;

    logger.info(
      `Fetched token from chain: ${symbol} (${name}) - ${decimalsNum} decimals`,
    );

    return {
      tokenAddress: normalizedAddress,
      tokenName: name,
      tokenSymbol: symbol,
      tokenDecimals: decimalsNum,
    };
  } catch (error) {
    logger.error(`Error fetching token from chain (${tokenAddress}):`, error);
    return null;
  }
}

/**
 * Add token to database
 * @param tokenInfo - Token information to save
 * @returns Promise<TokenInfo> - Saved token information
 */
export async function addTokenToDb(tokenInfo: TokenInfo): Promise<TokenInfo> {
  try {
    const normalizedAddress = tokenInfo.tokenAddress.toLowerCase();

    const savedToken = await prisma.token.upsert({
      where: {
        chainId_tokenAddress: {
          chainId: config.chainId,
          tokenAddress: normalizedAddress,
        },
      },
      update: {
        tokenName: tokenInfo.tokenName,
        tokenSymbol: tokenInfo.tokenSymbol,
        tokenDecimals: tokenInfo.tokenDecimals,
        updatedAt: new Date(),
      },
      create: {
        chainId: config.chainId,
        tokenAddress: normalizedAddress,
        tokenName: tokenInfo.tokenName,
        tokenSymbol: tokenInfo.tokenSymbol,
        tokenDecimals: tokenInfo.tokenDecimals,
      },
    });

    logger.info(
      `Token saved to database: ${savedToken.tokenSymbol} (${savedToken.tokenAddress})`,
    );

    return {
      id: savedToken.id,
      tokenAddress: savedToken.tokenAddress,
      tokenName: savedToken.tokenName,
      tokenSymbol: savedToken.tokenSymbol,
      tokenDecimals: savedToken.tokenDecimals,
      createdAt: savedToken.createdAt,
      updatedAt: savedToken.updatedAt,
    };
  } catch (error) {
    logger.error('Error adding token to database:', error);
    throw error;
  }
}

/**
 * Get token information - Database-first approach
 * Checks database first, if not found fetches from chain and saves to database
 * @param tokenAddress - The token address to get information for
 * @param providerInstance - Optional provider instance (uses default if not provided)
 * @returns Promise<TokenInfo | null> - Token information or null if not found
 */
export async function getToken(
  tokenAddress: string,
  providerInstance?: any,
): Promise<TokenInfo | null> {
  try {
    if (!isAddress(tokenAddress)) {
      logger.warn(`Invalid token address: ${tokenAddress}`);
      return null;
    }

    // Check database first
    const dbToken = await getTokenFromDb(tokenAddress);
    if (dbToken) {
      return dbToken;
    }

    // If not in database, fetch from chain
    logger.info(
      `Token not found in database, fetching from chain: ${tokenAddress}`,
    );
    const chainToken = await fetchTokenFromChain(
      tokenAddress,
      providerInstance,
    );

    if (!chainToken) {
      logger.warn(`Could not fetch token from chain: ${tokenAddress}`);
      return null;
    }

    // Save to database and return
    const savedToken = await addTokenToDb(chainToken);
    return savedToken;
  } catch (error) {
    logger.error(`Error getting token (${tokenAddress}):`, error);
    throw error;
  }
}

/**
 * Get multiple tokens - Database-first approach with batch processing
 * @param tokenAddresses - Array of token addresses to get information for
 * @param providerInstance - Optional provider instance (uses default if not provided)
 * @returns Promise<TokenInfo[]> - Array of token information (only successful fetches)
 */
export async function getMultipleTokens(
  tokenAddresses: string[],
  providerInstance?: any,
): Promise<TokenInfo[]> {
  try {
    const tokenPromises = tokenAddresses.map((address) =>
      getToken(address, providerInstance),
    );
    const tokens = await Promise.all(tokenPromises);
    return tokens.filter((token): token is TokenInfo => token !== null);
  } catch (error) {
    logger.error('Error getting multiple tokens:', error);
    throw error;
  }
}
