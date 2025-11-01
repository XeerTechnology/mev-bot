import { Contract, formatUnits } from 'ethers';
import IUniswapV2Pair from '../abi/poolV2.json';

export interface V2LiquidityInfo {
  pairAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  reserve0Formatted: string;
  reserve1Formatted: string;
  totalSupply: bigint;
  totalSupplyFormatted: string;
  k: bigint; // reserve0 * reserve1 (constant product)
  kFormatted: string;
  blockTimestampLast: number;
}

/**
 * Get V2 pool liquidity information including reserves and total supply
 * @param pairAddress - Address of the V2 pair/pool
 * @param provider - Ethers provider instance
 * @param decimals0 - Decimals for token0 (default: 18)
 * @param decimals1 - Decimals for token1 (default: 18)
 * @returns Promise<V2LiquidityInfo> - Liquidity information including reserves
 */
export async function getV2Liquidity(
  pairAddress: string,
  provider: any,
  decimals0 = 18,
  decimals1 = 18,
): Promise<V2LiquidityInfo> {
  const pair = new Contract(pairAddress, IUniswapV2Pair, provider);

  // Fetch all pool data in parallel
  const [reserves, token0, token1, totalSupply] = await Promise.all([
    pair.getReserves(), // Returns [reserve0, reserve1, blockTimestampLast]
    pair.token0(),
    pair.token1(),
    pair.totalSupply(),
  ]);

  const [reserve0Raw, reserve1Raw, blockTimestampLastRaw] = reserves;

  // Ensure reserves are bigint (ethers might return them in different formats)
  const reserve0 = BigInt(reserve0Raw);
  const reserve1 = BigInt(reserve1Raw);
  const totalSupplyBigint = BigInt(totalSupply);

  // Calculate k value (constant product formula: x * y = k)
  const k: bigint = reserve0 * reserve1;

  // Format values for readability
  const reserve0Formatted = formatUnits(reserve0, decimals0);
  const reserve1Formatted = formatUnits(reserve1, decimals1);
  const totalSupplyFormatted = formatUnits(totalSupplyBigint, 18); // LP tokens always have 18 decimals
  const kFormatted = formatUnits(k, decimals0 + decimals1);

  // Convert blockTimestampLast to number (it's uint32 but ethers returns it as bigint)
  const blockTimestampLast: number =
    typeof blockTimestampLastRaw === 'bigint'
      ? Number(blockTimestampLastRaw)
      : (blockTimestampLastRaw as number);

  return {
    pairAddress: pairAddress.toLowerCase(),
    token0: token0.toLowerCase(),
    token1: token1.toLowerCase(),
    reserve0,
    reserve1,
    reserve0Formatted,
    reserve1Formatted,
    totalSupply: totalSupplyBigint,
    totalSupplyFormatted,
    k,
    kFormatted,
    blockTimestampLast,
  };
}
