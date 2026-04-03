import schema from "ponder:schema";
import type { Context } from "ponder:registry";

export const insertSwapOptimistically = async (
  context: Context,
  swapId: bigint,
  userAddress: `0x${string}`,
) => {
  // Optimistically inserts the swap, if its a duplicate, it will create a conflict but we are not doing nothing if thats the case
  await context.db
    .insert(schema.swap)
    .values({ id: swapId, userAddress })
    .onConflictDoNothing();
};
