import { TransactionResponse, WebSocketProvider } from 'ethers';
import { logger } from '../utils/logger';
import { config } from '../config/env.config';
import { provider } from '../utils/provider';
import { constants, isAddressInList } from '../utils/constants';
import { decodeUniversalRouterFull } from '../decoder/universalRouterDecoder';
import { decodeV2RouterTx } from '../decoder/v2RouterDecoder';
import { decodeV3RouterTx } from '../decoder/v3RouterDecoder';
import { createProducer, Producer } from '../config/kafka';
import { DecodedTransaction } from '../decoder/interfaces';

const rpcProvider = provider();
let kafkaProducer: Producer | null = null;

/**
 * Serialize DecodedTransaction to JSON-serializable format
 * Converts bigint values to strings for Kafka message
 */
function serializeDecodedTx(tx: DecodedTransaction) {
  return {
    router: tx.router,
    method: tx.method,
    tokenIn: tx.tokenIn,
    tokenOut: tx.tokenOut,
    amountIn: tx.amountIn.toString(), // Convert bigint to string
    amountOut: tx.amountOut,
    deadline: tx.deadline,
    fee: tx.fee,
    recipient: tx.recipient,
    amountOutMin: tx.amountOutMin,
    payerIsUser: tx.payerIsUser,
    amountInMax: tx.amountInMax,
    routerType: tx.routerType,
  };
}

/**
 * Initialize Kafka producer
 */
async function initializeKafkaProducer() {
  try {
    kafkaProducer = await createProducer();
    logger.info('[Mempool] Kafka producer initialized');
  } catch (error) {
    logger.error('[Mempool] Failed to initialize Kafka producer:', error);
    // Continue without Kafka - don't crash
  }
}

/**
 * Send transaction to Kafka
 */
async function sendToKafka(
  txHash: string,
  decodedTx: any,
  routerAddress: string,
  blockNumber?: number,
  rawTx?: TransactionResponse,
) {
  if (!kafkaProducer) {
    logger.warn('[Mempool] Kafka producer not initialized, skipping send');
    return;
  }

  try {
    // Serialize decodedTx to convert BigInt to string
    const serializedDecodedTx = serializeDecodedTx(decodedTx);

    const message = {
      txHash,
      blockNumber,
      decodedTx: serializedDecodedTx,
      routerAddress,
      timestamp: Date.now(), // Add timestamp to message payload for reliable filtering
      rawTx: rawTx
        ? {
            hash: rawTx.hash,
            to: rawTx.to,
            from: rawTx.from,
            value: rawTx.value?.toString(),
            data: rawTx.data,
            gasPrice: rawTx.gasPrice?.toString(),
            gasLimit: rawTx.gasLimit?.toString(),
          }
        : undefined,
    };

    await kafkaProducer.send({
      topic: config.kafka.topics.transactions,
      messages: [
        {
          key: txHash, // Use txHash as key for partitioning
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
    });

    logger.info(`[Mempool] Transaction sent to Kafka: ${txHash}`);
  } catch (error) {
    logger.error(
      `[Mempool] Error sending transaction to Kafka (${txHash}):`,
      error,
    );
  }
}

export const listenMempool = async () => {
  // Initialize Kafka producer
  await initializeKafkaProducer();

  logger.info('Listening to mempool...');
  const webSocketProvider = new WebSocketProvider(config.wssRpcUrl);

  // Wait a bit for the connection to stabilize and avoid processing old transactions
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Track when we actually start listening (after connection stabilized)
  const listeningStartTime = Date.now();
  logger.info(
    `[Mempool] Started listening at ${new Date(
      listeningStartTime,
    ).toISOString()}`,
  );

  webSocketProvider.on('pending', async (txHash: string) => {
    try {
      // Retry logic for getTransaction with exponential backoff
      let tx: TransactionResponse | null = null;
      let retries = 0;
      const maxRetries = 3;
      const retryDelay = 500; // Start with 500ms delay

      while (retries < maxRetries) {
        try {
          tx = await Promise.race([
            rpcProvider.getTransaction(txHash),
            new Promise<null>(
              (_, reject) =>
                setTimeout(
                  () => reject(new Error('Transaction fetch timeout')),
                  10000,
                ), // 10 second timeout per attempt
            ),
          ]);
          break; // Success, exit retry loop
        } catch (error: any) {
          retries++;
          const isTimeout =
            error?.message?.includes('timeout') ||
            error?.message?.includes('ETIMEDOUT') ||
            error?.code === 'ETIMEDOUT';

          if (retries >= maxRetries) {
            logger.warn(
              `Failed to fetch transaction ${txHash} after ${maxRetries} retries: ${
                error?.message || 'Unknown error'
              }`,
            );
            return; // Give up after max retries
          }

          if (isTimeout) {
            const delay = retryDelay * Math.pow(2, retries - 1); // Exponential backoff
            logger.debug(
              `Transaction fetch timeout for ${txHash}, retrying in ${delay}ms (attempt ${retries}/${maxRetries})`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // Non-timeout error, don't retry
            throw error;
          }
        }
      }

      if (!tx) return;

      // Skip transactions that are already mined (have blockNumber)
      // Only process truly pending transactions
      if (tx.blockNumber) {
        logger.debug(
          `Skipping mined transaction ${txHash} (block: ${tx.blockNumber})`,
        );
        return;
      }

      // Track when we received this transaction to filter old ones
      const txReceivedTime = Date.now();
      // Only process transactions received after we started listening
      // This filters out old transactions that might be emitted during reconnection
      const timeSinceListeningStarted = txReceivedTime - listeningStartTime;
      if (timeSinceListeningStarted < 1000) {
        logger.debug(
          `Skipping transaction ${txHash} received too soon after listening started (${timeSinceListeningStarted}ms)`,
        );
        return;
      }

      const blockNumber = undefined; // Pending transactions don't have blockNumber

      // Handle Universal Router transactions
      if (tx.to && isAddressInList(tx.to, constants.universalRouter)) {
        logger.info(`Universal Router Transaction: ${txHash}`);
        const decoded = decodeUniversalRouterFull(tx);
        if (decoded) {
          for (const transaction of decoded) {
            await sendToKafka(txHash, transaction, tx.to!, blockNumber, tx);
          }
        }
      }

      // Handle V2 Router transactions
      if (tx.to && isAddressInList(tx.to, constants.v2Router)) {
        logger.info(`V2 Router Transaction: ${txHash}`);
        const decoded = decodeV2RouterTx(tx);
        if (decoded) {
          await sendToKafka(txHash, decoded, tx.to!, blockNumber, tx);
        }
      }

      // Handle V3 Router transactions
      if (tx.to && isAddressInList(tx.to, constants.v3Router)) {
        logger.info(`V3 Router Transaction: ${txHash}`);
        const decoded = decodeV3RouterTx(tx);
        if (decoded) {
          await sendToKafka(txHash, decoded, tx.to!, blockNumber, tx);
        }
      }
    } catch (error: any) {
      // Only log non-timeout errors as errors, timeout errors are expected
      const isTimeout =
        error?.message?.includes('timeout') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.code === 'ETIMEDOUT';

      if (isTimeout) {
        logger.debug(
          `Timeout error for transaction ${txHash}: ${
            error?.message || 'ETIMEDOUT'
          }`,
        );
      } else {
        logger.error(`Error processing pending transaction ${txHash}:`, error);
      }
    }
  });
};
