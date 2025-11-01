// urDecoder.ts
import { Interface, AbiCoder, TransactionResponse, AddressLike } from 'ethers';
import universalRouterV3 from '../abi/universalRouterV3.json';
import { DecodedTransaction } from './interfaces';

export type URActionType =
  | 'V3_EXACT_IN'
  | 'V3_EXACT_OUT'
  | 'V2_EXACT_IN'
  | 'V2_EXACT_OUT'
  | 'WRAP_ETH'
  | 'UNWRAP_WETH'
  | 'PERMIT2'
  | 'SWEEP'
  | 'PAY_PORTION'
  | 'UNKNOWN';

export interface URAction {
  command: number;
  type: URActionType;
  args: Record<string, any>;
}

export interface URDecoded {
  actions: URAction[];
  deadline?: bigint;
  // commandsRaw: Uint8Array;
  inputsRaw: string[];
}

const coder = new AbiCoder();

const CMD_TYPE: Record<number, URActionType> = {
  0x00: 'V3_EXACT_IN',
  0x01: 'V3_EXACT_OUT',
  // 0x02: 'PERMIT2',
  0x08: 'V2_EXACT_IN',
  0x09: 'V2_EXACT_OUT',
  // 0x0b: 'WRAP_ETH',
  // 0x0c: 'UNWRAP_WETH',
  // 0x04: 'SWEEP',
  // 0x06: 'PAY_PORTION',
};

// Decode execute calldata
function decodeExecute(tx: TransactionResponse) {
  try {
    const universalRouterV3Interface = new Interface(universalRouterV3);
    const decoded = universalRouterV3Interface.parseTransaction(tx);
    return {
      commands: decoded?.args?.commands as string,
      inputs: decoded?.args?.inputs as string[],
      deadline: decoded?.args?.deadline as bigint,
    };
  } catch (e: any) {
    return { raw: tx.data, error: e.message };
  }
}

// V3 path decoder (token0, fee, token1, fee, ...)
function decodeV3Path(path: string) {
  const tokens: string[] = [];
  let fees: number = 0;
  let offset = 2; // skip '0x'

  while (offset + 40 <= path.length) {
    tokens.push('0x' + path.slice(offset, offset + 40));
    offset += 40;
    if (offset + 6 <= path.length) {
      fees = parseInt(path.slice(offset, offset + 6), 16);
      offset += 6;
    }
  }

  return {
    tokenIn: tokens[0] || '',
    tokenOut: tokens[tokens.length - 1] || '',
    tokens,
    fees,
  };
}

// V2 path decoder (array of addresses)
function decodeV2Path(pathBytes: AddressLike[]) {
  return {
    tokenIn: pathBytes[0] as string,
    tokenOut: pathBytes[1] as string,
  };
}

// Decode WRAP_ETH / UNWRAP_WETH
function decodeWrapUnwrap(input: string) {
  try {
    const [recipient, amount] = coder.decode(['address', 'uint256'], input);
    return { recipient, amount: amount.toString() };
  } catch (e: any) {
    return { raw: input, error: e.message };
  }
}

// Decode V3_EXACT_IN
function decodeV3ExactIn(input: string) {
  try {
    const [recipient, amountIn, amountOutMin, pathBytes, payerIsUser] =
      coder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], input);
    return {
      recipient,
      amountIn: amountIn.toString(),
      amountOutMinimum: amountOutMin.toString(),
      ...decodeV3Path(pathBytes),
      path: pathBytes,
      payerIsUser,
    };
  } catch (e: any) {
    return { raw: input, error: e.message };
  }
}

// Decode V3_EXACT_OUT
function decodeV3ExactOut(input: string) {
  try {
    const [recipient, amountOut, amountInMax, pathBytes, payerIsUser] =
      coder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], input);
    return {
      recipient,
      amountOut: amountOut.toString(),
      amountInMaximum: amountInMax.toString(),
      ...decodeV3Path(pathBytes),
      path: pathBytes,
      payerIsUser,
    };
  } catch (e: any) {
    return { raw: input, error: e.message };
  }
}

// Decode V2_EXACT_IN
function decodeV2ExactIn(input: string) {
  try {
    const [recipient, amountIn, amountOutMin, pathBytes, payerIsUser] =
      coder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        input,
      );
    return {
      recipient,
      amountIn: amountIn.toString(),
      amountOutMin: amountOutMin.toString(),
      ...decodeV2Path(pathBytes),
      path: pathBytes,
      payerIsUser,
    };
  } catch (e: any) {
    return { raw: input, error: e.message };
  }
}

// Decode V2_EXACT_OUT
function decodeV2ExactOut(input: string) {
  try {
    const [recipient, amountIn, amountInMax, pathBytes, payerIsUser] =
      coder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        input,
      );
    return {
      recipient,
      amountIn: amountIn.toString(),
      amountInMax: amountInMax.toString(),
      ...decodeV2Path(pathBytes),
      path: pathBytes,
      payerIsUser,
    };
  } catch (e: any) {
    return { raw: input, error: e.message };
  }
}

// Convert ethers result to plain object
function resultToObject(res: any) {
  if (!res) return {};
  const obj: Record<string, any> = {};
  for (const key in res) if (isNaN(Number(key))) obj[key] = res[key];
  return obj;
}

/**
 * Main decoder
 * @param calldata Execute function calldata
 * @param txValue Optional transaction value (for wrap detection)
 * @param txFrom Optional sender address (for wrap detection)
 */
export function decodeUniversalRouterFull(
  tx: TransactionResponse,
): DecodedTransaction[] | null {
  const exec = decodeExecute(tx);
  if (!exec) return null;

  const { commands, inputs, deadline } = exec;
  if (!commands || !inputs) {
    return null;
  }

  // Remove "0x" prefix from commands if present
  const commandsStr = commands.startsWith('0x') ? commands.slice(2) : commands;
  const cmdsBytes = commandsStr.split(/(..)/g).filter((s) => s);
  const actions: DecodedTransaction[] = [];

  let routerType: 'v3' | 'v2' = 'v3';
  // Decode each command
  for (let i = 0; i < cmdsBytes.length; i++) {
    const cmd = cmdsBytes[i];
    const type = CMD_TYPE[parseInt(cmd, 16)] ?? 'UNKNOWN';

    const inputBytes = inputs[i];
    let args: Record<string, any> = { raw: inputBytes };
    switch (type) {
      case 'V3_EXACT_IN':
        args = decodeV3ExactIn(inputBytes);
        routerType = 'v3';
        break;
      case 'V3_EXACT_OUT':
        args = decodeV3ExactOut(inputBytes);
        routerType = 'v3';
        break;
      case 'V2_EXACT_IN':
        args = decodeV2ExactIn(inputBytes);
        routerType = 'v2';
        break;
      case 'V2_EXACT_OUT':
        args = decodeV2ExactOut(inputBytes);
        routerType = 'v2';
        break;
      default:
        continue;
        break;
    }

    actions.push({
      router: tx?.to ?? '',
      method: type,
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      amountIn: args.amountIn ?? '0',
      amountOut: args.amountOut ?? '0',
      deadline: deadline?.toString(),
      fee: args.fees?.toString(),
      recipient: args.recipient,
      amountOutMin: args.amountOutMinimum,
      payerIsUser: args.payerIsUser,
      amountInMax: args.amountInMax ?? '0',
      routerType: routerType,
    });
  }

  return actions;
}
