import { ERC20Abi } from "../../abis/ERC20Abi";
import schema from "ponder:schema";
import type { Context } from "ponder:registry";
import { zeroAddress } from "viem";

export const insertTokenIfNeeded = async (
  context: Context,
  tokenAddress: `0x${string}`,
) => {
  // Create a Token model inside db as well, if inToken is not created for Token model, fetch the token name and decimal from contract and create Token model so we can have extra info for this contract address
  const foundToken = await context.db.find(schema.token, {
    address: tokenAddress,
  });
  if (!foundToken) {
    let name = "Ethereum",
      symbol = "ETH",
      decimal = 18;
    if (tokenAddress !== zeroAddress) {
      try {
        [name, symbol, decimal] = await Promise.all([
          context.client.readContract({
            abi: ERC20Abi,
            functionName: "name",
            address: tokenAddress,
            args: [],
          }),
          context.client.readContract({
            abi: ERC20Abi,
            functionName: "symbol",
            address: tokenAddress,
            args: [],
          }),
          context.client.readContract({
            abi: ERC20Abi,
            functionName: "decimals",
            address: tokenAddress,
            args: [],
          }),
        ]);
      } catch (err) {
        // had an error while fetching token related data, so setting these values to some error values
        name = "Error";
        symbol = "ERR";
        decimal = 18;
      }
    }
    // create token related data
    await context.db.insert(schema.token).values({
      address: tokenAddress,
      decimal: BigInt(decimal),
      name,
      symbol,
    });
  }
};
