import { Contract, formatUnits } from 'ethers';
import IUniswapV2Pair from '../abi/poolV2.json';

export async function getV2PriceImpact(
  pairAddress: string,
  tokenIn: string,
  amountIn: bigint,
  provider: any,
  decimalsIn = 18,
  decimalsOut = 18,
) {
  const pair = new Contract(pairAddress, IUniswapV2Pair, provider);
  const [reserve0, reserve1] = await pair.getReserves();
  const token0 = await pair.token0();
  const token1 = await pair.token1();

  const isToken0In = tokenIn.toLowerCase() === token0.toLowerCase();

  const reserveIn = isToken0In ? reserve0 : reserve1;
  const reserveOut = isToken0In ? reserve1 : reserve0;

  // amount out formula (UniswapV2)
  const amountInWithFee = (BigInt(amountIn) * BigInt(997)) / BigInt(1000);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * BigInt(1000) + amountInWithFee;
  const amountOut = numerator / denominator;

  // normalize reserves for float calculations
  const rIn = parseFloat(formatUnits(reserveIn, decimalsIn));
  const rOut = parseFloat(formatUnits(reserveOut, decimalsOut));
  const aIn = parseFloat(formatUnits(amountIn, decimalsIn));
  const aOut = parseFloat(formatUnits(amountOut, decimalsOut));

  // prices before and after
  const priceBefore = rOut / rIn;
  const priceAfter = (rOut - aOut) / (rIn + aIn);

  const impact = Math.abs(priceBefore - priceAfter) / priceBefore;

  return {
    priceImpactPercent: impact * 100, // Convert to percentage (e.g. 0.23 = 0.23%)
    amountOut,
    reserveIn,
    reserveOut,
  };
}
