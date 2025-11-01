import { DecodedTransaction } from '../decoder/interfaces';
import { getPools } from '../utils/getPools';
import { getV2PriceImpact } from './getV2PriceImpact';
import { getV3PriceImpact } from './getV3PriceImpact';
import { getV2Liquidity } from './getV2Liquidity';
import { getV3Liquidity } from './getV3Liquidity';
import { getToken } from '../utils/getToken';
import { provider } from '../utils/provider';
import { logger } from '../utils/logger';
import { formatUnits, parseUnits } from 'ethers';
import { constants, isAddressInList } from '../utils/constants';

export interface OpportunityResult {
  isOpportunity: boolean;
  profitPotential?: string;
  priceImpact?: number;
  poolAddress?: string;
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
  reason?: string;
  timeToSubmitSeconds?: number; // Seconds until deadline expires (when tx should be submitted)
  deadlineTimestamp?: number; // Deadline as Unix timestamp
  isExpired?: boolean; // Whether the deadline has already passed
}

/**
 * Detect opportunities in decoded transactions
 * Checks for arbitrage potential, price impact, and profitable swaps
 */
export async function detectOpportunity(
  txHash: string,
  decodedTx: DecodedTransaction,
  routerAddress: string,
): Promise<OpportunityResult> {
  try {
    const rpcProvider = provider();

    // Get token information (with decimals)
    const [tokenInInfo, tokenOutInfo] = await Promise.all([
      getToken(decodedTx.tokenIn, rpcProvider),
      getToken(decodedTx.tokenOut, rpcProvider),
    ]);

    if (!tokenInInfo || !tokenOutInfo) {
      return {
        isOpportunity: false,
        reason: 'Token information not available',
      };
    }

    const tokenInDecimals = tokenInInfo.tokenDecimals;
    const tokenOutDecimals = tokenOutInfo.tokenDecimals;

    // If routerAddress is a Universal Router, use the actual V2/V3 router address
    // Universal Router doesn't have factory() method, so we need the actual router
    let actualRouterAddress = routerAddress;
    if (isAddressInList(routerAddress, constants.universalRouter)) {
      // Use the appropriate router based on routerType
      if (decodedTx.routerType === 'v2') {
        actualRouterAddress = constants.v2Router[0];
      } else if (decodedTx.routerType === 'v3') {
        actualRouterAddress = constants.v3Router[0];
      } else {
        logger.warn(
          `[Opportunity] Unknown routerType ${decodedTx.routerType} for Universal Router transaction ${txHash}`,
        );
        return {
          isOpportunity: false,
          reason: `Unknown routerType: ${decodedTx.routerType}`,
        };
      }
      logger.debug(
        `[Opportunity] Mapped Universal Router ${routerAddress} to ${decodedTx.routerType} router ${actualRouterAddress} for ${txHash}`,
      );
    }

    // Get pool information
    const pool = await getPools(
      decodedTx.tokenIn,
      decodedTx.tokenOut,
      actualRouterAddress,
      decodedTx.routerType,
      decodedTx.fee,
    );

    if (!pool || !pool.poolAddress) {
      logger.warn(
        `[Opportunity] Pool not found for ${decodedTx.tokenIn}/${decodedTx.tokenOut} (${txHash})`,
      );
      return {
        isOpportunity: false,
        reason: 'Pool not found',
      };
    }

    logger.debug(`[Opportunity] Pool found: ${pool.poolAddress} for ${txHash}`);

    // Determine amountIn to use for liquidity check
    let amountInToCheck = BigInt(decodedTx.amountIn);
    if (amountInToCheck === BigInt(0) && decodedTx.amountInMax) {
      const amountInMax = BigInt(decodedTx.amountInMax);
      if (amountInMax > BigInt(0)) {
        amountInToCheck = amountInMax;
      }
    }

    // Check liquidity requirements before calculating price impact
    // Rule: Trade size should be less than 50% of available liquidity to avoid excessive slippage
    const MAX_LIQUIDITY_USAGE = BigInt(50); // 50% of reserves/liquidity

    if (amountInToCheck > BigInt(0)) {
      try {
        if (decodedTx.routerType === 'v2') {
          // Check V2 liquidity (reserves)
          const liquidityInfo = await getV2Liquidity(
            pool.poolAddress,
            rpcProvider,
            tokenInDecimals,
            tokenOutDecimals,
          );

          // Determine which reserve to check based on tokenIn
          const token0 = liquidityInfo.token0.toLowerCase();
          const tokenInLower = decodedTx.tokenIn.toLowerCase();
          const reserveIn =
            tokenInLower === token0
              ? liquidityInfo.reserve0
              : liquidityInfo.reserve1;

          // Check if trade size exceeds maximum allowed (50% of reserve)
          const maxTradeSize = (reserveIn * MAX_LIQUIDITY_USAGE) / BigInt(100);

          if (amountInToCheck > maxTradeSize) {
            logger.warn(
              `[Opportunity] Insufficient liquidity for V2 pool ${pool.poolAddress}: ` +
                `trade size (${amountInToCheck.toString()}) exceeds 50% of reserve (${reserveIn.toString()}) for ${txHash}`,
            );
            return {
              isOpportunity: false,
              reason: `Insufficient liquidity: trade size (${formatUnits(
                amountInToCheck,
                tokenInDecimals,
              )}) > 50% of reserve (${formatUnits(
                reserveIn,
                tokenInDecimals,
              )})`,
              poolAddress: pool.poolAddress,
              tokenInDecimals,
              tokenOutDecimals,
            };
          }

          // Additional check: Ensure minimum reserve exists (at least 10x trade size)
          const MIN_RESERVE_RATIO = BigInt(10);
          if (reserveIn < amountInToCheck * MIN_RESERVE_RATIO) {
            logger.warn(
              `[Opportunity] Low liquidity ratio for V2 pool ${pool.poolAddress}: ` +
                `reserve (${reserveIn.toString()}) < 10x trade size (${amountInToCheck.toString()}) for ${txHash}`,
            );
            return {
              isOpportunity: false,
              reason: `Low liquidity: reserve (${formatUnits(
                reserveIn,
                tokenInDecimals,
              )}) < 10x trade size (${formatUnits(
                amountInToCheck,
                tokenInDecimals,
              )})`,
              poolAddress: pool.poolAddress,
              tokenInDecimals,
              tokenOutDecimals,
            };
          }

          logger.debug(
            `[Opportunity] V2 liquidity check passed: reserve=${reserveIn.toString()}, trade=${amountInToCheck.toString()}, ratio=${
              Number(reserveIn) / Number(amountInToCheck)
            }`,
          );
        } else if (decodedTx.routerType === 'v3') {
          // Check V3 liquidity
          const liquidityInfo = await getV3Liquidity(
            pool.poolAddress,
            rpcProvider,
          );

          // V3 liquidity check: Ensure pool has sufficient liquidity
          // V3 liquidity is more complex (tick-based), but we check total liquidity
          // A rough estimate: if liquidity is very low, the trade might fail
          // We use a heuristic: trade should use less than 30% of available liquidity

          // For V3, we need to estimate if the trade size is reasonable
          // Since V3 uses ticks, we can't directly compare amounts, but we can check:
          // 1. Pool has non-zero liquidity
          // 2. Liquidity is above a minimum threshold

          if (liquidityInfo.liquidity === BigInt(0)) {
            logger.warn(
              `[Opportunity] Zero liquidity for V3 pool ${pool.poolAddress} for ${txHash}`,
            );
            return {
              isOpportunity: false,
              reason: 'Zero liquidity in V3 pool',
              poolAddress: pool.poolAddress,
              tokenInDecimals,
              tokenOutDecimals,
            };
          }

          // Heuristic: V3 pools with very low liquidity (< 1e12) are likely too small
          // This is a rough check - actual liquidity depends on price range
          const MIN_V3_LIQUIDITY = BigInt('1000000000000'); // 1e12
          if (liquidityInfo.liquidity < MIN_V3_LIQUIDITY) {
            logger.warn(
              `[Opportunity] Very low liquidity for V3 pool ${pool.poolAddress}: ` +
                `liquidity=${liquidityInfo.liquidity.toString()} for ${txHash}`,
            );
            return {
              isOpportunity: false,
              reason: `Very low V3 liquidity: ${liquidityInfo.liquidity.toString()}`,
              poolAddress: pool.poolAddress,
              tokenInDecimals,
              tokenOutDecimals,
            };
          }

          logger.debug(
            `[Opportunity] V3 liquidity check passed: liquidity=${liquidityInfo.liquidity.toString()}`,
          );
        }
      } catch (error) {
        logger.warn(
          `[Opportunity] Error checking liquidity for ${txHash}, continuing anyway:`,
          error,
        );
        // Continue with price impact calculation even if liquidity check fails
      }
    }

    // Calculate price impact based on router type
    let priceImpact: number | undefined;
    let calculatedAmountOut: bigint | undefined;

    try {
      if (decodedTx.routerType === 'v2') {
        // Use amountInToCheck determined in liquidity check section
        const amountInToUse = amountInToCheck;

        if (amountInToUse > BigInt(0)) {
          logger.debug(
            `[Opportunity] Calculating V2 price impact for ${txHash}, amountIn: ${amountInToUse.toString()}`,
          );
          const impact = await getV2PriceImpact(
            pool.poolAddress,
            decodedTx.tokenIn,
            amountInToUse,
            rpcProvider,
            tokenInDecimals,
            tokenOutDecimals,
          );
          priceImpact = impact.priceImpactPercent / 100; // Convert percentage to decimal (e.g. 0.23% -> 0.0023)
          calculatedAmountOut = impact.amountOut;
          logger.debug(
            `[Opportunity] V2 price impact: ${priceImpact} (${
              impact.priceImpactPercent
            }%), amountOut: ${calculatedAmountOut?.toString() || 'undefined'}`,
          );
        } else {
          logger.warn(
            `[Opportunity] Invalid amountIn for V2: ${
              decodedTx.amountIn
            }, amountInMax: ${decodedTx.amountInMax || 'undefined'}`,
          );
        }
      } else if (decodedTx.routerType === 'v3') {
        const amountIn = BigInt(decodedTx.amountIn);
        if (amountIn > BigInt(0) && decodedTx.fee) {
          logger.debug(
            `[Opportunity] Calculating V3 price impact for ${txHash}`,
          );
          const impact = await getV3PriceImpact(
            pool.poolAddress,
            decodedTx.tokenIn,
            decodedTx.tokenOut,
            decodedTx.fee,
            amountIn,
            rpcProvider,
            tokenInDecimals,
            tokenOutDecimals,
          );
          priceImpact = impact.priceImpactPercent / 100; // Convert percentage to decimal (e.g. 0.23% -> 0.0023)
          calculatedAmountOut = impact.amountOut;
          logger.debug(
            `[Opportunity] V3 price impact: ${priceImpact} (${
              impact.priceImpactPercent
            }%), amountOut: ${calculatedAmountOut?.toString() || 'undefined'}`,
          );
        } else {
          logger.warn(
            `[Opportunity] Invalid V3 params: amountIn=${decodedTx.amountIn}, fee=${decodedTx.fee}`,
          );
        }
      }
    } catch (error) {
      logger.error(
        `[Opportunity] Error calculating price impact for ${txHash}:`,
        error,
      );
      // Continue with undefined values - will mark as no opportunity
    }

    // Calculate profit potential
    // Profit = (Expected Amount Out - Minimum Amount Out) - Gas Costs (estimated)
    let profitPotential: bigint | undefined;
    if (calculatedAmountOut && decodedTx.amountOutMin) {
      // Check if amountOutMin is valid (not empty, not '0', not undefined)
      const amountOutMinStr = decodedTx.amountOutMin?.trim();
      if (
        amountOutMinStr &&
        amountOutMinStr !== '0' &&
        amountOutMinStr !== '' &&
        !isNaN(Number(amountOutMinStr))
      ) {
        try {
          const expectedOut = calculatedAmountOut;
          const minOut = BigInt(amountOutMinStr);

          // Basic profit calculation (without gas costs for now)
          // Profit = expected amount out - minimum amount out
          if (expectedOut > minOut) {
            profitPotential = expectedOut - minOut;
            logger.debug(
              `[Opportunity] Profit calculated for ${txHash}: expectedOut=${expectedOut.toString()}, minOut=${minOut.toString()}, profit=${profitPotential.toString()}`,
            );
          } else if (expectedOut === minOut) {
            logger.debug(
              `[Opportunity] Zero profit for ${txHash}: expectedOut=${expectedOut.toString()} == minOut=${minOut.toString()}`,
            );
            profitPotential = BigInt(0);
          } else {
            logger.debug(
              `[Opportunity] Negative profit for ${txHash}: expectedOut=${expectedOut.toString()} < minOut=${minOut.toString()}`,
            );
            // Negative profit means the expected output is less than minimum - not profitable
            profitPotential = undefined;
          }
        } catch (error) {
          logger.warn(
            `[Opportunity] Error calculating profit for ${txHash}:`,
            error,
          );
        }
      } else {
        logger.debug(
          `[Opportunity] Invalid amountOutMin for ${txHash}: "${decodedTx.amountOutMin}"`,
        );
      }
    } else {
      logger.debug(
        `[Opportunity] Cannot calculate profit for ${txHash}: calculatedAmountOut=${
          calculatedAmountOut?.toString() || 'undefined'
        }, amountOutMin=${decodedTx.amountOutMin || 'undefined'}`,
      );
    }

    // Opportunity criteria:
    // 1. Significant price impact (>= 0.5%)
    // 2. Positive profit potential
    // 3. Large trade size (optional - can be configurable)
    const MIN_PRICE_IMPACT = 0.005; // 0.5%
    const isProfitable = profitPotential && profitPotential > BigInt(0);
    const hasSignificantImpact =
      priceImpact !== undefined && priceImpact >= MIN_PRICE_IMPACT;

    const isOpportunity = Boolean(isProfitable && hasSignificantImpact);

    // Format profit potential (handle BigInt(0) as well)
    const profitPotentialFormatted =
      profitPotential !== undefined
        ? formatUnits(profitPotential, tokenOutDecimals)
        : undefined;

    // Calculate time to submit transaction based on deadline
    let timeToSubmitSeconds: number | undefined;
    let deadlineTimestamp: number | undefined;
    let isExpired = false;

    if (decodedTx.deadline) {
      try {
        // Parse deadline (it's a Unix timestamp string)
        const deadlineStr = decodedTx.deadline.trim();
        if (deadlineStr && deadlineStr !== '0' && !isNaN(Number(deadlineStr))) {
          deadlineTimestamp = parseInt(deadlineStr, 10);
          const currentTimestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds
          const timeRemaining = deadlineTimestamp - currentTimestamp;

          if (timeRemaining > 0) {
            timeToSubmitSeconds = timeRemaining;
            logger.debug(
              `[Opportunity] Time to submit for ${txHash}: ${timeToSubmitSeconds}s (deadline: ${new Date(
                deadlineTimestamp * 1000,
              ).toISOString()})`,
            );
          } else {
            isExpired = true;
            timeToSubmitSeconds = 0;
            logger.warn(
              `[Opportunity] Deadline expired for ${txHash}: deadline was ${new Date(
                deadlineTimestamp * 1000,
              ).toISOString()}, current: ${new Date(
                currentTimestamp * 1000,
              ).toISOString()}`,
            );
          }
        } else {
          logger.debug(
            `[Opportunity] Invalid deadline format for ${txHash}: "${decodedTx.deadline}"`,
          );
        }
      } catch (error) {
        logger.warn(
          `[Opportunity] Error parsing deadline for ${txHash}:`,
          error,
        );
      }
    } else {
      logger.debug(`[Opportunity] No deadline provided for ${txHash}`);
    }

    logger.info(
      `Opportunity analysis for ${txHash}: impact=${priceImpact}, profit=${profitPotentialFormatted}, timeToSubmit=${
        timeToSubmitSeconds !== undefined ? `${timeToSubmitSeconds}s` : 'N/A'
      }${isExpired ? ' (EXPIRED)' : ''}`,
    );

    return {
      isOpportunity,
      profitPotential: profitPotentialFormatted,
      priceImpact,
      poolAddress: pool.poolAddress,
      tokenInDecimals,
      tokenOutDecimals,
      reason: isOpportunity
        ? 'Profitable opportunity detected'
        : hasSignificantImpact
        ? 'Price impact but no profit'
        : isExpired
        ? 'Deadline expired'
        : 'No significant opportunity',
      timeToSubmitSeconds,
      deadlineTimestamp,
      isExpired,
    };
  } catch (error) {
    // Serialize error to handle BigInt values
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          )
        : String(error);
    logger.error(`Error detecting opportunity for ${txHash}: ${errorMessage}`);
    return {
      isOpportunity: false,
      reason: `Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    };
  }
}
