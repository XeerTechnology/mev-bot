import { Contract, isAddress } from 'ethers';
import { provider } from './provider';
import { prisma } from '../config/db';
import { logger } from './logger';
import { config } from '../config/env.config';
import factoryV2Abi from '../abi/factoryV2.json';
import swapRouterV2Abi from '../abi/swapRouterV2.json';
import swapRouterV3Abi from '../abi/swapRouterV3.json';
import factoryV3Abi from '../abi/factoryV3.json';

/**
 * Interface for pool information
 */
export interface PoolInfo {
  id?: string;
  poolAddress: string;
  token0: string;
  token1: string;
  exists: boolean;
  routerType: string;
  fee: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interface for factory information
 */
export interface FactoryInfo {
  id?: string;
  router: string;
  routerType: string;
  factoryAddress: string;
  wethAddress: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Get factory address from database by router type
 * @param routerType - Type of router (e.g., 'v2-mainnet', 'v2-polygon')
 * @returns Promise<string> - Factory address
 */
export const getFactoryAddress = async (
  router: string,
  version: string,
): Promise<string | null> => {
  try {
    // Validate router address
    if (!isAddress(router)) {
      logger.error(`Invalid router address: ${router}`);
      return null;
    }

    const factory = await prisma.factoryAddress.findUnique({
      where: {
        chainId_router: {
          chainId: config.chainId,
          router,
        },
      },
    });

    if (!factory) {
      const rpcProvider = provider(); // Get fresh provider with random RPC
      let routerAbi = version === 'v2' ? swapRouterV2Abi : swapRouterV3Abi;
      const routerContract = new Contract(router, routerAbi, rpcProvider);
      const factoryAddress = await routerContract.factory();
      logger.info(`version: ${version}`);
      const wethAddress =
        version === 'v2'
          ? await routerContract.WETH()
          : await routerContract.WETH9();
      const insertFactory = await prisma.factoryAddress.create({
        data: {
          chainId: config.chainId,
          router,
          routerType: version,
          factoryAddress: factoryAddress,
          wethAddress: wethAddress,
        },
      });
      if (!insertFactory) {
        return null;
      }
      return factoryAddress;
    }

    return factory.factoryAddress;
  } catch (error) {
    logger.error('Error getting factory address:', error);
    throw error;
  }
};

/**
 * Helper function to validate if a pool address is valid (not zero address)
 * @param poolAddress - Pool address to validate
 * @returns boolean - True if valid, false if zero address
 */
const isValidPoolAddress = (poolAddress: string): boolean => {
  return (
    poolAddress !== '0x0000000000000000000000000000000000000000' &&
    poolAddress !== '0x0000000000000000000000000000000000000000'.toLowerCase()
  );
};

/**
 * Helper function to find existing pool by multiple criteria
 * @param token0 - Address of the first token
 * @param token1 - Address of the second token
 * @param routerType - Router type
 * @param poolAddress - Optional pool address to check
 * @returns Promise<PoolInfo | null> - Existing pool info or null
 */
const findExistingPool = async (
  token0: string,
  token1: string,
  routerType: string,
  poolAddress?: string,
): Promise<PoolInfo | null> => {
  try {
    // First try to find by poolAddress if provided (most efficient)
    if (poolAddress) {
      const poolByAddress = await prisma.pool.findUnique({
        where: {
          chainId_poolAddress: {
            chainId: config.chainId,
            poolAddress: poolAddress.toLowerCase(),
          },
        },
      });

      if (poolByAddress) {
        return {
          id: poolByAddress.id,
          poolAddress: poolByAddress.poolAddress,
          token0: poolByAddress.token0,
          token1: poolByAddress.token1,
          exists: poolByAddress.exists,
          routerType: poolByAddress.routerType,
          createdAt: poolByAddress.createdAt,
          updatedAt: poolByAddress.updatedAt,
          fee: poolByAddress.fee,
        };
      }
    }

    // Fallback: find by token pair and router type
    const poolByTokens = await prisma.pool.findFirst({
      where: {
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
        routerType: routerType,
      },
    });

    if (poolByTokens) {
      return {
        id: poolByTokens.id,
        poolAddress: poolByTokens.poolAddress,
        token0: poolByTokens.token0,
        token1: poolByTokens.token1,
        exists: poolByTokens.exists,
        routerType: poolByTokens.routerType,
        createdAt: poolByTokens.createdAt,
        updatedAt: poolByTokens.updatedAt,
        fee: poolByTokens.fee,
      };
    }

    return null;
  } catch (error) {
    logger.error('Error finding existing pool:', error);
    return null;
  }
};

/**
 * Get Uniswap V2 pool address from token0 and token1 addresses
 * Database-first approach: Check DB first, then contract if not found
 * @param token0 - Address of the first token
 * @param token1 - Address of the second token
 * @param routerType - Router type (defaults to 'v2-mainnet')
 * @param poolName - Optional name for the pool
 * @returns Promise<PoolInfo> - Pool information including address and existence
 */
export const getPools = async (
  token0: string,
  token1: string,
  router: string,
  routerType: string,
  fee?: string,
): Promise<PoolInfo | null> => {
  try {
    // Validate input addresses
    logger.info(`token0: ${token0}, token1: ${token1}`);
    if (!isAddress(token0) || !isAddress(token1)) {
      throw new Error('Invalid token addresses provided');
    }

    // Normalize addresses to lowercase for consistent storage
    const normalizedToken0 = token0.toLowerCase();
    const normalizedToken1 = token1.toLowerCase();

    // Get factory address from database
    const factoryAddress = await getFactoryAddress(router, routerType);
    if (!factoryAddress) {
      logger.error(`No factory address found for router: ${router}`);
      return null;
    }

    // Create factory contract instance
    const rpcProvider = provider(); // Get fresh provider with random RPC
    const factoryContract = new Contract(
      factoryAddress,
      routerType === 'v2' ? factoryV2Abi : factoryV3Abi,
      rpcProvider,
    );

    // Get pool address from factory with timeout handling
    let poolAddress: string;
    try {
      poolAddress = await Promise.race([
        routerType === 'v2'
          ? factoryContract.getPair(normalizedToken0, normalizedToken1)
          : factoryContract.getPool(normalizedToken0, normalizedToken1, fee),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Pool fetch timeout')), 15000),
        ),
      ]);
      logger.info(`Pool address: ${poolAddress}`);
    } catch (error: any) {
      const isTimeout =
        error?.message?.includes('timeout') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.code === 'ETIMEDOUT';

      if (isTimeout) {
        logger.warn(
          `Timeout fetching pool for ${normalizedToken0}/${normalizedToken1}, trying database lookup`,
        );
        // Try to find in database as fallback
        const existingPool = await findExistingPool(
          normalizedToken0,
          normalizedToken1,
          routerType,
        );
        if (existingPool && isValidPoolAddress(existingPool.poolAddress)) {
          logger.info(
            `Using cached pool from database: ${existingPool.poolAddress}`,
          );
          return existingPool;
        }
      }
      throw error; // Re-throw if not timeout or database lookup failed
    }

    // Check if pool exists (address will be zero address if it doesn't exist)
    const exists = isValidPoolAddress(poolAddress);

    // Check database first using helper function
    // This prevents unique constraint errors by checking both poolAddress and token pairs
    const existingPool = await findExistingPool(
      normalizedToken0,
      normalizedToken1,
      routerType,
      poolAddress,
    );

    if (existingPool) {
      // Check if the existing pool is actually valid (not zero address)
      if (!isValidPoolAddress(existingPool.poolAddress)) {
        logger.info(
          `Found invalid pool address in database, pool does not exist for tokens: ${normalizedToken0}, ${normalizedToken1}`,
        );
        return null;
      }

      logger.info(`Pool found in database: ${existingPool.poolAddress}`);
      return existingPool;
    }

    // If pool doesn't exist on-chain, return null
    if (!exists) {
      logger.info(
        `Pool does not exist on-chain for tokens: ${normalizedToken0}, ${normalizedToken1}`,
      );
      return null;
    }

    // Create or update pool record using upsert
    const savedPool = await prisma.pool.upsert({
      where: {
        chainId_poolAddress: {
          chainId: config.chainId,
          poolAddress: poolAddress.toLowerCase(),
        },
      },
      update: {
        token0: normalizedToken0,
        token1: normalizedToken1,
        exists: exists,
        routerType: routerType,
        updatedAt: new Date(),
      },
      create: {
        chainId: config.chainId,
        poolAddress: poolAddress.toLowerCase(),
        token0: normalizedToken0,
        token1: normalizedToken1,
        exists: exists,
        routerType: routerType,
        fee: fee ?? '2500',
      },
    });

    return {
      id: savedPool.id,
      poolAddress: savedPool.poolAddress,
      token0: savedPool.token0,
      token1: savedPool.token1,
      exists: savedPool.exists,
      routerType: savedPool.routerType,
      fee: savedPool.fee,
      createdAt: savedPool.createdAt,
      updatedAt: savedPool.updatedAt,
    };
  } catch (error) {
    logger.error('Error getting V2 pool:', error);
    throw error;
  }
};

/**
 * Get multiple pools for a given token against a list of other tokens
 * Database-first approach with batch processing
 * @param baseToken - The base token address
 * @param tokens - Array of token addresses to pair with base token
 * @param routerType - Router type (defaults to 'v2-mainnet')
 * @returns Promise<PoolInfo[]> - Array of pool information
 */
export const getMultiplePoolsV2 = async (
  baseToken: string,
  tokens: string[],
  routerType: string = 'v2',
): Promise<PoolInfo[]> => {
  try {
    const poolPromises = tokens.map((token) =>
      getPools(baseToken, token, 'null address', routerType),
    );
    const pools = await Promise.all(poolPromises);
    return pools.filter((pool): pool is PoolInfo => pool !== null);
  } catch (error) {
    logger.error('Error getting multiple V2 pools:', error);
    throw error;
  }
};

/**
 * Get all pools from database
 * @returns Promise<PoolInfo[]> - Array of all pools
 */
export const getAllPoolsV2 = async (): Promise<PoolInfo[]> => {
  try {
    const pools = await prisma.pool.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return pools.map(
      (pool: {
        id: string;
        poolAddress: string;
        token0: string;
        token1: string;
        exists: boolean;
        routerType: string;
        fee: string;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: pool.id,
        poolAddress: pool.poolAddress,
        token0: pool.token0,
        token1: pool.token1,
        exists: pool.exists,
        routerType: pool.routerType,
        fee: pool.fee,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      }),
    );
  } catch (error) {
    logger.error('Error getting all V2 pools:', error);
    throw error;
  }
};

/**
 * Update pool information in database
 * @param poolId - Pool ID to update
 * @param updateData - Partial pool data to update
 * @returns Promise<PoolInfo> - Updated pool information
 */
export const updatePoolV2 = async (
  poolId: string,
  updateData: Partial<Omit<PoolInfo, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<PoolInfo> => {
  try {
    const updatedPool = await prisma.pool.update({
      where: {
        id: poolId,
      },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    return {
      id: updatedPool.id,
      poolAddress: updatedPool.poolAddress,
      token0: updatedPool.token0,
      token1: updatedPool.token1,
      exists: updatedPool.exists,
      routerType: updatedPool.routerType,
      fee: updatedPool.fee,
      createdAt: updatedPool.createdAt,
      updatedAt: updatedPool.updatedAt,
    };
  } catch (error) {
    logger.error('Error updating V2 pool:', error);
    throw error;
  }
};

/**
 * Clean up invalid pools (zero address) from database
 * @returns Promise<number> - Number of pools deleted
 */
export const cleanupInvalidPools = async (): Promise<number> => {
  try {
    const result = await prisma.pool.deleteMany({
      where: {
        poolAddress: '0x0000000000000000000000000000000000000000',
      },
    });

    logger.info(`Cleaned up ${result.count} invalid pools from database`);
    return result.count;
  } catch (error) {
    logger.error('Error cleaning up invalid pools:', error);
    throw error;
  }
};

/**
 * Add or update factory address in database
 * @param factoryData - Factory address data
 * @returns Promise<FactoryInfo> - Factory information
 */
export const upsertFactoryAddress = async (
  factoryData: Omit<FactoryInfo, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<FactoryInfo> => {
  try {
    const factory = await prisma.factoryAddress.upsert({
      where: {
        chainId_router: {
          chainId: config.chainId,
          router: factoryData.router,
        },
      },
      update: {
        router: factoryData.router,
        factoryAddress: factoryData.factoryAddress,
        wethAddress: factoryData.wethAddress,
        updatedAt: new Date(),
      },
      create: {
        chainId: config.chainId,
        ...factoryData,
      },
    });

    return {
      id: factory.id,
      router: factory.router,
      routerType: factory.routerType,
      factoryAddress: factory.factoryAddress,
      wethAddress: factory.wethAddress,
      createdAt: factory.createdAt,
      updatedAt: factory.updatedAt,
    };
  } catch (error) {
    logger.error('Error upserting factory address:', error);
    throw error;
  }
};
