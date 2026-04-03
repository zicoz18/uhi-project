import { onchainTable, onchainEnum, relations } from "ponder";

export const swapBackState = onchainEnum("SwapBackState", [
  "NOTHING_TO_SWAP_BACK",
  "NEWLY_MINTED_MAYBE",
  "SWAP_FROM_MAYBE_TO_ETH_NOT_FULLY_CONSUMED",
  "SWAPPED_BACK_TO_ETH",
  "SWAP_FROM_ETH_TO_TOKEN_Y_FAILED",
  "SWAPPED_BACK_TO_TOKEN_Y",
]);

export const swapBeforeMaybifyingEvent = onchainTable(
  "swapBeforeMaybifyingEvent",
  (t) => ({
    id: t.bigint().primaryKey(),
    swapper: t.hex().notNull(),
    inToken: t.hex().notNull(),
    inTokenAmount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
);

export const maybifiedSwapRegisteredEvent = onchainTable(
  "maybifiedSwapRegisteredEvent",
  (t) => ({
    id: t.bigint().primaryKey(),
    swapper: t.hex().notNull(),
    probabilityInBps: t.bigint().notNull(),
    burntAmount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    protocolFeeInBps: t.bigint().notNull(),
    swapBackOnlyToEth: t.boolean().notNull(),
    swapBackSqrtPriceLimitX96: t.bigint().notNull(),
    swapBackParams: t.hex().notNull(),
    swapBackIntendedOutToken: t.hex().notNull(),
  }),
);

export const maybifiedSwapResolvedEvent = onchainTable(
  "maybifiedSwapResolvedEvent",
  (t) => ({
    id: t.bigint().primaryKey(),
    swapper: t.hex().notNull(),
    randomness: t.bigint().notNull(),
    randomnessInBps: t.bigint().notNull(),
    mintedAmount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    swapBackState: swapBackState("swapBackState"),
    swapBackResultData: t.hex().notNull(),
    // @TODO: Gotta think about relating swapBack decoded values
    swapBackEthAmount: t.bigint(),
    swapBackMaybeAmount: t.bigint(),
    swapBackTokenAddress: t.hex(),
    swapBackTokenAmount: t.bigint(),
  }),
);

export const token = onchainTable("token", (t) => ({
  address: t.hex().primaryKey(),
  name: t.text().notNull(),
  symbol: t.text().notNull(),
  decimal: t.bigint().notNull(),
}));

export const user = onchainTable("user", (t) => ({
  address: t.hex().primaryKey(),
}));

export const swap = onchainTable("swap", (t) => ({
  id: t.bigint().primaryKey(),
  userAddress: t.hex().notNull(),
}));

export const swapRelations = relations(swap, ({ one }) => ({
  user: one(user, {
    fields: [swap.userAddress],
    references: [user.address],
  }),
  maybifiedSwapRegisteredEvent: one(maybifiedSwapRegisteredEvent, {
    fields: [swap.id],
    references: [maybifiedSwapRegisteredEvent.id],
  }),
  swapBeforeMaybifyingEvent: one(swapBeforeMaybifyingEvent, {
    fields: [swap.id],
    references: [swapBeforeMaybifyingEvent.id],
  }),
  maybifiedSwapResolvedEvent: one(maybifiedSwapResolvedEvent, {
    fields: [swap.id],
    references: [maybifiedSwapResolvedEvent.id],
  }),
}));

export const swapBeforeMaybifyingEventRelations = relations(
  swapBeforeMaybifyingEvent,
  ({ one }) => ({
    swapper: one(user, {
      fields: [swapBeforeMaybifyingEvent.swapper],
      references: [user.address],
    }),
    inToken: one(token, {
      fields: [swapBeforeMaybifyingEvent.inToken],
      references: [token.address],
    }),
  }),
);

export const maybifiedSwapRegisteredEventRelations = relations(
  maybifiedSwapRegisteredEvent,
  ({ one }) => ({
    swapBackIntendedOutToken: one(token, {
      fields: [maybifiedSwapRegisteredEvent.swapBackIntendedOutToken],
      references: [token.address],
    }),
  }),
);

export const maybifiedSwapResolvedEventRelations = relations(
  maybifiedSwapResolvedEvent,
  ({ one }) => ({
    swapper: one(user, {
      fields: [maybifiedSwapResolvedEvent.swapper],
      references: [user.address],
    }),
  }),
);
