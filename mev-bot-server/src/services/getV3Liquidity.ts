import { Contract } from 'ethers';
import IUniswapV3Pool from '../abi/poolV3.json';

export interface V3LiquidityInfo {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: bigint;
  liquidity: bigint;
  liquidityFormatted: string;
  sqrtPriceX96: bigint;
  sqrtPriceX96Formatted: string;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

/**
 * Get V3 pool liquidity information including liquidity, price, and tick data
 * @param poolAddress - Address of the V3 pool
 * @param provider - Ethers provider instance
 * @returns Promise<V3LiquidityInfo> - Liquidity information
 */
export async function getV3Liquidity(
  poolAddress: string,
  provider: any,
): Promise<V3LiquidityInfo> {
  const pool = new Contract(poolAddress, IUniswapV3Pool, provider);

  // Fetch all pool data in parallel
  const [slot0, liquidity, fee, token0, token1] = await Promise.all([
    pool.slot0(), // Returns [sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked]
    pool.liquidity(),
    pool.fee(),
    pool.token0(),
    pool.token1(),
  ]);

  // Extract slot0 data
  const [
    sqrtPriceX96Raw,
    tickRaw,
    observationIndexRaw,
    observationCardinalityRaw,
    observationCardinalityNextRaw,
    feeProtocolRaw,
    unlocked,
  ] = slot0;

  // Convert types appropriately
  const sqrtPriceX96 = BigInt(sqrtPriceX96Raw);
  const tick =
    typeof tickRaw === 'bigint' ? Number(tickRaw) : (tickRaw as number);
  const observationIndex =
    typeof observationIndexRaw === 'bigint'
      ? Number(observationIndexRaw)
      : (observationIndexRaw as number);
  const observationCardinality =
    typeof observationCardinalityRaw === 'bigint'
      ? Number(observationCardinalityRaw)
      : (observationCardinalityRaw as number);
  const observationCardinalityNext =
    typeof observationCardinalityNextRaw === 'bigint'
      ? Number(observationCardinalityNextRaw)
      : (observationCardinalityNextRaw as number);
  const feeProtocol =
    typeof feeProtocolRaw === 'bigint'
      ? Number(feeProtocolRaw)
      : (feeProtocolRaw as number);

  const liquidityBigint = BigInt(liquidity);
  const feeBigint = BigInt(fee);

  // Format values for readability
  // Liquidity is stored as uint128, format as integer
  const liquidityFormatted = liquidityBigint.toString();

  // sqrtPriceX96 is in Q96 format, format for readability
  const sqrtPriceX96Formatted = sqrtPriceX96.toString();

  return {
    poolAddress: poolAddress.toLowerCase(),
    token0: token0.toLowerCase(),
    token1: token1.toLowerCase(),
    fee: feeBigint,
    liquidity: liquidityBigint,
    liquidityFormatted,
    sqrtPriceX96,
    sqrtPriceX96Formatted,
    tick,
    observationIndex,
    observationCardinality,
    observationCardinalityNext,
    feeProtocol,
    unlocked,
  };
}
