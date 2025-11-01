// v3RouterDecoder.ts
import {
  Interface,
  AbiCoder,
  TransactionResponse,
  getAddress,
  hexlify,
  getBytes,
} from 'ethers';
import { normalizeAddress } from '../utils/constants';
import swapRouterABI from '../abi/swapRouterV3.json';
import { DecodedTransaction } from './interfaces';
import { logger } from '../utils/logger';

export interface V3SwapDecoded {
  method: string;
  params: Record<string, any>;
}

// --- Helper: Decode V3 path ---
function decodeV3Path(pathHex: string) {
  const bytes = getBytes(pathHex);
  const tokens: string[] = [];
  let fees: number = 0;

  let offset = 0;
  while (offset + 20 <= bytes.length) {
    // token address (20 bytes)
    tokens.push(
      normalizeAddress(getAddress(hexlify(bytes.slice(offset, offset + 20)))),
    );
    offset += 20;

    // fee (3 bytes)
    if (offset + 3 <= bytes.length) {
      const fee =
        (bytes[offset] << 16) + (bytes[offset + 1] << 8) + bytes[offset + 2];
      fees = fee;
      offset += 3;
    }
  }

  return {
    tokenIn: normalizeAddress(tokens[0]),
    tokenOut: normalizeAddress(tokens[tokens.length - 1]),
    tokens,
    fees,
  };
}

// --- Main decoder ---
export function decodeV3RouterTx(
  tx: TransactionResponse,
): DecodedTransaction | null {
  logger.info('Decoding V3 Router Transaction...');
  const coder = new AbiCoder();
  const routerInterface = new Interface(swapRouterABI);

  try {
    const parsed = routerInterface.parseTransaction(tx);

    const method = parsed?.name;
    const args = parsed?.args as any[];

    // Handle different methods
    switch (method) {
      case 'exactInputSingle': {
        const [
          {
            tokenIn,
            tokenOut,
            fee,
            recipient,
            deadline,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96,
          },
        ] = args;
        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: normalizeAddress(tokenIn),
          tokenOut: normalizeAddress(tokenOut),
          amountIn: amountIn.toString(),
          amountOut: amountOutMinimum.toString(),
          deadline: deadline?.toString(),
          fee: fee.toString(),
          recipient: normalizeAddress(recipient),
          amountOutMin: amountOutMinimum.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v3',
        };
      }

      case 'exactOutputSingle': {
        const [
          {
            tokenIn,
            tokenOut,
            fee,
            recipient,
            deadline,
            amountOut,
            amountInMaximum,
          },
        ] = args;
        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: normalizeAddress(tokenIn),
          tokenOut: normalizeAddress(tokenOut),
          amountOut: amountOut.toString(),
          amountIn: amountInMaximum.toString(),
          deadline: deadline?.toString(),
          fee: fee.toString(),
          recipient: normalizeAddress(recipient),
          amountOutMin: amountInMaximum.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v3',
        };
      }

      case 'exactInput': {
        const [inputStruct] = args;
        const { path, recipient, deadline, amountIn, amountOutMinimum } =
          inputStruct;
        const decodedPath = decodeV3Path(path);
        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: normalizeAddress(decodedPath.tokenIn),
          tokenOut: normalizeAddress(decodedPath.tokenOut),
          amountIn: amountIn.toString(),
          amountOut: '0',
          deadline: deadline?.toString(),
          fee: decodedPath.fees.toString(),
          recipient: normalizeAddress(recipient),
          amountOutMin: amountOutMinimum.toString(),
          payerIsUser: true,
          amountInMax: '0',
          routerType: 'v3',
        };
      }

      case 'exactOutput': {
        const [inputStruct] = args;
        const { path, recipient, deadline, amountOut, amountInMaximum } =
          inputStruct;
        const decodedPath = decodeV3Path(path);
        return {
          router: tx?.to ?? '',
          method: method ?? 'UNKNOWN',
          tokenIn: normalizeAddress(decodedPath.tokenIn),
          tokenOut: normalizeAddress(decodedPath.tokenOut),
          amountIn: amountInMaximum.toString(),
          amountOut: amountOut.toString(),
          deadline: deadline?.toString(),
          fee: decodedPath.fees.toString(),
          recipient: normalizeAddress(recipient),
          amountOutMin: amountOut.toString(),
          payerIsUser: true,
          amountInMax: amountInMaximum.toString(),
          routerType: 'v3',
        };
      }

      default:
        return null;
    }
  } catch (e: any) {
    return null;
  }
}
