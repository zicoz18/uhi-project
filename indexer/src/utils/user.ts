import schema from "ponder:schema";
import type { Context } from "ponder:registry";

export const insertUserOptimistically = async (
  context: Context,
  userAddress: `0x${string}`,
) => {
  // Optimistically inserts the user, if its a duplicate, it will create a conflict but we are not doing nothing if thats the case
  await context.db
    .insert(schema.user)
    .values({ address: userAddress })
    .onConflictDoNothing();
};
