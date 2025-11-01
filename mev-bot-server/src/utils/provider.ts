import { JsonRpcProvider } from 'ethers';
import { config } from '../config/env.config';
import { logger } from './logger';

/**
 * Select a random RPC URL from the available list
 * @returns A random RPC URL string
 */
function getRandomRpcUrl(): string {
  const rpcUrls = config.httpRpcUrls;
  if (rpcUrls.length === 0) {
    throw new Error('No RPC URLs configured');
  }

  // If only one RPC URL, return it
  if (rpcUrls.length === 1) {
    return rpcUrls[0];
  }

  // Select random RPC URL from the list
  const randomIndex = Math.floor(Math.random() * rpcUrls.length);
  return rpcUrls[randomIndex];
}

/**
 * Create a new provider instance with a randomly selected RPC endpoint
 * This helps with load balancing and fault tolerance
 * @returns A new JsonRpcProvider instance
 */
export const provider = () => {
  const selectedRpcUrl = getRandomRpcUrl();
  logger.debug(
    `Selected RPC URL: ${selectedRpcUrl} (from ${config.httpRpcUrls.length} available)`,
  );
  const httpProvider = new JsonRpcProvider(selectedRpcUrl, undefined, {
    staticNetwork: true, // Disable ENS resolution
  });
  return httpProvider;
};

/**
 * Get chainId from provider
 * @param providerInstance - Optional provider instance (uses default if not provided)
 * @returns Promise<number> - Chain ID
 */
export async function getChainId(providerInstance?: any): Promise<number> {
  try {
    const prov = providerInstance || provider();
    const network = await prov.getNetwork();
    return Number(network.chainId);
  } catch (error) {
    logger.error(`Error getting chainId:`, error);
    throw error;
  }
}
