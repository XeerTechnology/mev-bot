// v2RouterDecoder.ts
import { Interface, AbiCoder, TransactionResponse } from 'ethers';
import swapRouterV2ABI from '../abi/swapRouterV2.json';
import { DecodedTransaction } from './interfaces';

export interface V2SwapDecoded {
  method: string;
  params: Record<string, any>;
}

// --- Helper: Decode V2 path (simple array of addresses) ---
function decodeV2Path(path: string[]): {
  tokenIn: string;
  tokenOut: string;
  tokens: string[];
} {
  return {
    tokenIn: path?.[0] ?? '',
    tokenOut: path?.[path.length - 1] ?? '',
    tokens: path ?? [],
  };
}

// --- Main decoder ---
export function decodeV2RouterTx(
  tx: TransactionResponse,
): DecodedTransaction | null {
  const routerInterface = new Interface(swapRouterV2ABI);

  try {
    const parsed = routerInterface.parseTransaction(tx);

    const method = parsed?.name;
    const args = parsed?.args as any[];

    switch (method) {
      // swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)
      case 'swapExactTokensForTokens':
      case 'swapExactTokensForTokensSupportingFeeOnTransferTokens': {
        const [amountIn, amountOutMin, path, to, deadline] = args;

        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: path[0],
          tokenOut: path[path.length - 1],
          amountIn: amountIn.toString(),
          amountOut: amountOutMin.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: amountOutMin.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v2',
        };
      }

      // swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] path, address to, uint deadline)
      // Note: This method specifies exact output, so we use amountInMax for price impact calculation
      case 'swapTokensForExactTokens': {
        const [amountOut, amountInMax, path, to, deadline] = args;
        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: path[0],
          tokenOut: path[path.length - 1],
          amountIn: BigInt(0), // Not used - this method specifies exact output
          amountOut: amountOut.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: '0',
          payerIsUser: true,
          amountInMax: amountInMax.toString(), // Use this for price impact calculation
          routerType: 'v2',
        };
      }

      // swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline)
      // amountIn is the ETH value sent with the transaction
      case 'swapExactETHForTokens':
      case 'swapExactETHForTokensSupportingFeeOnTransferTokens': {
        const [amountOutMin, path, to, deadline] = args;
        // ETH amount is in tx.value, WETH is typically the first token in path
        const ethAmount = tx?.value || BigInt(0);
        const wethAddress =
          path?.[0] || '0x0000000000000000000000000000000000000000';

        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: wethAddress, // WETH address
          tokenOut: path[path.length - 1],
          amountIn: ethAmount,
          amountOut: amountOutMin.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: amountOutMin.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v2',
        };
      }

      // swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)
      case 'swapExactTokensForETH':
      case 'swapExactTokensForETHSupportingFeeOnTransferTokens': {
        const [amountIn, amountOutMin, path, to, deadline] = args;
        // WETH is typically the last token in path when swapping tokens to ETH
        const wethAddress =
          path?.[path.length - 1] ||
          '0x0000000000000000000000000000000000000000';

        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: path[0],
          tokenOut: wethAddress, // WETH address
          amountIn: BigInt(amountIn),
          amountOut: amountOutMin.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: amountOutMin.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v2',
        };
      }

      // swapETHForExactTokens(uint amountOut, address[] path, address to, uint deadline)
      // amountIn is the ETH value sent with the transaction
      case 'swapETHForExactTokens': {
        const [amountOut, path, to, deadline] = args;
        // ETH amount is in tx.value, WETH is typically the first token in path
        const ethAmount = tx?.value || BigInt(0);
        const wethAddress =
          path?.[0] || '0x0000000000000000000000000000000000000000';

        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: wethAddress, // WETH address
          tokenOut: path[path.length - 1],
          amountIn: ethAmount,
          amountOut: amountOut.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: '0',
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v2',
        };
      }

      // swapTokensForExactETH(uint amountOut, uint amountInMax, address[] path, address to, uint deadline)
      case 'swapTokensForExactETH': {
        const [amountOut, amountInMax, path, to, deadline] = args;
        // WETH is typically the last token in path when swapping tokens to ETH
        const wethAddress =
          path?.[path.length - 1] ||
          '0x0000000000000000000000000000000000000000';

        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: path[0],
          tokenOut: wethAddress, // WETH address
          amountIn: BigInt(amountInMax),
          amountOut: amountOut.toString(),
          deadline: deadline?.toString(),
          fee: '0',
          recipient: to,
          amountOutMin: '0',
          payerIsUser: true,
          amountInMax: amountInMax.toString(),
          routerType: 'v2',
        };
      }

      default:
        return null;
    }
  } catch (e: any) {
    return null;
  }
}
