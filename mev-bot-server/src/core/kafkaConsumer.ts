import { Consumer } from 'kafkajs';
import { config } from '../config/env.config';
import { logger } from '../utils/logger';
import { DecodedTransaction } from '../decoder/interfaces';
import { detectOpportunity } from '../services/opportunityDetector';
import { prisma } from '../config/db';
import { provider } from '../utils/provider';

interface TransactionMessage {
  txHash: string;
  blockNumber?: number;
  decodedTx: DecodedTransaction & { amountIn: string }; // amountIn is serialized as string
  routerAddress: string;
  timestamp?: number; // Timestamp when message was created (for filtering old messages)
  rawTx?: any;
}

/**
 * Convert DecodedTransaction to JSON-serializable format
 * Converts bigint values to strings for Prisma JSON field
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
 * Process transaction messages from Kafka
 * Detects opportunities and saves them to database
 */
export async function processTransactionMessages(
  consumer: Consumer,
): Promise<void> {
  await consumer.subscribe({
    topics: [config.kafka.topics.transactions],
    fromBeginning: false,
  });

  // Track when we started processing to filter old messages
  const processingStartTime = Date.now();
  const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000; // 10 minutes - skip messages older than this

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      let txHash: string | undefined;
      const startTime = Date.now();
      try {
        const messageValue = message.value?.toString();
        if (!messageValue) {
          logger.warn('Empty message received from Kafka');
          return;
        }

        const txMessage: TransactionMessage = JSON.parse(messageValue);
        txHash = txMessage.txHash;

        // Check message timestamp to filter out old messages
        // First try the payload timestamp (more reliable), then fall back to Kafka message timestamp
        let messageTimestamp: number | null = null;

        // Use timestamp from message payload (more reliable)
        if (txMessage.timestamp) {
          messageTimestamp = txMessage.timestamp;
        } else if (message.timestamp) {
          // Fall back to Kafka message timestamp
          if (typeof message.timestamp === 'string') {
            messageTimestamp = parseInt(message.timestamp);
          } else if (typeof message.timestamp === 'number') {
            messageTimestamp = message.timestamp;
          }
        }

        // Calculate message age
        const messageAge = messageTimestamp
          ? startTime - messageTimestamp
          : Infinity;

        // Skip messages older than threshold
        if (messageAge > MAX_MESSAGE_AGE_MS) {
          const ageSeconds = Math.round(messageAge / 1000);
          const ageMinutes = Math.round(ageSeconds / 60);
          logger.debug(
            `Skipping old Kafka message (txHash: ${txHash}): age=${ageMinutes}m ${
              ageSeconds % 60
            }s`,
          );
          return;
        }
        // Skip transactions that are already mined (have blockNumber)
        // These are old transactions that were in the mempool but got mined
        if (
          txMessage.blockNumber !== undefined &&
          txMessage.blockNumber !== null
        ) {
          logger.debug(
            `Skipping mined transaction ${txHash} from Kafka (block: ${txMessage.blockNumber})`,
          );
          return;
        }

        const { decodedTx, routerAddress } = txMessage;

        // Convert serialized decodedTx back to DecodedTransaction format
        // (amountIn is string in message, needs to be bigint for processing)
        const processedDecodedTx: DecodedTransaction = {
          ...decodedTx,
          amountIn: BigInt(decodedTx.amountIn),
        };

        // Get block number and detect opportunity in parallel for faster processing
        const rpcProvider = provider();
        const chainId = config.chainId; // Get chainId from environment config
        const [opportunity, currentBlock] = await Promise.all([
          detectOpportunity(txHash, processedDecodedTx, routerAddress),
          rpcProvider.getBlockNumber(),
        ]);

        // Only save detected transactions to database
        if (!opportunity.isOpportunity) {
          const processingTime = Date.now() - startTime;
          logger.debug(
            `📊 Analyzed: ${txHash} - ${
              opportunity.reason || 'No opportunity'
            } (${processingTime}ms)`,
          );
          return;
        }

        // Save detected transaction to database
        await prisma.opportunity.upsert({
          where: {
            chainId_txHash: {
              chainId,
              txHash: txHash,
            },
          },
          update: {
            chainId,
            routerAddress,
            routerType: processedDecodedTx.routerType,
            tokenIn: processedDecodedTx.tokenIn.toLowerCase(),
            tokenOut: processedDecodedTx.tokenOut.toLowerCase(),
            tokenInAmount: processedDecodedTx.amountIn.toString(),
            tokenOutAmount: processedDecodedTx.amountOut,
            expectedProfit: opportunity.profitPotential || null,
            priceImpact: opportunity.priceImpact || null,
            poolAddress: opportunity.poolAddress?.toLowerCase() || null,
            fee: processedDecodedTx.fee || '0', // V2 transactions have fee as '0', V3 has actual fee
            method: processedDecodedTx.method,
            recipient: processedDecodedTx.recipient?.toLowerCase() || null,
            deadline: processedDecodedTx.deadline,
            blockNumber: currentBlock.toString(), // Pending transactions don't have blockNumber yet
            status: opportunity.isExpired
              ? 'expired'
              : opportunity.isOpportunity
              ? 'detected'
              : 'pending',
            processedAt: new Date(),
            metadata: {
              tokenInDecimals: opportunity.tokenInDecimals,
              tokenOutDecimals: opportunity.tokenOutDecimals,
              decodedTx: serializeDecodedTx(processedDecodedTx),
              reason: opportunity.reason,
              timeToSubmitSeconds: opportunity.timeToSubmitSeconds,
              deadlineTimestamp: opportunity.deadlineTimestamp,
              isExpired: opportunity.isExpired,
            },
            updatedAt: new Date(),
          },
          create: {
            chainId,
            txHash,
            routerAddress,
            routerType: processedDecodedTx.routerType,
            tokenIn: processedDecodedTx.tokenIn.toLowerCase(),
            tokenOut: processedDecodedTx.tokenOut.toLowerCase(),
            tokenInAmount: processedDecodedTx.amountIn.toString(),
            tokenOutAmount: processedDecodedTx.amountOut,
            expectedProfit: opportunity.profitPotential || null,
            priceImpact: opportunity.priceImpact || null,
            poolAddress: opportunity.poolAddress?.toLowerCase() || null,
            fee: processedDecodedTx.fee || '0', // V2 transactions have fee as '0', V3 has actual fee
            method: processedDecodedTx.method,
            recipient: processedDecodedTx.recipient?.toLowerCase() || null,
            deadline: processedDecodedTx.deadline,
            blockNumber: currentBlock.toString(), // Pending transactions don't have blockNumber yet
            status: opportunity.isExpired
              ? 'expired'
              : opportunity.isOpportunity
              ? 'detected'
              : 'pending',
            processedAt: new Date(),
            metadata: {
              tokenInDecimals: opportunity.tokenInDecimals,
              tokenOutDecimals: opportunity.tokenOutDecimals,
              decodedTx: serializeDecodedTx(processedDecodedTx),
              reason: opportunity.reason,
              timeToSubmitSeconds: opportunity.timeToSubmitSeconds,
              deadlineTimestamp: opportunity.deadlineTimestamp,
              isExpired: opportunity.isExpired,
            },
          },
        });

        const processingTime = Date.now() - startTime;
        const impactPercent = opportunity.priceImpact
          ? (opportunity.priceImpact * 100).toFixed(2)
          : 'N/A';
        const timeToSubmit = opportunity.timeToSubmitSeconds
          ? `${opportunity.timeToSubmitSeconds}s`
          : 'N/A';
        const expiredStatus = opportunity.isExpired ? ' ⚠️ EXPIRED' : '';
        logger.info(
          `✅ Opportunity saved: ${txHash} - Profit: ${
            opportunity.profitPotential || 'N/A'
          }, Impact: ${impactPercent}%, Submit within: ${timeToSubmit}${expiredStatus} (${processingTime}ms)`,
        );
      } catch (error) {
        // Log full error details including stack trace
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null
            ? JSON.stringify(error, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value,
              )
            : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error(
          `Error processing Kafka message (${txHash}): ${errorMessage}`,
          errorStack ? { stack: errorStack } : undefined,
        );

        // Log additional context for debugging
        if (txHash) {
          logger.debug(
            `[Error] Transaction hash: ${txHash}, Error type: ${
              error?.constructor?.name || 'Unknown'
            }`,
          );
        }

        // Don't throw - continue processing other messages
      }
    },
  });
}
