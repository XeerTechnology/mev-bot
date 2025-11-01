import { Contract, ZeroAddress, formatUnits } from 'ethers';
import IUniswapV3Pool from '../abi/poolV3.json';

// Minimal ABI for Uniswap V3 Quoter V2: quoteExactInputSingle
// Ref: https://docs.uniswap.org/contracts/v3/reference/periphery/interfaces/IQuoterV2
import IQuoterV2 from '../abi/quoterV2.json';

// Common mainnet Quoter V2 address (also reused on many chains; override if needed)
const QUOTER_V2_ADDRESS = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

async function getMidPrice(
  pool: Contract,
  tokenIn: string,
  tokenOut: string,
): Promise<number> {
  const [sqrtPriceX96] = await pool.slot0();
  // price of token1 in terms of token0
  const price1Over0 = Number(sqrtPriceX96) ** 2 / 2 ** 192;
  // normalize orientation so that returned mid price is tokenOut per tokenIn
  const token0 = (await pool.token0()).toLowerCase();
  const token1 = (await pool.token1()).toLowerCase();
  const tIn = tokenIn.toLowerCase();
  const tOut = tokenOut.toLowerCase();
  if (tIn === token0 && tOut === token1) return price1Over0;
  if (tIn === token1 && tOut === token0)
    return price1Over0 === 0 ? 0 : 1 / price1Over0;
  // Fallback: if tokens don't match pool ordering, still return price1Over0
  return price1Over0;
}

export async function getV3PriceImpact(
  poolAddress: string,
  tokenIn: string,
  tokenOut: string,
  fee: string,
  amountIn: bigint,
  provider: any,
  decimalsIn = 18,
  decimalsOut = 18,
) {
  const pool = new Contract(poolAddress, IUniswapV3Pool, provider);
  const quoter = new Contract(QUOTER_V2_ADDRESS, IQuoterV2, provider);

  const [blockNumber, midPrice] = await Promise.all([
    provider.getBlockNumber?.() ?? provider.getBlockNumber(),
    getMidPrice(pool, tokenIn, tokenOut),
  ]);

  // simulate quote using quoter
  let amountOut: bigint;
  try {
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn,
      tokenOut,
      fee,
      recipient: ZeroAddress,
      amountIn,
      sqrtPriceLimitX96: 0,
    });
    amountOut = result.amountOut;
  } catch (error: any) {
    // If quoter call fails (e.g., pool doesn't exist, invalid fee),
    // fall back to calculating using pool reserves
    throw new Error(
      `Quoter call failed: ${
        error?.message || 'Unknown error'
      }. Pool may not exist or fee may be invalid.`,
    );
  }

  const sent = parseFloat(formatUnits(amountIn, decimalsIn));
  const received = parseFloat(formatUnits(amountOut, decimalsOut));
  const quotedPrice = sent === 0 ? 0 : received / sent;
  const priceImpact = midPrice === 0 ? 0 : (quotedPrice - midPrice) / midPrice;

  return {
    blockNumber,
    midPrice,
    quotedPrice,
    priceImpactPercent: priceImpact * 100,
    amountIn,
    amountOut,
  };
}
