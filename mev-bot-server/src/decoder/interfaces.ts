export interface DecodedTransaction {
  router: string;
  method: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: string;
  deadline: string;
  fee: string;
  recipient: string;
  amountOutMin: string;
  payerIsUser: boolean;
  amountInMax: string;
  routerType: 'v2' | 'v3';
}
