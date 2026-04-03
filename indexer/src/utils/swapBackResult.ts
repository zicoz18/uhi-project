import { decodeAbiParameters } from "viem";

type SwapBackResult = {
  swapBackEthAmount: bigint | null;
  swapBackMaybeAmount: bigint | null;
  swapBackTokenAddress: `0x${string}` | null;
  swapBackTokenAmount: bigint | null;
};

export const decodeSwapBackResult = (
  swapBackState: string,
  swapBackResultData: `0x${string}`,
): SwapBackResult => {
  const empty: SwapBackResult = {
    swapBackEthAmount: null,
    swapBackMaybeAmount: null,
    swapBackTokenAddress: null,
    swapBackTokenAmount: null,
  };

  try {
    switch (swapBackState) {
      case "NOTHING_TO_SWAP_BACK":
        return empty;

      case "NEWLY_MINTED_MAYBE": {
        const [swapBackMaybeAmount] = decodeAbiParameters(
          [{ type: "uint256" }],
          swapBackResultData,
        );
        return { ...empty, swapBackMaybeAmount };
      }

      case "SWAP_FROM_MAYBE_TO_ETH_NOT_FULLY_CONSUMED": {
        const [swapBackEthAmount, swapBackMaybeAmount] = decodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          swapBackResultData,
        );
        return { ...empty, swapBackEthAmount, swapBackMaybeAmount };
      }

      case "SWAPPED_BACK_TO_ETH":
      case "SWAP_FROM_ETH_TO_TOKEN_Y_FAILED": {
        const [swapBackEthAmount] = decodeAbiParameters(
          [{ type: "uint256" }],
          swapBackResultData,
        );
        return { ...empty, swapBackEthAmount };
      }

      case "SWAPPED_BACK_TO_TOKEN_Y": {
        const [swapBackTokenAddress, swapBackTokenAmount] = decodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }],
          swapBackResultData,
        );
        return { ...empty, swapBackTokenAddress, swapBackTokenAmount };
      }

      default:
        return empty;
    }
  } catch {
    return empty;
  }
};
