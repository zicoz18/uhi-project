import { createConfig } from "ponder";

import { MaybeRouterAbi } from "./abis/MaybeRouterAbi";
import { MaybeHookAbi } from "./abis/MaybeHookAbi";
import MaybeRouterDeployment from "../deployments/MaybeRouter.json";
import MaybeHookDeployment from "../deployments/MaybeHook.json";

export default createConfig({
  chains: {
    base: {
      id: 8453,
      rpc: "https://base.llamarpc.com", // process.env.PONDER_RPC_URL_1,
    },
  },
  contracts: {
    MaybeRouter: {
      chain: "base",
      abi: MaybeRouterAbi,
      address: MaybeRouterDeployment.MaybeRouter as `0x${string}`,
      startBlock: MaybeRouterDeployment.blockNumber,
    },
    MaybeHook: {
      chain: "base",
      abi: MaybeHookAbi,
      address: MaybeHookDeployment.MaybeHook as `0x${string}`,
      startBlock: MaybeHookDeployment.blockNumber,
    },
  },
});
