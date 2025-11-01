/**
 * Normalizes an Ethereum address to lowercase
 * @param address - The address to normalize
 * @returns The address in lowercase format
 */
export const normalizeAddress = (address: string): string => {
  if (!address) return address;
  return address.toLowerCase();
};

/**
 * Checks if an address matches any of the addresses in a list (case-insensitive)
 * @param address - The address to check
 * @param addressList - List of addresses to check against
 * @returns True if the address matches any in the list
 */
export const isAddressInList = (
  address: string,
  addressList: string[],
): boolean => {
  if (!address) return false;
  const normalizedAddress = normalizeAddress(address);
  return addressList.some(
    (addr) => normalizeAddress(addr) === normalizedAddress,
  );
};

export const constants = {
  universalRouter: [
    '0x87fd5305e6a40f378da124864b2d479c2028bd86',
    '0x1a0a18ac4becddbd6389559687d1a73d8927e416',
    '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
  ],
  v2Router: [
    '0xd99d1c33f9fc3444f8101754abc46c52416550d1',
    '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  ],
  v3Router: ['0x1b81d678ffb9c0263b24a97847620c99d213eb14'],
};
