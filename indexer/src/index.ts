import { ponder } from "ponder:registry";
import schema, { swapBackState, token } from "ponder:schema";
import {
  insertTokenIfNeeded,
  insertUserOptimistically,
  insertSwapOptimistically,
  decodeSwapBackResult,
} from "./utils";

// @TODO: Probably include like tx hashes or something

ponder.on("MaybeRouter:SwapBeforeMaybifying", async ({ event, context }) => {
  await Promise.all([
    insertUserOptimistically(context, event.args.swapper),
    insertTokenIfNeeded(context, event.args.inToken),
  ]);
  await context.db.insert(schema.swapBeforeMaybifyingEvent).values({
    id: event.args.maybifyId,
    swapper: event.args.swapper,
    inToken: event.args.inToken,
    inTokenAmount: event.args.inTokenAmount,
    timestamp: event.block.timestamp,
  });
});

ponder.on("MaybeHook:MaybifiedSwapRegistered", async ({ event, context }) => {
  await Promise.all([
    insertUserOptimistically(context, event.args.swapper),
    insertTokenIfNeeded(context, event.args.swapBackIntendedOutToken),
    insertSwapOptimistically(context, event.args.id, event.args.swapper),
  ]);
  await context.db.insert(schema.maybifiedSwapRegisteredEvent).values({
    id: event.args.id,
    swapper: event.args.swapper,
    probabilityInBps: event.args.probabilityInBps,
    burntAmount: event.args.burntAmount,
    timestamp: event.args.timestamp,
    protocolFeeInBps: event.args.protocolFeeInBps,
    swapBackOnlyToEth: event.args.swapBackOnlyToEth,
    swapBackSqrtPriceLimitX96: event.args.swapBackSqrtPriceLimitX96,
    swapBackParams: event.args.swapBackParams,
    swapBackIntendedOutToken: event.args.swapBackIntendedOutToken,
  });
});

ponder.on("MaybeHook:MaybifiedSwapResolved", async ({ event, context }) => {
  const resolvedState = swapBackState.enumValues[event.args.swapBackState];
  const decoded = decodeSwapBackResult(
    resolvedState as string,
    event.args.swapBackResultData,
  );
  console.log("decoded: ", decoded);
  await insertUserOptimistically(context, event.args.swapper);
  await context.db.insert(schema.maybifiedSwapResolvedEvent).values({
    id: event.args.id,
    swapper: event.args.swapper,
    randomness: event.args.randomness,
    randomnessInBps: event.args.randomnessInBps,
    mintedAmount: event.args.mintedAmount,
    timestamp: event.args.timestamp,
    swapBackState: resolvedState,
    swapBackResultData: event.args.swapBackResultData,
    ...decoded,
  });
});
