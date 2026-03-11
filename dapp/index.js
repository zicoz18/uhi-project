// ---- Dark mode ----
function toggleDark() {
  const on = document.documentElement.classList.toggle("dark");
  localStorage.setItem("dark", on ? "1" : "0");
}
document.addEventListener("click", () =>
  document
    .querySelectorAll(".info-tip.open")
    .forEach((t) => t.classList.remove("open")),
);

// ---- Constants ----
const CHAIN_ID = 8453;
const ZQUOTER_ADDRESS = "0x70453112cF4dc06b3873D66114844Ee51ff755F1";
const ZQUOTERBASE_ADDRESS = "0xdEEac226B7E6146E79bcca4dd7224F131d631a8C";
const ZROUTER_ADDRESS = "0x06f159ff41Aa2f3777E6B504242cAB18bB60dFe4";
const MAYBE_ROUTER_ADDRESS = "0x5A1a915B00D9a376A3b12d3b5e38439b657f785a";
const MAYBE_ADDRESS = "0xfA445199d5AA54E1b8E5d8D93492743425ce5D21";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
const WBTC_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const DAI_ADDRESS = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";
const UNI_ADDRESS = "0xc3De830EA07524a0761646a6a4e4be0e114a3C83";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const V4_ROUTER_ADDRESS = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ZAMM_HOOKED = "0x000000000000040470635EB91b7CE4D132D616eD";
const V4_STATE_VIEW_ADDRESS = "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71";
const MAYBE_HOOK_ADDRESS = "0x2F9aC616fee58B948568799004F84dC9947fe0Cc";
const VRF_V2_PLUS_WRAPPER_ADDRESS =
  "0xb0407dbe851f8318bd31404A49e658143C982F23";
const ETH_MAYBE_HOOKED_POOL_ID =
  "0xb501106598ecda338f22cbba0a8d67d3a08c15f869a66249359887a9b8ab9d37";
const ZAMM_POOLS_ABI = [
  "function pools(uint256) view returns (uint112, uint112, uint32, uint256, uint256, uint256, uint256)",
];
const IPFS_GATEWAYS = [
  "https://content.wrappr.wtf/ipfs/",
  "https://dweb.link/ipfs/",
];
const BUILTIN_ADDRS = new Set(
  [
    ZERO_ADDRESS,
    WETH_ADDRESS,
    DAI_ADDRESS,
    USDC_ADDRESS,
    USDT_ADDRESS,
    WBTC_ADDRESS,
    MAYBE_ADDRESS,
    UNI_ADDRESS,
  ].map((a) => a.toLowerCase()),
);
const MIN_SQRT_PRICE_LIMIT_PLUS_ONE = 4295128740n;
const MAX_SQRT_PRICE_LIMIT_MINUS_ONE =
  1461446703485210103287273052203988822378723970341n;
const MAX_PROBABILITY_IN_BPS = 10000n;
const WAD = 1000000000000000000n;
const DEFAULT_PROTOCOL_FEE_IN_BPS = 100n;
const DEFAULT_VRF_CALLBACK_GAS_LIMIT = 500000n;
const DEFAULT_GAS_PRICE = 5000000n; // 0.005 gwei
const ONE_GWEI = 1000000000n;
const ETH_MAYBE_POOL_FEE = 100n;
const ETH_MAYBE_TICK_SPACING = 60n;
let appWideMaxGasPrice = DEFAULT_GAS_PRICE; // will be set when we retrieve fee data and this updated value should be used when sending a tx

// ---- DOM helpers ----
const $ = (id) => document.getElementById(id);

function setText(id, s) {
  const el = typeof id === "string" ? $(id) : id;
  if (!el) return;
  if (el.textContent !== s) el.textContent = s;
}
let _htmlCache = new WeakMap();
function setHTML(id, s) {
  const el = typeof id === "string" ? $(id) : id;
  if (!el) return;
  if (_htmlCache.get(el) === s) return;
  el.innerHTML = s;
  _htmlCache.set(el, s);
}
function setShown(id, shown) {
  const el = typeof id === "string" ? $(id) : id;
  if (!el) return;
  const want = shown ? "" : "none";
  if (el.style.display !== want) el.style.display = want;
}
function setDisabled(btn, disabled) {
  const el = typeof btn === "string" ? $(btn) : btn;
  if (!el) return;
  if (!!el.disabled !== !!disabled) el.disabled = !!disabled;
}
const _escTextMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
function escText(s) {
  return String(s).replace(/[&<>]/g, (m) => _escTextMap[m]);
}
function escAttr(s) {
  return escText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function debounce(fn, wait) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

// ---- Wallet state ----
let provider = null;
let signer = null;
let connectedAddress = null;
let connectedWalletProvider = null;
let walletConnectProvider = null;
let isConnecting = false;
let walletEventHandlers = null;
let isWalletConnect = false;
let wcDeepLink = null;

const eip6963Providers = new Map();

window.addEventListener("eip6963:announceProvider", (event) => {
  try {
    const { info, provider } = event.detail || {};
    if (info?.uuid && provider) {
      eip6963Providers.set(info.uuid, { info, provider });
    }
  } catch (e) {}
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

// ---- Wallet helpers ----
function findProvider(checkFn) {
  if (window.ethereum?.providers?.length) {
    for (const p of window.ethereum.providers) {
      if (checkFn(p)) return p;
    }
  }
  if (window.ethereum && checkFn(window.ethereum)) return window.ethereum;
  return null;
}

const WALLET_CONFIG = {
  metamask: {
    name: "MetaMask",
    icon: "🦊",
    detect: () => findProvider((p) => p.isMetaMask),
    getProvider: () => findProvider((p) => p.isMetaMask),
  },
  coinbase: {
    name: "Coinbase",
    icon: "🔵",
    detect: () => findProvider((p) => p.isCoinbaseWallet),
    getProvider: () => findProvider((p) => p.isCoinbaseWallet),
  },
  rabby: {
    name: "Rabby",
    icon: "🐰",
    detect: () => findProvider((p) => p.isRabby),
    getProvider: () => findProvider((p) => p.isRabby),
  },
  rainbow: {
    name: "Rainbow",
    icon: "🌈",
    detect: () => findProvider((p) => p.isRainbow),
    getProvider: () => findProvider((p) => p.isRainbow),
  },
  walletconnect: { name: "WalletConnect", icon: "📱" },
};

function detectWallets() {
  const detected = [];
  const seenNames = new Set();

  // 1. EIP-6963 providers first
  for (const [uuid, { info, provider }] of eip6963Providers.entries()) {
    const name = info?.name || "Unknown";
    if (!seenNames.has(name.toLowerCase())) {
      const iconUrl =
        info.icon &&
        (info.icon.startsWith("data:image/") ||
          info.icon.startsWith("https://"))
          ? info.icon
          : null;
      const safeIconUrl = iconUrl
        ? iconUrl.replace(
            /[<>&"']/g,
            (c) =>
              ({
                "<": "&lt;",
                ">": "&gt;",
                "&": "&amp;",
                '"': "&quot;",
                "'": "&#39;",
              })[c],
          )
        : null;
      detected.push({
        key: `eip6963_${uuid}`,
        name: name,
        icon: safeIconUrl
          ? `<img src="${safeIconUrl}" style="width:1.5rem;height:1.5rem;border-radius:4px;">`
          : "🔌",
        getProvider: () => provider,
      });
      seenNames.add(name.toLowerCase());
    }
  }

  // 2. Check window.ethereum.providers array
  if (window.ethereum?.providers?.length) {
    for (let i = 0; i < window.ethereum.providers.length; i++) {
      const p = window.ethereum.providers[i];
      const name = p.isMetaMask
        ? "MetaMask"
        : p.isCoinbaseWallet
          ? "Coinbase"
          : p.isRabby
            ? "Rabby"
            : p.isRainbow
              ? "Rainbow"
              : null;
      if (name && !seenNames.has(name.toLowerCase())) {
        detected.push({
          key: `provider_${i}`,
          name,
          icon: "🔗",
          getProvider: () => p,
        });
        seenNames.add(name.toLowerCase());
      }
    }
  }

  // 3. Legacy WALLET_CONFIG detection
  for (const [key, config] of Object.entries(WALLET_CONFIG)) {
    if (key === "walletconnect") continue;
    try {
      if (
        config.detect &&
        config.detect() &&
        !seenNames.has(config.name.toLowerCase())
      ) {
        detected.push({ key, ...config });
        seenNames.add(config.name.toLowerCase());
      }
    } catch (e) {}
  }

  // 4. Fallback: if nothing detected but window.ethereum exists
  if (detected.length === 0 && window.ethereum) {
    detected.push({
      key: "injected",
      name: "Browser Wallet",
      icon: "🔗",
      getProvider: () => window.ethereum,
    });
  }

  // 5. WalletConnect
  const wcModule = globalThis["@walletconnect/ethereum-provider"];
  if (wcModule?.EthereumProvider) {
    detected.push({
      key: "walletconnect",
      name: "WalletConnect",
      icon: "📱",
    });
  }

  return detected;
}

function showWalletModal() {
  $("walletModal").classList.add("active");
  document.body.classList.add("modal-open");
  $("walletOptions").innerHTML =
    '<div style="padding:12px;text-align:center;">Detecting wallets...</div>';

  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const doDetect = (attempt = 1) => {
    const wallets = detectWallets();
    const hasBrowserWallet = wallets.some((w) => w.key !== "walletconnect");
    if (!hasBrowserWallet && attempt < 2) {
      setTimeout(() => doDetect(attempt + 1), 250);
    } else {
      renderWalletModal(wallets);
    }
  };

  setTimeout(() => doDetect(), 150);
}

function renderWalletModal(wallets) {
  const container = $("walletOptions");

  if (connectedAddress) {
    const displayName = $("walletBtn").textContent;
    const showName =
      displayName && displayName !== "connect" && !displayName.startsWith("0x");
    container.innerHTML = `
                <div style="padding: 12px; border: 1px solid currentColor; margin-bottom: 12px;">
                  <div style="font-weight: 600; margin-bottom: 6px;">Connected</div>
                  ${showName ? `<div style="font-size: 16px; margin-bottom: 4px;">${escText(displayName)}</div>` : ""}
                  <div style="font-size: 12px; word-break: break-all; opacity: 0.6;">${escText(connectedAddress)}</div>
                </div>
                <div class="wallet-option disconnect" onclick="disconnectWallet()">
                  <span class="wallet-option-name">Disconnect</span>
                </div>
              `;
  } else {
    container.innerHTML =
      wallets.length > 0
        ? wallets
            .map(
              (w) => `
                <div class="wallet-option" data-wallet-key="${escAttr(w.key)}">
                  <span class="wallet-option-icon">${w.icon}</span>
                  <span class="wallet-option-name">${escText(w.name)}</span>
                </div>
              `,
            )
            .join("")
        : '<div style="padding:12px;text-align:center;">No wallets detected.</div>';
    container.querySelectorAll("[data-wallet-key]").forEach((el) => {
      el.addEventListener("click", () =>
        connectWithWallet(el.dataset.walletKey),
      );
    });
  }
}

function closeWalletModal() {
  $("walletModal").classList.remove("active");
  document.body.classList.remove("modal-open");
}

function toggleWallet() {
  showWalletModal();
}

// ---- WalletConnect transaction helper ----
async function wcTransaction(
  txPromise,
  message = "Confirm in your wallet app",
) {
  if (!isWalletConnect) return txPromise;

  const notif = document.createElement("div");
  notif.id = "wcNotif";
  notif.innerHTML = `
              <div style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:16px;text-align:center;z-index:10000;font-size:14px;">
                <div style="margin-bottom:8px;">📱 ${escText(message)}</div>
                <div style="font-size:12px;opacity:0.7;">Open your wallet app to approve the transaction</div>
                ${wcDeepLink && /^https?:\/\//i.test(wcDeepLink) ? `<a href="${escAttr(wcDeepLink)}" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#fff;color:#000;border-radius:4px;text-decoration:none;">Open Wallet</a>` : ""}
              </div>
            `;
  document.body.appendChild(notif);

  try {
    const result = await txPromise;
    return result;
  } finally {
    notif.remove();
  }
}

// ---- waitForTx - robust tx confirmation ----
async function waitForTx(tx, timeoutMs = 90000) {
  const txHash = tx.hash;

  async function pollReceipt(maxAttempts = 45) {
    const p = quoteRPC ? await quoteRPC.call((rpc) => rpc) : provider;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await p.getTransactionReceipt(txHash);
        if (receipt) {
          if (receipt.status === 0) throw new Error("Transaction reverted");
          return receipt;
        }
      } catch (rpcErr) {
        if (i === maxAttempts - 1) throw rpcErr;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }

  // For WalletConnect, always use polling
  if (isWalletConnect) {
    const receipt = await pollReceipt();
    if (receipt) return receipt;
    throw new Error("Transaction confirmation timeout");
  }

  // Race tx.wait() against timeout
  let receipt = null;
  let waitError = null;

  try {
    receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);
  } catch (e) {
    waitError = e;
    const msg = (e.message || "").toLowerCase();
    const shouldPoll =
      msg.includes("timeout") ||
      msg.includes("index") ||
      msg.includes("invalid_argument") ||
      msg.includes("invalid argument") ||
      msg.includes("could not coalesce") ||
      msg.includes("missing response");

    if (shouldPoll && txHash) {
      receipt = await pollReceipt();
    }
  }

  if (receipt) return receipt;
  throw waitError || new Error("Transaction confirmation timeout");
}

// ---- Connect with wallet ----
async function connectWithWallet(walletKey) {
  if (isConnecting) return;
  isConnecting = true;

  try {
    closeWalletModal();
    let walletProvider;

    if (walletKey === "walletconnect") {
      const wcModule = globalThis["@walletconnect/ethereum-provider"];
      const WCProvider = wcModule?.EthereumProvider;

      if (!WCProvider?.init) throw new Error("WalletConnect not available");

      if (walletConnectProvider) {
        try {
          await walletConnectProvider.disconnect?.();
        } catch (e) {}
        walletConnectProvider = null;
      }

      walletConnectProvider = await WCProvider.init({
        projectId: "1e8390ef1c1d8a185e035912a1409749",
        chains: [1],
        showQrModal: true,
        rpcMap: { 1: "https://1rpc.io/eth" },
        metadata: {
          name: "ETH Swap by zAMM",
          description: "Onchain DEX aggregator",
          url: window.location.origin,
          icons: [],
        },
      });

      walletConnectProvider.on("display_uri", (uri) => {
        try {
          const session = walletConnectProvider.session;
          const peerMeta = session?.peer?.metadata;
          if (
            peerMeta?.redirect?.native &&
            /^https?:\/\//i.test(peerMeta.redirect.native)
          )
            wcDeepLink = peerMeta.redirect.native;
          else if (
            peerMeta?.redirect?.universal &&
            /^https?:\/\//i.test(peerMeta.redirect.universal)
          )
            wcDeepLink = peerMeta.redirect.universal;
        } catch (e) {}
      });

      await walletConnectProvider.enable();
      walletProvider = walletConnectProvider;
      isWalletConnect = true;

      try {
        const session = walletConnectProvider.session;
        const peerMeta = session?.peer?.metadata;
        if (
          peerMeta?.redirect?.native &&
          /^https?:\/\//i.test(peerMeta.redirect.native)
        )
          wcDeepLink = peerMeta.redirect.native;
        else if (
          peerMeta?.redirect?.universal &&
          /^https?:\/\//i.test(peerMeta.redirect.universal)
        )
          wcDeepLink = peerMeta.redirect.universal;
      } catch (e) {}
    } else if (walletKey.startsWith("eip6963_")) {
      const uuid = walletKey.replace("eip6963_", "");
      walletProvider = eip6963Providers.get(uuid)?.provider;
      if (!walletProvider) {
        const savedName = localStorage
          .getItem("zswap_wallet_name")
          ?.toLowerCase();
        if (savedName) {
          for (const [, { info, provider }] of eip6963Providers) {
            if (info?.name?.toLowerCase() === savedName) {
              walletProvider = provider;
              break;
            }
          }
        }
      }
      isWalletConnect = false;
      wcDeepLink = null;
    } else {
      walletProvider =
        WALLET_CONFIG[walletKey]?.getProvider() || window.ethereum;
      isWalletConnect = false;
      wcDeepLink = null;
    }

    if (!walletProvider) throw new Error("Wallet not found");

    if (walletKey !== "walletconnect") {
      await walletProvider.request({ method: "eth_requestAccounts" });
    }

    // Check/switch chain
    const chainId = await walletProvider.request({
      method: "eth_chainId",
    });
    if (BigInt(chainId) !== 8453n) {
      try {
        await walletProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x2105" }],
        });
        const newChainId = await walletProvider.request({
          method: "eth_chainId",
        });
        if (BigInt(newChainId) !== 8453n)
          throw new Error("Chain switch failed");
      } catch (switchErr) {
        showStatus("Please switch to Ethereum Mainnet", "error");
        if (walletKey === "walletconnect") {
          try {
            walletConnectProvider?.disconnect();
          } catch (e) {}
          walletConnectProvider = null;
        }
        isWalletConnect = false;
        wcDeepLink = null;
        return;
      }
    }

    // Initialize globals
    provider = new ethers.BrowserProvider(walletProvider);
    signer = await provider.getSigner();
    connectedAddress = await signer.getAddress();
    const oldWalletProvider = connectedWalletProvider;
    connectedWalletProvider = walletProvider;
    updateWalletDisplay();

    if (oldWalletProvider && walletEventHandlers) {
      try {
        oldWalletProvider.removeListener(
          "accountsChanged",
          walletEventHandlers.accountsChanged,
        );
        oldWalletProvider.removeListener(
          "chainChanged",
          walletEventHandlers.chainChanged,
        );
      } catch (e) {}
    }
    walletEventHandlers = {
      accountsChanged: () => window.location.reload(),
      chainChanged: () => window.location.reload(),
    };
    walletProvider.on("accountsChanged", walletEventHandlers.accountsChanged);
    walletProvider.on("chainChanged", walletEventHandlers.chainChanged);

    try {
      localStorage.setItem("zswap_wallet", walletKey);
      if (walletKey.startsWith("eip6963_")) {
        const uuid = walletKey.replace("eip6963_", "");
        const name = eip6963Providers.get(uuid)?.info?.name;
        if (name) localStorage.setItem("zswap_wallet_name", name);
      }
    } catch (e) {}

    // Clear caches (provider changed)
    _erc20Read.clear();
    _balanceCache.clear();
    _allowCache.clear();

    // Update swap UI
    setText("swapBtn", "Enter an amount");
    setDisabled("swapBtn", true);
    updateBalances();
    updateWcBanner();

    const preAmt = $("fromAmount")?.value?.trim();
    if (preAmt) handleAmountChange();
  } catch (error) {
    handleError(error);
  } finally {
    isConnecting = false;
  }
}

function updateWcBanner() {
  const existing = $("wcBanner");
  if (existing) existing.remove();

  if (isWalletConnect && connectedAddress) {
    const banner = document.createElement("div");
    banner.id = "wcBanner";
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:9000;font-size:13px;";
    banner.innerHTML = `
                <span>📱 Connected via WalletConnect</span>
                <button onclick="disconnectWallet()" style="background:#fff;color:#000;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Disconnect</button>
              `;
    document.body.prepend(banner);
    document.body.style.paddingTop = "44px";
  } else {
    document.body.style.paddingTop = "";
  }
}

function updateWalletDisplay() {
  if (!connectedAddress) {
    $("walletBtn").textContent = "connect";
    updateWcBanner();
    return;
  }
  $("walletBtn").textContent =
    connectedAddress.slice(0, 6) + "..." + connectedAddress.slice(-4);
  updateWcBanner();
  // Resolve .wei name in background
  const _capturedAddr = connectedAddress;
  quoteRPC
    .call(async (rpc) => {
      const ns = getWeinsContract(rpc);
      const name = await ns.reverseResolve(_capturedAddr);
      if (name && connectedAddress === _capturedAddr)
        $("walletBtn").textContent = name.toLowerCase();
    })
    .catch(() => {});
}

function disconnectWallet() {
  if (connectedWalletProvider && walletEventHandlers) {
    try {
      connectedWalletProvider.removeListener(
        "accountsChanged",
        walletEventHandlers.accountsChanged,
      );
      connectedWalletProvider.removeListener(
        "chainChanged",
        walletEventHandlers.chainChanged,
      );
    } catch (e) {}
  }
  walletEventHandlers = null;

  if (walletConnectProvider) {
    try {
      walletConnectProvider.disconnect();
    } catch (e) {}
    walletConnectProvider = null;
  }
  provider = null;
  signer = null;
  connectedAddress = null;
  connectedWalletProvider = null;
  isWalletConnect = false;
  wcDeepLink = null;
  $("walletBtn").textContent = "connect";
  updateWcBanner();
  closeWalletModal();
  try {
    localStorage.removeItem("zswap_wallet");
    localStorage.removeItem("zswap_wallet_name");
  } catch (e) {}

  // Reset swap UI
  setText("swapBtn", "Connect Wallet");
  setDisabled("swapBtn", false);
  setText("fromBalance", "Balance: --");
  setText("toBalance", "Balance: --");
  setShown("quoteInfo", false);
  stopQuoteRefresh();
  $("toAmount").value = "";
  _erc20Read.clear();
  _balanceCache.clear();
  _allowCache.clear();
}

function showStatus(msg, type) {
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
  el.className = "status show" + (type ? " " + type : "");
  setTimeout(
    () => {
      el.className = "status";
    },
    type === "error" ? 8000 : 5000,
  );
}

function handleError(e) {
  const msg = (e.message || e.reason || String(e)).toLowerCase();
  if (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("user cancelled")
  )
    return;
  showStatus(e.message || "An error occurred", "error");
}

// ---- Token data ----
let currentModal = null;
const tokens = {
  ETH: { address: ZERO_ADDRESS, symbol: "ETH", decimals: 18 },
  WETH: { address: WETH_ADDRESS, symbol: "WETH", decimals: 18 },
  DAI: { address: DAI_ADDRESS, symbol: "DAI", decimals: 18 },
  USDC: { address: USDC_ADDRESS, symbol: "USDC", decimals: 6 },
  USDT: { address: USDT_ADDRESS, symbol: "USDT", decimals: 6 },
  WBTC: { address: WBTC_ADDRESS, symbol: "WBTC", decimals: 8 },
  MAYBE: { address: MAYBE_ADDRESS, symbol: "MAYBE", decimals: 18 },
  UNI: { address: UNI_ADDRESS, symbol: "UNI", decimals: 18 },
};

// Load custom tokens from localStorage
try {
  const saved = JSON.parse(localStorage.getItem("zswap_custom_tokens") || "[]");
  for (const t of saved) {
    if (t.address && t.symbol && t.decimals != null && !tokens[t.symbol]) {
      tokens[t.symbol] = {
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
      };
    }
  }
} catch (_) {}

function saveCustomTokens() {
  try {
    const custom = Object.values(tokens).filter(
      (t) =>
        !BUILTIN_ADDRS.has(t.address.toLowerCase()) &&
        !weiListTokenSource.has(t.symbol),
    );
    localStorage.setItem("zswap_custom_tokens", JSON.stringify(custom));
  } catch (_) {}
}

// ---- .wei token list state ----
const weiLists = new Map(); // name → { tokens: [...], loadedAt }
const weiListTokenSource = new Map(); // symbol → listName
let _tokenListAutoLoaded = false; // true once auto-load of token-list.wei attempted

function saveWeiLists() {
  try {
    const obj = {};
    for (const [name, data] of weiLists) obj[name] = data;
    localStorage.setItem("zswap_wei_lists", JSON.stringify(obj));
  } catch (_) {}
}

function loadWeiLists() {
  try {
    const raw = JSON.parse(localStorage.getItem("zswap_wei_lists") || "{}");
    for (const [name, data] of Object.entries(raw)) {
      if (data && Array.isArray(data.tokens)) {
        weiLists.set(name, data);
        mergeWeiListTokens(name, data.tokens);
      }
    }
  } catch (_) {}
}

function validateTokenList(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of rawArray) {
    if (!entry || typeof entry !== "object") continue;
    const { address, symbol, decimals } = entry;
    if (!address || !symbol || decimals == null) continue;
    const addrClean = String(address).trim().toLowerCase();
    if (!ethers.isAddress(addrClean)) continue;
    const checksummed = ethers.getAddress(addrClean);
    if (checksummed === ZERO_ADDRESS) continue;
    const addrLower = checksummed.toLowerCase();
    if (seen.has(addrLower)) continue;
    const sym = String(symbol).trim();
    if (!sym || sym.length > 24 || !/^[A-Za-z0-9.$_-]+$/.test(sym)) continue;
    const dec = Number(decimals);
    if (!Number.isInteger(dec) || dec < 0 || dec > 36) continue;
    seen.add(addrLower);
    const item = { address: checksummed, symbol: sym, decimals: dec };
    if (entry.icon && typeof entry.icon === "string") {
      const url = entry.icon.trim();
      if (url.startsWith("https://") || url.startsWith("data:image/"))
        item.icon = url;
    }
    result.push(item);
  }
  return result;
}

function mergeWeiListTokens(listName, validated) {
  const builtInAddrs = BUILTIN_ADDRS;
  for (const t of validated) {
    if (builtInAddrs.has(t.address.toLowerCase())) continue;
    let sym = t.symbol;
    // Handle symbol collision with different address
    if (
      tokens[sym] &&
      tokens[sym].address.toLowerCase() !== t.address.toLowerCase()
    ) {
      sym = sym + "." + listName.replace(/\.wei$/, "");
    }
    if (!tokens[sym]) {
      tokens[sym] = {
        address: t.address,
        symbol: sym,
        decimals: t.decimals,
      };
      if (t.icon) tokens[sym].icon = t.icon;
    }
    weiListTokenSource.set(sym, listName);
  }
}

// ---- ENSIP-7 contenthash → IPFS CID decoder ----
const BASE32_ALPHA = "abcdefghijklmnopqrstuvwxyz234567";
function bytesToBase32(bytes) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHA[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHA[(value << (5 - bits)) & 31];
  return out;
}

function decodeContenthash(hex) {
  try {
    const bytes = ethers.getBytes(hex);
    if (bytes.length < 3) return null;
    let proto = 0,
      shift = 0,
      offset = 0;
    for (; offset < bytes.length; offset++) {
      proto |= (bytes[offset] & 0x7f) << shift;
      shift += 7;
      if (!(bytes[offset] & 0x80)) {
        offset++;
        break;
      }
    }
    if (proto !== 0xe3) return null; // IPFS only
    const cidBytes = bytes.slice(offset);
    if (cidBytes[0] === 0x01) return "b" + bytesToBase32(cidBytes); // CIDv1
    return null;
  } catch {
    return null;
  }
}

async function fetchIPFS(cid) {
  let lastErr;
  for (const gw of IPFS_GATEWAYS) {
    try {
      const resp = await fetch(gw + cid);
      if (!resp.ok) throw new Error(resp.status);
      return await resp.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("All IPFS gateways failed: " + lastErr?.message);
}

let _weiResolveSeq = 0;
let _weiResolving = false;

async function resolveWeiList(nameInput) {
  let name = nameInput.toLowerCase().trim();
  if (name.endsWith(".wei")) name = name.slice(0, -4);
  if (!name) return;
  const fullName = name + ".wei";

  if (weiLists.has(fullName)) {
    setHTML("weiListStatus", escText(fullName) + " already loaded");
    return;
  }

  const seq = ++_weiResolveSeq;
  _weiResolving = true;
  const statusEl = $("weiListStatus");
  statusEl.className = "token-search-status";
  statusEl.textContent = "Loading " + fullName + "...";

  try {
    // Read both contenthash and text record in parallel
    const { ch, txt } = await quoteRPC.call(async (rpc) => {
      const ns = getWeinsContract(rpc);
      const tokenId = await ns.computeId(fullName);
      const [ch, txt] = await Promise.all([
        ns.contenthash(tokenId).catch(() => "0x"),
        ns.text(tokenId, "tokens").catch(() => ""),
      ]);
      return { ch, txt };
    });

    if (seq !== _weiResolveSeq) {
      _weiResolving = false;
      return;
    }

    let raw = null;

    // Try contenthash first (IPFS)
    if (ch && ch !== "0x" && ch.length > 2) {
      const cid = decodeContenthash(ch);
      if (cid) {
        statusEl.textContent = "Fetching from IPFS...";
        raw = await fetchIPFS(cid);
        if (seq !== _weiResolveSeq) {
          _weiResolving = false;
          return;
        }
      }
    }

    // Fall back to text record
    if (!raw || !raw.trim()) {
      raw = txt;
    }

    if (!raw || !raw.trim()) {
      statusEl.className = "token-search-status error";
      statusEl.textContent = "No token list found on " + fullName;
      _weiResolving = false;
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      statusEl.className = "token-search-status error";
      statusEl.textContent = "Invalid JSON from " + fullName;
      _weiResolving = false;
      return;
    }

    const validated = validateTokenList(parsed);
    if (validated.length === 0) {
      statusEl.className = "token-search-status error";
      statusEl.textContent = "No valid tokens in " + fullName;
      _weiResolving = false;
      return;
    }

    weiLists.set(fullName, { tokens: validated, loadedAt: Date.now() });
    mergeWeiListTokens(fullName, validated);
    saveWeiLists();
    statusEl.className = "token-search-status";
    statusEl.textContent =
      "Loaded " + validated.length + " tokens from " + fullName;

    _weiResolving = false;
    const filter = $("tokenSearchInput")?.value || "";
    renderTokenList(filter);
  } catch (e) {
    _weiResolving = false;
    if (seq !== _weiResolveSeq) return;
    statusEl.className = "token-search-status error";
    statusEl.textContent = "Failed to resolve " + fullName;
    console.error(".wei resolve error:", e);
    renderTokenList($("tokenSearchInput")?.value || "");
  }
}

function removeWeiList(listName) {
  const entry = weiLists.get(listName);
  if (!entry) return;
  // Collect symbols to remove (avoid mutating map during iteration)
  const toRemove = [];
  for (const [sym, src] of weiListTokenSource) {
    if (src !== listName) continue;
    // Don't remove if currently selected
    if (sym === fromToken || sym === toToken) continue;
    toRemove.push(sym);
  }
  for (const sym of toRemove) {
    delete tokens[sym];
    weiListTokenSource.delete(sym);
  }
  weiLists.delete(listName);
  saveWeiLists();
  if (listName === "token-list.wei") _tokenListAutoLoaded = false;
}

function renderTokenList(filter) {
  const list = $("tokenList");
  if (!list) return;
  list.textContent = "";
  const frag = document.createDocumentFragment();
  const q = (filter || "").toLowerCase().trim();

  const builtInAddrs = BUILTIN_ADDRS;

  function matchesFilter(sym, addr) {
    if (!q) return true;
    return sym.toLowerCase().includes(q) || addr.toLowerCase().includes(q);
  }

  function makeRow(symbol) {
    const t = tokens[symbol];
    const row = document.createElement("div");
    row.className = "token-list-item";
    row.setAttribute("data-symbol", symbol);
    const iconSpan = document.createElement("span");
    iconSpan.className = "token-icon";
    iconSpan.innerHTML = iconForSymbol(symbol);
    const nameSpan = document.createElement("span");
    nameSpan.className = "token-symbol";
    nameSpan.textContent = symbol;
    const balSpan = document.createElement("span");
    balSpan.className = "token-balance";
    if (connectedAddress && t) {
      const cached = getCachedBalance(t.address);
      if (cached != null && cached > 0n) {
        const formatted =
          t.address === ZERO_ADDRESS
            ? ethers.formatEther(cached)
            : ethers.formatUnits(cached, t.decimals);
        balSpan.textContent = fmt(formatted);
      }
    }
    row.append(iconSpan, nameSpan, balSpan);
    return row;
  }

  // Built-in tokens
  let hasAny = false;
  for (const sym of Object.keys(tokens)) {
    if (!builtInAddrs.has(tokens[sym].address.toLowerCase())) continue;
    if (!matchesFilter(sym, tokens[sym].address)) continue;
    frag.appendChild(makeRow(sym));
    hasAny = true;
  }

  // Pre-index weiListTokenSource by list name (O(n) instead of O(n*m))
  const _weiByList = new Map();
  for (const [sym, src] of weiListTokenSource) {
    if (!tokens[sym]) continue;
    if (!_weiByList.has(src)) _weiByList.set(src, []);
    _weiByList.get(src).push(sym);
  }

  // Per-.wei-list groups
  for (const [listName] of weiLists) {
    const srcTokens = _weiByList.get(listName) || [];
    const listTokens = [];
    for (const sym of srcTokens) {
      if (!matchesFilter(sym, tokens[sym].address)) continue;
      listTokens.push(sym);
    }
    if (listTokens.length === 0) continue;
    const label = document.createElement("div");
    label.className = "token-group-label";
    label.innerHTML =
      escText(listName) +
      ' <button class="wei-list-remove" data-list="' +
      escAttr(listName) +
      '" title="Remove list">&times;</button>';
    frag.appendChild(label);
    for (const sym of listTokens) frag.appendChild(makeRow(sym));
    hasAny = true;
  }

  // Custom tokens (not built-in, not from .wei lists)
  const customTokens = [];
  for (const sym of Object.keys(tokens)) {
    if (tokens[sym]._isZammStake) continue; // ZAMM is in built-in section, skip here
    if (builtInAddrs.has(tokens[sym].address.toLowerCase())) continue;
    if (weiListTokenSource.has(sym)) continue;
    if (!matchesFilter(sym, tokens[sym].address)) continue;
    customTokens.push(sym);
  }
  if (customTokens.length > 0) {
    const label = document.createElement("div");
    label.className = "token-group-label";
    label.textContent = "Custom";
    frag.appendChild(label);
    for (const sym of customTokens) frag.appendChild(makeRow(sym));
    hasAny = true;
  }

  if (!hasAny) {
    const empty = document.createElement("div");
    empty.style.cssText =
      "padding:16px 12px;color:#999;font-size:13px;text-align:center";
    if (
      q &&
      !_tokenListAutoLoaded &&
      !weiLists.has("token-list.wei") &&
      !q.endsWith(".wei")
    ) {
      _tokenListAutoLoaded = true;
      empty.textContent = "Searching extended token list\u2026";
      frag.appendChild(empty);
      resolveWeiList("token-list.wei");
    } else if (q && _weiResolving) {
      empty.textContent = "Searching extended token list\u2026";
      frag.appendChild(empty);
    } else {
      empty.textContent = q
        ? "No tokens match \u201c" + q + "\u201d"
        : "No tokens";
      frag.appendChild(empty);
    }
  }

  list.appendChild(frag);

  // Highlight best match when searching
  if (q && q.length >= 2) {
    const rows = list.querySelectorAll(".token-list-item");
    let bestRow = null;
    for (const row of rows) {
      const sym = (row.getAttribute("data-symbol") || "").toLowerCase();
      const t = tokens[row.getAttribute("data-symbol")];
      // Exact symbol or address match gets priority
      if (sym === q || (t && t.address.toLowerCase() === q)) {
        bestRow = row;
        break;
      }
      // First partial match as fallback
      if (
        !bestRow &&
        (sym.includes(q) || (t && t.address.toLowerCase().includes(q)))
      ) {
        bestRow = row;
      }
    }
    if (bestRow) {
      bestRow.classList.add("highlight");
      bestRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}

let _weiDebounceTimer = null;

function initTokenSearch() {
  const input = $("tokenSearchInput");
  if (!input) return;

  const debouncedRender = debounce((val) => renderTokenList(val), 150);
  input.addEventListener("input", () => {
    const val = input.value.trim();
    debouncedRender(val);
    clearTimeout(_weiDebounceTimer);
    if (val.endsWith(".wei") && val.length > 4) {
      _weiDebounceTimer = setTimeout(() => resolveWeiList(val), 800);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = input.value.trim();
      if (val.endsWith(".wei") && val.length > 4) {
        clearTimeout(_weiDebounceTimer);
        resolveWeiList(val);
      }
    }
  });
}

let fromToken = "USDC";
let toToken = "DAI";
let _balSeq = 0;
let slippageBps = 100;
let probabilityBps = 5000; // default 50.00%

// ---- Token Icons ----
const ETH_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><polygon fill="#80D8FF" points="7.62,18.83 16.01,30.5 16.01,24.1"/><polygon fill="#42A5F5" points="16.01,30.5 24.38,18.78 16.01,24.1"/><polygon fill="#FFF176" points="16.01,1.5 7.62,16.23 16.01,12.3"/><polygon fill="#FF8A80" points="24.38,16.18 16.01,1.5 16.01,12.3"/><polygon fill="#C1AEE1" points="16.01,21.5 24.38,16.18 16.01,12.3"/><polygon fill="#55FB9B" points="16.01,12.3 7.62,16.23 16.01,21.5"/></svg>`;
const WETH_ICON = `<svg width="24" height="24" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="17" fill="none" stroke="#90CAF9" stroke-width="1.5" stroke-dasharray="4 2.5"/><g transform="translate(2,2)"><polygon fill="#80D8FF" points="7.62,18.83 16.01,30.5 16.01,24.1"/><polygon fill="#42A5F5" points="16.01,30.5 24.38,18.78 16.01,24.1"/><polygon fill="#FFF176" points="16.01,1.5 7.62,16.23 16.01,12.3"/><polygon fill="#FF8A80" points="24.38,16.18 16.01,1.5 16.01,12.3"/><polygon fill="#C1AEE1" points="16.01,21.5 24.38,16.18 16.01,12.3"/><polygon fill="#55FB9B" points="16.01,12.3 7.62,16.23 16.01,21.5"/></g></svg>`;
const USDC_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none"><circle fill="#2775CA" cx="16" cy="16" r="16"/><g fill="#FFF"><path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z"/><path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z"/></g></g></svg>`;
const USDT_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path fill="#FFF" d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"/></g></svg>`;
const WBTC_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#FFF" fill-rule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/></g></svg>`;
const STETH_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none"><circle fill="#00A3FF" cx="16" cy="16" r="16"/><path d="M16.005 4.805l-5.655 8.668 5.655-3.233V4.805z" fill="#FFF"/><path opacity=".6" d="M16.004 10.238l5.658 3.23-5.658-8.674v5.444z" fill="#FFF"/><path opacity=".6" d="M16.005 10.239l-5.655 3.229 5.655 3.23v-6.46z" fill="#FFF"/><path opacity=".2" d="M16.004 10.239v6.459l5.654-3.23-5.654-3.229z" fill="#FFF"/><path d="M10.35 14.864c-2.048 3.097-1.603 7.253 1.034 9.824 1.561 1.521 3.622 2.353 5.683 2.353 2.061 0 4.122-.832 5.683-2.353 2.637-2.571 3.082-6.727 1.034-9.824L16.067 18.611 10.35 14.864z" fill="#FFF" opacity=".6"/></g></svg>`;
const WSTETH_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none"><circle fill="#00A3FF" cx="16" cy="16" r="16"/><path d="M9.437 14.864l-.181.275c-2.048 3.097-1.603 7.253 1.034 9.824 1.561 1.521 3.622 2.353 5.683 2.353 0 0 0 0-6.536-12.452z" fill="#FFF"/><path opacity=".6" d="M15.997 18.611l-6.56-3.747c6.56 12.452 6.56 12.452 6.56 12.452 0-2.683 0-5.623 0-8.705z" fill="#FFF"/><path opacity=".6" d="M22.563 14.864l.181.275c2.048 3.097 1.603 7.253-1.034 9.824-1.561 1.521-3.622 2.353-5.683 2.353 0 0 0 0 6.536-12.452z" fill="#FFF"/><path opacity=".2" d="M16.003 18.611l6.56-3.747c-6.56 12.452-6.56 12.452-6.56 12.452 0-2.683 0-5.623 0-8.705z" fill="#FFF"/><path opacity=".2" d="M16.004 10.239v6.459l5.654-3.23-5.654-3.229z" fill="#FFF"/><path opacity=".6" d="M16.005 10.239l-5.655 3.229 5.655 3.23v-6.46z" fill="#FFF"/><path d="M16.005 4.805l-5.655 8.668 5.655-3.233V4.805z" fill="#FFF"/><path opacity=".6" d="M16.004 10.238l5.658 3.23-5.658-8.674v5.444z" fill="#FFF"/></g></svg>`;
const RETH_ICON = `<svg width="24" height="24" viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#reth_clip)"><mask id="reth_m0" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="33" height="32"><path d="M32.5 0H0.5V32H32.5V0Z" fill="white"/></mask><g mask="url(#reth_m0)"><path d="M16.5 32C25.3365 32 32.5 24.8365 32.5 16C32.5 7.16347 25.3365 0 16.5 0C7.66347 0 0.5 7.16347 0.5 16C0.5 24.8365 7.66347 32 16.5 32Z" fill="url(#reth_rg0)"/><mask id="reth_m1" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="33" height="32"><path d="M16.5 32C25.3365 32 32.5 24.8365 32.5 16C32.5 7.16347 25.3365 0 16.5 0C7.66347 0 0.5 7.16347 0.5 16C0.5 24.8365 7.66347 32 16.5 32Z" fill="url(#reth_rg1)"/></mask><g mask="url(#reth_m1)"><path opacity="0.2" d="M-0.0333252 8.80003C-0.0333252 8.44659 0.253212 8.16003 0.606675 8.16003H9.35334C9.70678 8.16003 9.99334 8.44659 9.99334 8.80003V23.68C9.99334 24.0335 9.70678 24.32 9.35334 24.32H0.606675C0.253212 24.32-0.0333252 24.0335-0.0333252 23.68V8.80003Z" fill="url(#reth_lg0)"/><path opacity="0.2" d="M19.8068 21.7067C19.8068 21.3532 20.0933 21.0667 20.4468 21.0667H31.8601C32.2135 21.0667 32.5001 21.3532 32.5001 21.7067V27.2533C32.5001 27.6068 32.2135 27.8933 31.8601 27.8933H20.4468C20.0933 27.8933 19.8068 27.6068 19.8068 27.2533V21.7067Z" fill="#E74310"/><path opacity="0.2" d="M27.22 23.4133C27.5735 23.4133 27.86 23.6999 27.86 24.0533V34.8267C27.86 35.1801 27.5735 35.4667 27.22 35.4667H23.0067C22.6533 35.4667 22.3667 35.1801 22.3667 34.8267V24.0533C22.3667 23.6999 22.6533 23.4133 23.0067 23.4133H27.22Z" fill="#DF3600"/><path opacity="0.1" d="M13.46 10.4C13.8135 10.4 14.1 10.6866 14.1 11.04V19.6267C14.1 19.9801 13.8135 20.2667 13.46 20.2667H8.71336C8.35992 20.2667 8.07336 19.9801 8.07336 19.6267V11.04C8.07336 10.6866 8.35992 10.4 8.71336 10.4H13.46Z" fill="url(#reth_lg1)"/><path opacity="0.1" d="M3.54004 12.9601C3.54004 12.6066 3.82658 12.3201 4.18004 12.3201H11.9667C12.3201 12.3201 12.6067 12.6066 12.6067 12.9601V21.1201C12.6067 21.4735 12.3201 21.7601 11.9667 21.7601H4.18004C3.82658 21.7601 3.54004 21.4735 3.54004 21.1201V12.9601Z" fill="url(#reth_lg2)"/><path opacity="0.2" d="M32.5001 4.37341C32.8535 4.37341 33.1401 4.65995 33.1401 5.01341V15.7867C33.1401 16.1402 32.8535 16.4267 32.5001 16.4267H22.5801C22.2266 16.4267 21.9401 16.1402 21.9401 15.7867V5.01341C21.9401 4.65995 22.2266 4.37341 22.5801 4.37341H32.5001Z" fill="#FF9776"/><path opacity="0.2" d="M26.4734-2.77332C26.8268-2.77332 27.1134-2.48678 27.1134-2.13332V9.70668C27.1134 10.0601 26.8268 10.3467 26.4734 10.3467H20.9267C20.5733 10.3467 20.2867 10.0601 20.2867 9.70668V-2.13332C20.2867-2.48678 20.5733-2.77332 20.9267-2.77332H26.4734Z" fill="#FFCA8C"/><path opacity="0.2" d="M29.3534-0.640015C29.7068-0.640015 29.9934-0.353477 29.9934-1.41182e-05V13.1733C29.9934 13.5268 29.7068 13.8133 29.3534 13.8133H17.3C16.9466 13.8133 16.66 13.5268 16.66 13.1733V-1.43216e-05C16.66-0.353477 16.9466-0.640015 17.3-0.640015H29.3534Z" fill="url(#reth_lg3)"/><path opacity="0.1" d="M21.7267 18.8267C22.0802 18.8267 22.3667 19.1132 22.3667 19.4667V31.36C22.3667 31.7134 22.0802 32 21.7267 32H9.46007C9.10663 32 8.82007 31.7134 8.82007 31.36V19.4667C8.82007 19.1132 9.10663 18.8267 9.46007 18.8267H21.7267Z" fill="#FFD494"/></g><path d="M16.4763 19.4523L10.3889 15.8513L16.4763 5.75293L22.5583 15.8513L16.4763 19.4523Z" fill="white"/><path d="M16.4763 25.5835L10.3889 17.0098L16.4763 20.6054L22.5638 17.0098L16.4763 25.5835Z" fill="white"/></g></g><defs><radialGradient id="reth_rg0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.9533 7.65333) rotate(54.1675) scale(26.511)"><stop stop-color="#FFD794"/><stop offset="1" stop-color="#ED5A37"/></radialGradient><radialGradient id="reth_rg1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.9533 7.65333) rotate(54.1675) scale(26.511)"><stop stop-color="#FFD794"/><stop offset="1" stop-color="#ED5A37"/></radialGradient><linearGradient id="reth_lg0" x1="4.98001" y1="8.16003" x2="4.98001" y2="24.32" gradientUnits="userSpaceOnUse"><stop stop-color="#FFE090"/><stop offset="1" stop-color="#FFE090" stop-opacity="0"/></linearGradient><linearGradient id="reth_lg1" x1="11.06" y1="10.4" x2="11.06" y2="19.52" gradientUnits="userSpaceOnUse"><stop stop-color="#DF3600"/><stop offset="1" stop-color="#DF3600" stop-opacity="0"/></linearGradient><linearGradient id="reth_lg2" x1="3.54004" y1="17.0818" x2="11.9206" y2="17.0818" gradientUnits="userSpaceOnUse"><stop stop-color="#DF3600"/><stop offset="1" stop-color="#DF3600" stop-opacity="0"/></linearGradient><linearGradient id="reth_lg3" x1="23.3267" y1="-0.640015" x2="23.3267" y2="13.8133" gradientUnits="userSpaceOnUse"><stop stop-color="#DF3600"/><stop offset="1" stop-color="#DF3600" stop-opacity="0"/></linearGradient><clipPath id="reth_clip"><rect width="32" height="32" fill="white" transform="translate(0.5)"/></clipPath></defs></svg>`;
const DAI_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><circle fill="#F4B731" fill-rule="nonzero" cx="16" cy="16" r="16"/><path d="M9.277 8h6.552c3.985 0 7.006 2.116 8.13 5.194H26v1.861h-1.611c.031.294.047.594.047.898v.046c0 .342-.02.68-.06 1.01H26v1.86h-2.08C22.767 21.905 19.77 24 15.83 24H9.277v-5.131H7v-1.86h2.277v-1.954H7v-1.86h2.277V8zm1.831 10.869v3.462h4.72c2.914 0 5.078-1.387 6.085-3.462H11.108zm11.366-1.86H11.108v-1.954h11.37c.041.307.063.622.063.944v.045c0 .329-.023.65-.067.964zM15.83 9.665c2.926 0 5.097 1.424 6.098 3.528h-10.82V9.666h4.72z" fill="#FFF"/></g></svg>`;
const BOLD_ICON = `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_1_6)"><path d="M32 16C32 7.16406 24.8359 0 16 0C7.16406 0 0 7.16406 0 16C0 24.8359 7.16406 32 16 32C24.8359 32 32 24.8359 32 16Z" fill="#63D77D"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12.1719 4.56641H8.58203V26.1016H15.7617V25.2422C16.8398 25.793 18.0586 26.1055 19.3555 26.1055C23.7148 26.1055 27.25 22.5703 27.25 18.207C27.25 13.8438 23.7148 10.3086 19.3555 10.3086C18.0586 10.3086 16.8398 10.6211 15.7617 11.1719V4.56641H12.1719ZM15.7617 11.1719C13.207 12.4805 11.457 15.1406 11.457 18.207C11.457 21.2734 13.207 23.9336 15.7617 25.2422V11.1719Z" fill="#1C1D4F"/></g><defs><clipPath id="clip0_1_6"><rect width="32" height="32" fill="white"/></clipPath></defs></svg>`;
const LUSD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24"><circle cx="128" cy="132" r="102" fill="#29C9EB"/><rect x="110" y="4" width="36" height="32" rx="9" fill="#29C9EB"/><rect x="110" y="228" width="36" height="24" rx="9" fill="#29C9EB"/><path d="M 128 30 A 102 102 0 0 1 128 234 Z" fill="#7B6AD6"/><path d="M 128 4 L 137 4 Q 146 4 146 13 L 146 36 L 128 36 Z" fill="#7B6AD6"/><path d="M 128 228 L 146 228 L 146 243 Q 146 252 137 252 L 128 252 Z" fill="#7B6AD6"/><g fill="none" stroke="white" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"><path d="M 154 90 C 146 78, 134 72, 120 74 C 98 78, 82 94, 82 112 C 82 132, 98 142, 128 150 C 158 158, 174 168, 174 186 C 174 206, 158 218, 136 220 C 120 222, 106 216, 98 204"/><line x1="128" y1="74" x2="128" y2="15"/><line x1="128" y1="220" x2="128" y2="241"/></g></svg>`;
// PNKSTR animated SVG is large (~4KB); lazy-loaded on first use
let _pnkstrIcon = null;
function getPNKSTRIcon() {
  if (_pnkstrIcon) return _pnkstrIcon;
  _pnkstrIcon = `<svg width="24" height="24" viewBox="0 0 296 296" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision"><style>#em3zDC0HIkr3{animation:em3zDC0HIkr3__rd 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr3__rd{0%{rx:93.77px;ry:93.77px}3.125%{rx:93.77px;ry:93.77px}18.75%{rx:93.77px;ry:93.77px}34.375%{rx:93.77px;ry:93.77px}56.25%{rx:0px;ry:0px}93.75%{rx:0px;ry:0px}100%{rx:0px;ry:0px}}#em3zDC0HIkr3_to{animation:em3zDC0HIkr3_to__to 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr3_to__to{0%{transform:translate(180.943141px,95.15235px)}3.125%{transform:translate(180.943141px,95.15235px)}18.75%{transform:translate(180.122px,95.152354px)}34.375%{transform:translate(148.075px,148.655006px)}56.25%{transform:translate(148.5px,148.655005px)}71.875%{transform:translate(180.122px,120.865004px)}84.375%{transform:translate(180.122px,95.152352px)}93.75%{transform:translate(180.122px,95.152351px)}100%{transform:translate(180.122px,95.152351px)}}#em3zDC0HIkr3_tr{animation:em3zDC0HIkr3_tr__tr 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr3_tr__tr{0%{transform:rotate(0deg)}34.375%{transform:rotate(0deg)}42.5%{transform:rotate(90deg)}100%{transform:rotate(90deg)}}#em3zDC0HIkr3_ts{animation:em3zDC0HIkr3_ts__ts 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr3_ts__ts{0%{transform:scale(0,0)}3.125%{transform:scale(0,0)}18.75%{transform:scale(0.8,0.8)}34.375%{transform:scale(1.319281,1.320365)}56.25%{transform:scale(1,1)}71.875%{transform:scale(0.697529,0.658712)}93.75%{transform:scale(0,0)}100%{transform:scale(0,0)}}#em3zDC0HIkr12_tr{animation:em3zDC0HIkr12_tr__tr 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr12_tr__tr{0%{transform:translate(135.33781px,207.03926px) rotate(720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}24.0625%{transform:translate(135.33781px,207.03926px) rotate(0deg);animation-timing-function:step-end}31.25%{transform:translate(135.33781px,207.03926px) rotate(720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}55.3125%{transform:translate(135.33781px,207.03926px) rotate(0deg);animation-timing-function:step-end}62.5%{transform:translate(135.33781px,207.03926px) rotate(720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}86.5625%{transform:translate(135.33781px,207.03926px) rotate(0deg);animation-timing-function:step-end}93.75%{transform:translate(135.33781px,207.03926px) rotate(720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}100%{transform:translate(135.33781px,207.03926px) rotate(532.987013deg)}}#em3zDC0HIkr12{animation:em3zDC0HIkr12_f_p 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr12_f_p{0%{fill:#d2dbed}24.0625%{fill:#d2dbec}31.25%{fill:#d2dbed}55.3125%{fill:#d2dbec}62.5%{fill:#d2dbed}86.5625%{fill:#d2dbec}93.75%{fill:#d2dbed}100%{fill:#d2dbed}}#em3zDC0HIkr13_tr{animation:em3zDC0HIkr13_tr__tr 32000ms linear infinite normal forwards}@keyframes em3zDC0HIkr13_tr__tr{0%{transform:translate(11.12px,29.9px) rotate(-720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}24.0625%{transform:translate(11.12px,29.9px) rotate(0deg);animation-timing-function:step-end}31.25%{transform:translate(11.12px,29.9px) rotate(-720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}55.3125%{transform:translate(11.12px,29.9px) rotate(0deg);animation-timing-function:step-end}62.5%{transform:translate(11.12px,29.9px) rotate(-720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}86.5625%{transform:translate(11.12px,29.9px) rotate(0deg);animation-timing-function:step-end}93.75%{transform:translate(11.12px,29.9px) rotate(-720deg);animation-timing-function:cubic-bezier(0.415,0.08,0.115,0.955)}100%{transform:translate(11.12px,29.9px) rotate(-532.987013deg)}}</style><circle r="148" transform="translate(148 148)" fill="#0d0d0d"/><g id="em3zDC0HIkr3_to" transform="translate(180.943141,95.15235)"><g id="em3zDC0HIkr3_tr" transform="rotate(0)"><g id="em3zDC0HIkr3_ts" transform="scale(0,0)"><rect id="em3zDC0HIkr3" width="187.538" height="187.538" rx="93.77" ry="93.77" transform="translate(-93.769,-93.769005)" fill="#f2f2f2"/></g></g></g><g style="mix-blend-mode:difference"><path d="M141.692,120.865v-43.1014h11.213v43.1014h-11.213ZM125.299,78.8923v-9.4526h43.857v9.4526h-43.857Zm53.228,41.9727L164.05,69.4397h11.425l9.51,39.2913h-.923l10.007-39.2913h10.716l9.864,39.2913h-.852l9.581-39.2913h11.567L220.184,120.865h-12.135l-9.084-36.0472h.994l-9.155,36.0472h-12.277Z" fill="#fff"/></g></svg>`;
  return _pnkstrIcon;
}
const ZORG_ICON = `<svg width="24" height="24" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="99" fill="#000"/><circle cx="100" cy="100" r="93" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M 69 65 L 96 64 L 97 65 L 98 64 L 120 64 L 121 65 L 122 64 L 130 64 L 130 70 L 117 85 L 118 86 L 104 100 L 105 101 L 91 115 L 92 116 L 78 130 L 96 130 L 97 131 L 98 130 L 120 130 L 121 131 L 122 130 L 132 131 L 120 136 L 119 135 L 118 136 L 96 136 L 95 135 L 94 136 L 71 136 L 71 130 L 84 115 L 83 114 L 97 100 L 96 99 L 110 85 L 109 84 L 123 70 L 105 70 L 104 69 L 103 70 L 83 70 L 82 69 L 81 70 L 69 69 Z" fill="#fff"/></svg>`;
const ZAMM_ICON = `<svg width="24" height="24" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="99" fill="#fff"/><circle cx="100" cy="100" r="93" fill="none" stroke="#000" stroke-width="1.2"/><path d="M 69 65 L 96 64 L 97 65 L 98 64 L 120 64 L 121 65 L 122 64 L 130 64 L 130 70 L 117 85 L 118 86 L 104 100 L 105 101 L 91 115 L 92 116 L 78 130 L 96 130 L 97 131 L 98 130 L 120 130 L 121 131 L 122 130 L 132 131 L 120 136 L 119 135 L 118 136 L 96 136 L 95 135 L 94 136 L 71 136 L 71 130 L 84 115 L 83 114 L 97 100 L 96 99 L 110 85 L 109 84 L 123 70 L 105 70 L 104 69 L 103 70 L 83 70 L 82 69 L 81 70 L 69 69 Z" fill="#000"/></svg>`;
const DEFAULT_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><text x="12" y="16" text-anchor="middle" fill="currentColor" font-size="12" font-weight="bold">?</text></svg>`;

const ICONS = {
  ETH: ETH_ICON,
  WETH: WETH_ICON,
  USDC: USDC_ICON,
  USDT: USDT_ICON,
  WBTC: WBTC_ICON,
  stETH: STETH_ICON,
  wstETH: WSTETH_ICON,
  rETH: RETH_ICON,
  DAI: DAI_ICON,
  BOLD: BOLD_ICON,
  LUSD: LUSD_ICON,
  zOrg: ZORG_ICON,
  ZAMM: ZAMM_ICON,
};

const _letterIconCache = new Map();
function iconForSymbol(sym) {
  const s = String(sym);
  if (ICONS[s]) return ICONS[s];
  if (s === "PNKSTR") return getPNKSTRIcon();
  const t = tokens[s];
  if (t?.icon) {
    const img = document.createElement("img");
    img.src = t.icon;
    img.width = 24;
    img.height = 24;
    img.style.borderRadius = "50%";
    img.alt = s;
    img.onerror = function () {
      this.outerHTML = makeLetterIcon(s);
    };
    return img.outerHTML;
  }
  if (_letterIconCache.has(s)) return _letterIconCache.get(s);
  const svg = makeLetterIcon(s);
  _letterIconCache.set(s, svg);
  return svg;
}

function makeLetterIcon(sym) {
  try {
    const full = String(sym ?? "").trim();
    // Preserve original casing (stETH, crvUSD, frxETH, etc.)
    const clean = full.replace(/[^A-Za-z0-9]/g, "") || "?";
    const show = clean.length <= 7 ? clean : clean.slice(0, 6) + "\u2026";
    const L = show.length;
    const fontSize =
      L <= 1
        ? 10
        : L === 2
          ? 8.5
          : L === 3
            ? 7.2
            : L === 4
              ? 6
              : L === 5
                ? 5.2
                : L === 6
                  ? 4.6
                  : 4;
    // Deterministic hue from full symbol (case-sensitive for better spread)
    let hash = 0;
    for (let i = 0; i < clean.length; i++)
      hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
    const hue = ((hash % 360) + 360) % 360;
    // textLength compresses longer symbols to fit within the circle
    const tl =
      L >= 5
        ? ` textLength="${L >= 7 ? 19 : 18}" lengthAdjust="spacingAndGlyphs"`
        : "";
    return (
      `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="${escAttr(full)}">` +
      `<title>${escText(full)}</title>` +
      `<circle cx="12" cy="12" r="11" fill="hsl(${hue},50%,50%)" stroke="hsl(${hue},35%,38%)" stroke-width="1"/>` +
      `<text x="12" y="12.3" text-anchor="middle" dominant-baseline="middle"` +
      ` font-family="Helvetica,Arial,sans-serif"` +
      ` font-size="${fontSize}" font-weight="700" fill="#fff"${tl}>${escText(show)}</text>` +
      `</svg>`
    );
  } catch (e) {
    return DEFAULT_ICON;
  }
}

// ---- RPC fallback system ----
const RPCS = [
  "https://1rpc.io/base",
  "https://base.llamarpc.com",
  "https://base.meowrpc.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
];

function makeWalletReader() {
  try {
    if (!window.ethereum) return null;
    const bp = new ethers.BrowserProvider(window.ethereum, CHAIN_ID);
    return bp;
  } catch {
    return null;
  }
}

function makeFallbackProvider(urls) {
  const network = { chainId: CHAIN_ID, name: "mainnet" };
  const nodes = urls.map((u) => ({
    url: u,
    p: new ethers.JsonRpcProvider(u, network, { batchMaxCount: 10 }),
    downUntil: 0,
    warmed: false,
    ok: true,
  }));

  const walletReader = makeWalletReader();
  if (walletReader) {
    nodes.push({
      url: "wallet",
      p: walletReader,
      downUntil: 0,
      warmed: true,
      ok: true,
    });
  }

  const withTimeout = (ms, work) =>
    Promise.race([
      work(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);

  const isInfraErr = (e) => {
    const s = String(e?.message || "");
    return (
      /server response 400\b/i.test(s) ||
      /502|503|504|ECONNRESET|ENETUNREACH|EAI_AGAIN|Failed to fetch/i.test(s) ||
      /failed to detect network|timeout|timed out|ETIMEDOUT/i.test(s)
    );
  };
  const isAuthErr = (e) =>
    /Unauthorized|invalid api key|403|401/i.test(String(e?.message || ""));

  return {
    async call(fn) {
      const now = Date.now();
      let lastErr;
      const candidates = nodes
        .filter((n) => n.ok && n.downUntil <= now)
        .concat(nodes.filter((n) => n.ok && n.downUntil > now));

      for (const n of candidates) {
        try {
          if (!n.warmed && n.url !== "wallet") {
            await withTimeout(1200, () => n.p.getNetwork());
            n.warmed = true;
          }
          const res = await withTimeout(3500, () => fn(n.p));
          n.downUntil = 0;
          return res;
        } catch (e) {
          lastErr = e;
          if (isAuthErr(e)) n.ok = false;
          else if (isInfraErr(e)) n.downUntil = Date.now() + 30_000;
        }
      }
      throw lastErr || new Error("All RPCs failed");
    },
  };
}

const quoteRPC = makeFallbackProvider(RPCS);

// ---- Formatting helpers ----
const fmt = (nStr, max = 6) => {
  if (nStr == null) return "--";
  const n = Number(nStr);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e21) {
    const s = String(nStr);
    return s.includes(".")
      ? s
          .replace(new RegExp(`(\\.\\d{0,${max}}).*$`), "$1")
          .replace(/\.?0+$/, "")
      : s;
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
};
// Format output amounts: thousands separators, smart decimal truncation
const fmtOutput = (nStr) => {
  if (nStr == null) return "--";
  const n = Number(nStr);
  if (!Number.isFinite(n)) return nStr;
  // Adaptive decimals: large numbers get fewer decimals
  let maxDec;
  if (Math.abs(n) >= 10000) maxDec = 2;
  else if (Math.abs(n) >= 100) maxDec = 3;
  else if (Math.abs(n) >= 1) maxDec = 4;
  else maxDec = 6;
  return n.toLocaleString(undefined, {
    maximumFractionDigits: maxDec,
    minimumFractionDigits: 0,
  });
};

// ---- Allowance cache ----
const _allowTTLms = 10_000;
const _allowCache = new Map();
const _allowKey = (token, owner, spender) =>
  `${token.toLowerCase()}:${owner.toLowerCase()}:${spender.toLowerCase()}`;

function cacheSetAllowance(token, owner, spender, v) {
  _allowCache.set(_allowKey(token, owner, spender), { v, t: Date.now() });
}
function cacheGetAllowance(token, owner, spender) {
  const hit = _allowCache.get(_allowKey(token, owner, spender));
  return hit && Date.now() - hit.t < _allowTTLms ? hit.v : null;
}

// ---- Multicall3 batched reads ----
const MULTICALL3_IFACE = new ethers.Interface([
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
  "function getEthBalance(address addr) view returns (uint256 balance)",
]);
const MC_BAL_IFACE = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const _balanceCache = new Map(); // key → { v: bigint, t: number }
const _BAL_TTL = 15_000;

function getCachedBalance(tokenAddress) {
  const key =
    tokenAddress === ZERO_ADDRESS ? "ETH" : tokenAddress.toLowerCase();
  const hit = _balanceCache.get(key);
  return hit && Date.now() - hit.t < _BAL_TTL ? hit.v : null;
}
function setCachedBalance(tokenAddress, value) {
  const key =
    tokenAddress === ZERO_ADDRESS ? "ETH" : tokenAddress.toLowerCase();
  _balanceCache.set(key, { v: value, t: Date.now() });
}

async function multicallRead(calls) {
  if (calls.length === 0) return [];
  const calldata = MULTICALL3_IFACE.encodeFunctionData("aggregate3", [
    calls.map((c) => [c.target, c.allowFailure, c.callData]),
  ]);
  const rpc = provider || (await quoteRPC.call((r) => r));
  const raw = await rpc.call({ to: MULTICALL3_ADDRESS, data: calldata });
  return MULTICALL3_IFACE.decodeFunctionResult("aggregate3", raw)[0];
}

async function fetchModalBalances() {
  if (!connectedAddress) return;
  const allTokens = Object.values(tokens);
  const calls = [];
  const meta = [];
  const balOfData = MC_BAL_IFACE.encodeFunctionData("balanceOf", [
    connectedAddress,
  ]);

  // ETH balance
  calls.push({
    target: MULTICALL3_ADDRESS,
    allowFailure: true,
    callData: MULTICALL3_IFACE.encodeFunctionData("getEthBalance", [
      connectedAddress,
    ]),
  });
  meta.push({ type: "eth" });

  // All ERC-20 balances
  for (const t of allTokens) {
    if (t.address === ZERO_ADDRESS) continue;
    calls.push({
      target: t.address,
      allowFailure: true,
      callData: balOfData,
    });
    meta.push({ type: "erc20", address: t.address });
  }

  try {
    const results = await multicallRead(calls);
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      const r = results[i];
      if (!r || !r.success) continue;
      try {
        if (m.type === "eth") {
          setCachedBalance(
            ZERO_ADDRESS,
            MULTICALL3_IFACE.decodeFunctionResult(
              "getEthBalance",
              r.returnData,
            )[0],
          );
        } else {
          setCachedBalance(
            m.address,
            MC_BAL_IFACE.decodeFunctionResult("balanceOf", r.returnData)[0],
          );
        }
      } catch {}
    }
    // Re-render to show fetched balances
    const filter = $("tokenSearchInput")?.value || "";
    renderTokenList(filter);
  } catch (e) {
    console.warn("Multicall3 modal balances failed:", e);
  }
}

function safeParseUnits(valStr, decimals) {
  const s = String(valStr).trim();
  if (!s) throw new Error("Empty amount");
  const m = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error("Invalid number");
  const frac = m[2] || "";
  if (frac.length > decimals)
    throw new Error(`Too many decimals (max ${decimals})`);
  return ethers.parseUnits(s, decimals);
}

// ---- Permit config ----
const PERMIT_CONFIG = {
  [USDC_ADDRESS.toLowerCase()]: {
    type: "eip2612",
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 8453n,
      verifyingContract: USDC_ADDRESS,
    },
    routerFn:
      "permit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  },
  [DAI_ADDRESS.toLowerCase()]: {
    type: "dai",
    domain: {
      name: "Dai Stablecoin",
      version: "1",
      chainId: 8453n,
      verifyingContract: DAI_ADDRESS,
    },
    routerFn:
      "permitDAI(uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)",
  },
};

// ---- Generic EIP-2612 permit detection ----
const _permitCache = new Map(); // address → config | null

const _permitIface = new ethers.Interface([
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function nonces(address) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);

async function _staticCall(tokenAddress, data) {
  return await quoteRPC.call((rpc) => rpc.call({ to: tokenAddress, data }));
}

async function detectPermitConfig(tokenAddress) {
  const key = tokenAddress.toLowerCase();
  if (PERMIT_CONFIG[key]) return PERMIT_CONFIG[key];
  if (_permitCache.has(key)) return _permitCache.get(key);

  try {
    // Quick check: does it have nonces() and DOMAIN_SEPARATOR()?
    const [nonceRes, dsRes] = await Promise.all([
      _staticCall(
        tokenAddress,
        _permitIface.encodeFunctionData("nonces", [ZERO_ADDRESS]),
      ),
      _staticCall(
        tokenAddress,
        _permitIface.encodeFunctionData("DOMAIN_SEPARATOR"),
      ),
    ]);
    // If either reverts, quoteRPC throws or returns 0x
    if (!nonceRes || nonceRes === "0x" || !dsRes || dsRes === "0x")
      throw new Error("no permit");

    // Try EIP-5267 eip712Domain() first
    let domainName, domainVersion;
    try {
      const domRes = await _staticCall(
        tokenAddress,
        _permitIface.encodeFunctionData("eip712Domain"),
      );
      const decoded = _permitIface.decodeFunctionResult("eip712Domain", domRes);
      domainName = decoded[1];
      domainVersion = decoded[2];
    } catch (_) {
      // Fallback: read name() and try version "1"
      const nameRes = await _staticCall(
        tokenAddress,
        _permitIface.encodeFunctionData("name"),
      );
      domainName = _permitIface.decodeFunctionResult("name", nameRes)[0];
      domainVersion = "1";
    }

    // Verify by computing the expected DOMAIN_SEPARATOR
    const candidateDomain = {
      name: domainName,
      version: domainVersion,
      chainId: CHAIN_ID,
      verifyingContract: tokenAddress,
    };
    const computed = ethers.TypedDataEncoder.hashDomain(candidateDomain);
    const onchain = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32"],
      dsRes,
    )[0];
    if (computed !== onchain) {
      // Try version "2" as fallback
      candidateDomain.version = "2";
      const computed2 = ethers.TypedDataEncoder.hashDomain(candidateDomain);
      if (computed2 !== onchain) {
        _permitCache.set(key, null);
        return null;
      }
    }

    const config = {
      type: "eip2612",
      domain: candidateDomain,
      routerFn:
        "permit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    };
    _permitCache.set(key, config);
    return config;
  } catch (_) {
    _permitCache.set(key, null);
    return null;
  }
}

async function getPermitConfig(tokenAddress) {
  const key = tokenAddress.toLowerCase();
  if (PERMIT_CONFIG[key]) return PERMIT_CONFIG[key];
  return await detectPermitConfig(tokenAddress);
}

async function signPermit(config, tokenAddress) {
  const deadline = BigInt(Math.trunc(Date.now() / 1000) + 3600);
  const owner = connectedAddress;
  const spender = ZROUTER_ADDRESS;

  // Fetch nonce from token contract
  const nonceData = _permitIface.encodeFunctionData("nonces", [owner]);
  const nonceResult = await quoteRPC.call((rpc) =>
    rpc.call({ to: tokenAddress, data: nonceData }),
  );
  const nonce = _permitIface.decodeFunctionResult("nonces", nonceResult)[0];

  let types, values;
  if (config.type === "dai") {
    types = {
      Permit: [
        { name: "holder", type: "address" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "allowed", type: "bool" },
      ],
    };
    values = {
      holder: owner,
      spender,
      nonce,
      expiry: deadline,
      allowed: true,
    };
  } else {
    types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    values = {
      owner,
      spender,
      value: ethers.MaxUint256,
      nonce,
      deadline,
    };
  }

  const sig = await signer.signTypedData(config.domain, types, values);
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s, nonce, deadline, config };
}

function decodeMulticallCalls(multicallData) {
  try {
    const decoded = ROUTER_IFACE.decodeFunctionData("multicall", multicallData);
    return Array.from(decoded[0]);
  } catch (e) {
    return [];
  }
}

function buildPermitMulticall(calls, permitData) {
  let permitCall;
  if (permitData.config.type === "dai") {
    permitCall = ROUTER_IFACE.encodeFunctionData("permitDAI", [
      permitData.nonce,
      permitData.deadline,
      permitData.v,
      permitData.r,
      permitData.s,
    ]);
  } else {
    permitCall = ROUTER_IFACE.encodeFunctionData("permit", [
      permitData.config.domain.verifyingContract,
      ethers.MaxUint256,
      permitData.deadline,
      permitData.v,
      permitData.r,
      permitData.s,
    ]);
  }
  return ROUTER_IFACE.encodeFunctionData("multicall", [[permitCall, ...calls]]);
}

// ---- Permit2 SignatureTransfer support ----
const PERMIT2_DOMAIN = {
  name: "Permit2",
  chainId: CHAIN_ID,
  verifyingContract: PERMIT2_ADDRESS,
};
const PERMIT2_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
};

async function checkPermit2Allowance(tokenAddress) {
  let a = cacheGetAllowance(tokenAddress, connectedAddress, PERMIT2_ADDRESS);
  if (a != null) return a;
  const r = erc20Read(tokenAddress);
  a = await r.allowance(connectedAddress, PERMIT2_ADDRESS);
  cacheSetAllowance(tokenAddress, connectedAddress, PERMIT2_ADDRESS, a);
  return a;
}

async function signPermit2(tokenAddress, amount) {
  const deadline = BigInt(Math.trunc(Date.now() / 1000) + 3600);
  const _nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(_nonceBytes);
  const nonce = _nonceBytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
  const values = {
    permitted: { token: tokenAddress, amount },
    spender: ZROUTER_ADDRESS,
    nonce,
    deadline,
  };
  const sig = await signer.signTypedData(PERMIT2_DOMAIN, PERMIT2_TYPES, values);
  return { signature: sig, nonce, deadline, token: tokenAddress, amount };
}

function buildPermit2Multicall(calls, p2) {
  const p2call = ROUTER_IFACE.encodeFunctionData("permit2TransferFrom", [
    p2.token,
    p2.amount,
    p2.nonce,
    p2.deadline,
    p2.signature,
  ]);
  return ROUTER_IFACE.encodeFunctionData("multicall", [[p2call, ...calls]]);
}

// ---- ERC20 readers (cached, recreated on provider change) ----
const _erc20Read = new Map();
let _erc20ReadProvider = null;
function erc20Read(address) {
  if (!provider) throw new Error("No provider");
  if (_erc20ReadProvider !== provider) {
    _erc20Read.clear();
    _erc20ReadProvider = provider;
  }
  const k = address.toLowerCase();
  if (!_erc20Read.has(k)) {
    _erc20Read.set(
      k,
      new ethers.Contract(
        address,
        ["function allowance(address,address) view returns (uint256)"],
        provider,
      ),
    );
  }
  return _erc20Read.get(k);
}

// ---- Balance updates (Multicall3 batched) ----
async function updateBalances() {
  if (!provider || !connectedAddress) return;

  const seq = ++_balSeq;
  const fromSnap = fromToken,
    toSnap = toToken;
  const f = tokens[fromSnap],
    t = tokens[toSnap];
  const fromIsEth = f.address === ZERO_ADDRESS;
  const toIsEth = t.address === ZERO_ADDRESS;

  try {
    const calls = [];
    const meta = [];
    const balOfData = MC_BAL_IFACE.encodeFunctionData("balanceOf", [
      connectedAddress,
    ]);

    // ETH balance via getEthBalance
    if (fromIsEth || toIsEth) {
      calls.push({
        target: MULTICALL3_ADDRESS,
        allowFailure: true,
        callData: MULTICALL3_IFACE.encodeFunctionData("getEthBalance", [
          connectedAddress,
        ]),
      });
      meta.push({ type: "eth" });
    }
    // From token balance
    if (!fromIsEth) {
      calls.push({
        target: f.address,
        allowFailure: true,
        callData: balOfData,
      });
      meta.push({ type: "erc20", key: f.address.toLowerCase() });
    }
    // To token balance (if different)
    if (!toIsEth) {
      const keyT = t.address.toLowerCase();
      if (fromIsEth || keyT !== f.address.toLowerCase()) {
        calls.push({
          target: t.address,
          allowFailure: true,
          callData: balOfData,
        });
        meta.push({ type: "erc20", key: keyT });
      }
    }
    // Batch allowance reads for from token (saves RPCs during quote/swap)
    if (!fromIsEth) {
      calls.push({
        target: f.address,
        allowFailure: true,
        callData: MC_BAL_IFACE.encodeFunctionData("allowance", [
          connectedAddress,
          ZROUTER_ADDRESS,
        ]),
      });
      meta.push({
        type: "allow",
        token: f.address,
        spender: ZROUTER_ADDRESS,
      });
      calls.push({
        target: f.address,
        allowFailure: true,
        callData: MC_BAL_IFACE.encodeFunctionData("allowance", [
          connectedAddress,
          PERMIT2_ADDRESS,
        ]),
      });
      meta.push({
        type: "allow",
        token: f.address,
        spender: PERMIT2_ADDRESS,
      });
    }

    const results = await multicallRead(calls);
    if (seq !== _balSeq || fromSnap !== fromToken || toSnap !== toToken) return;

    const balances = Object.create(null);
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i],
        r = results[i];
      if (!r || !r.success) continue;
      try {
        if (m.type === "eth") {
          balances.ETH = MULTICALL3_IFACE.decodeFunctionResult(
            "getEthBalance",
            r.returnData,
          )[0];
          setCachedBalance(ZERO_ADDRESS, balances.ETH);
        } else if (m.type === "erc20") {
          balances[m.key] = MC_BAL_IFACE.decodeFunctionResult(
            "balanceOf",
            r.returnData,
          )[0];
          setCachedBalance(m.key, balances[m.key]);
        } else if (m.type === "allow") {
          cacheSetAllowance(
            m.token,
            connectedAddress,
            m.spender,
            MC_BAL_IFACE.decodeFunctionResult("allowance", r.returnData)[0],
          );
        }
      } catch {}
    }

    const fromStr = fromIsEth
      ? `${fmt(ethers.formatEther(balances.ETH ?? 0n))} ETH`
      : `${fmt(ethers.formatUnits(balances[f.address.toLowerCase()] ?? 0n, f.decimals))} ${f.symbol}`;
    const toStr = toIsEth
      ? `${fmt(ethers.formatEther(balances.ETH ?? 0n))} ETH`
      : `${fmt(ethers.formatUnits(balances[t.address.toLowerCase()] ?? 0n, t.decimals))} ${t.symbol}`;

    setText("fromBalance", `Balance: ${fromStr}`);
    setText("toBalance", `Balance: ${toStr}`);
  } catch (e) {
    console.error("Balance update error:", e);
  }
}

// ---- AMM names ----
const AMM_NAMES = {
  0: "Uniswap V2",
  1: "zAMM",
  2: "Uniswap V3",
  3: "Uniswap V4",
};
// Rocket Pool direct deposit (dapp-side quoting via rETH contract)
const ROCKET_DEPOSIT_POOL = "0xCE15294273CFb9D9b628F4D61636623decDF4fdC";
const ROCKET_DEPOSIT_ABI = [
  "function getMaximumDepositAmount() view returns (uint256)",
];
const RETH_RATE_ABI = [
  "function getRethValue(uint256) view returns (uint256)",
  "function getEthValue(uint256) view returns (uint256)",
];

// ---- Hoisted ABIs / Interfaces (avoid re-parsing per call) ----
const QUOTER_IFACE = new ethers.Interface([
  "function buildBestSwapViaETHMulticall(address to,address refundTo,bool exactOut,address tokenIn,address tokenOut,uint256 swapAmount,uint256 slippageBps,uint256 deadline,uint24 hookPoolFee,int24 hookTickSpacing,address hookAddress,bool omitSwapAmountForBuildingCalldata) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) a, tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) b, bytes[] calls, bytes multicall, uint256 msgValue)",
  "function buildSplitSwap(address to,address tokenIn,address tokenOut,uint256 swapAmount,uint256 slippageBps,uint256 deadline,bool omitSwapAmountForBuildingCalldata) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut)[2] legs, bytes multicall, uint256 msgValue)",
  "function getQuotes(bool exactOut,address tokenIn,address tokenOut,uint256 swapAmount) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) best, tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut)[] quotes)",
  "function quoteCurve(bool exactOut,address tokenIn,address tokenOut,uint256 swapAmount,uint256 maxCandidates,bool omitSwapAmountForBuildingCalldata) view returns (uint256 amountIn,uint256 amountOut,address bestPool,bool usedUnderlying,bool usedStable,uint8 iIndex,uint8 jIndex)",
  "function quoteV4(bool,address,address,uint24,int24,address,uint256) view returns (uint256 amountIn, uint256 amountOut)",
  "function buildSplitSwapHooked(address to,address tokenIn,address tokenOut,uint256 swapAmount,uint256 slippageBps,uint256 deadline,uint24 hookPoolFee,int24 hookTickSpacing,address hookAddress,bool omitSwapAmountForBuildingCalldata) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut)[2] legs, bytes multicall, uint256 msgValue)",
  "function quoteZAMM(bool exactOut,uint256 feeOrHook,address tokenIn,address tokenOut,uint256 idIn,uint256 idOut,uint256 swapAmount) view returns (uint256 amountIn, uint256 amountOut)",
  "function build3HopMulticall(address to,address tokenIn,address tokenOut,uint256 swapAmount,uint256 slippageBps,uint256 deadline,bool omitSwapAmountForBuildingCalldata) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) a, tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) b, tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut) c, bytes[] calls, bytes multicall, uint256 msgValue)",
  "function buildHybridSplit(address to,address tokenIn,address tokenOut,uint256 swapAmount,uint256 slippageBps,uint256 deadline,bool omitSwapAmountForBuildingCalldata) view returns (tuple(uint8 source,uint256 feeBps,uint256 amountIn,uint256 amountOut)[2] legs, bytes multicall, uint256 msgValue)",
  "function quoteLido(bool exactOut,address tokenOut,uint256 swapAmount) view returns (uint256 amountIn, uint256 amountOut)",
]);
const QUOTERBASE_IFACE = new ethers.Interface([
  "function quoteV4(bool exactOut,address tokenIn,address tokenOut,uint24 fee,int24 tickSpacing,address hooks,uint256 swapAmount) public view returns (uint256 amountIn, uint256 amountOut)",
]);
const ROUTER_IFACE = new ethers.Interface([
  "function deposit(address,uint256,uint256) payable",
  "function execute(address,uint256,bytes) payable returns (bytes)",
  "function multicall(bytes[]) payable returns (bytes[])",
  "function sweep(address,uint256,uint256,address) payable",
  "function swapVZ(address to,bool exactOut,uint256 feeOrHook,address tokenIn,address tokenOut,uint256 idIn,uint256 idOut,uint256 swapAmount,uint256 amountLimit,uint256 deadline) payable returns (uint256 amountIn, uint256 amountOut)",
  "function swapV4(address to,bool exactOut,uint24 swapFee,int24 tickSpace,address tokenIn,address tokenOut,uint256 swapAmount,uint256 amountLimit,uint256 deadline) payable returns (uint256 amountIn, uint256 amountOut)",
  "function wrap(uint256 amount) payable",
  "function exactETHToSTETH(address to) payable returns (uint256 shares)",
  "function exactETHToWSTETH(address to) payable returns (uint256 wstOut)",
  "function permit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function permitDAI(uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)",
  "function permit2TransferFrom(address token, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)",
]);
const MAYBE_ROUTER_IFACE = new ethers.Interface([
  "function maybeSwap(address,uint256,bytes,uint160,uint256,bool,uint160,bytes,address) payable",
  // "event SwapBeforeMaybifying(uint256 indexed maybifyId, address indexed swapper, address inToken, uint256 inTokenAmount)",
  "event SwapBeforeMaybifying(uint256 indexed maybifyId, address inToken, uint256 inTokenAmount)",
]);
const V4_STATE_VIEW_IFACE = new ethers.Interface([
  "function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24)",
]);
const MAYBE_HOOK_IFACE = new ethers.Interface([
  "function vrfCallbackGasLimit() external view returns (uint32)",
  "function protocolFeeInBps() external view returns (uint256)",
  "event MaybifiedSwapRegistered(uint256 indexed id, address indexed swapper, uint256 probabilityInBps, uint256 burntAmount, uint256 timestamp, uint256 protocolFeeInBps, bool swapBackOnlyToEth, uint160 swapBackSqrtPriceLimitX96, bytes swapBackParams, address swapBackIntendedOutToken)",
  "event MaybifiedSwapResolved(uint256 indexed id, address indexed swapper, uint256 randomness, uint256 randomnessInBps, uint256 mintedAmount, uint256 timestamp, uint8 indexed swapBackState, bytes swapBackResultData)",
]);
const VRF_V2_PLUS_WRAPPER_IFACE = new ethers.Interface([
  "function estimateRequestPriceNative(uint32, uint32, uint256) external view returns (uint256)",
]);

const ZORG_BUYSHARES_IFACE = new ethers.Interface([
  "function buyShares(address payToken, uint256 shareAmount, uint256 maxPay)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const ZORG_RAGEQUIT_IFACE = new ethers.Interface([
  "function ragequit(address[] tokens, uint256 sharesToBurn, uint256 lootToBurn)",
]);

// ---- Quote refresh timer ----
let _refreshTimer = null;
let _refreshCountdown = 0;

function startQuoteRefresh() {
  stopQuoteRefresh();
  _refreshCountdown = 15;
  setText("quoteCountdown", `Refreshes in ${_refreshCountdown}s`);
  _refreshTimer = setInterval(() => {
    _refreshCountdown--;
    if (_refreshCountdown <= 0) {
      _refreshCountdown = 15;
      handleAmountChange();
    }
    setText("quoteCountdown", `Refreshes in ${_refreshCountdown}s`);
  }, 1000);
}

function stopQuoteRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
  _refreshCountdown = 0;
  setText("quoteCountdown", "");
}

function manualRefresh() {
  handleAmountChange();
  // Timer restarted by handleAmountChange on success
}

// ---- Quoting ----
let _quoteSeq = 0;

async function handleAmountChange() {
  if (_swapCardMaybifyId !== null) return; // card locked for VRF
  const amtStr = $("fromAmount").value.trim();
  const swapBtn = $("swapBtn");
  const toAmountEl = $("toAmount");
  const quoteInfoEl = $("quoteInfo");

  if (!connectedAddress) {
    setText(swapBtn, "Connect Wallet");
    setDisabled(swapBtn, false);
    setShown(quoteInfoEl, false);
    stopQuoteRefresh();
    toAmountEl.value = "";
    return;
  }

  const amtNum = Number(amtStr);
  if (!amtStr || !Number.isFinite(amtNum) || amtNum <= 0) {
    toAmountEl.value = "";
    setShown(quoteInfoEl, false);
    stopQuoteRefresh();
    setText(swapBtn, "Enter an amount");
    setDisabled(swapBtn, true);
    return;
  }

  if (fromToken === toToken) {
    toAmountEl.value = "";
    setShown(quoteInfoEl, false);
    stopQuoteRefresh();
    setText(swapBtn, "Select different tokens");
    setDisabled(swapBtn, true);
    return;
  }

  // ETH ↔ WETH wrap/unwrap: 1:1, no DEX needed (only when sending to self)
  const _receiverRaw = ($("receiverAddress")?.value || "").trim();
  const _resolvedAddr = getReceiver();
  const _hasCustomReceiver =
    _receiverRaw &&
    (isReceiverPending() ||
      (_resolvedAddr && _resolvedAddr !== connectedAddress));
  const wrapDir = !_hasCustomReceiver ? isWrapUnwrap(fromToken, toToken) : null;
  if (wrapDir) {
    const fromData = tokens[fromToken];
    try {
      const amountIn = safeParseUnits(amtStr, fromData.decimals);
      // Output equals input (1:1, both 18 decimals)
      toAmountEl.value = amtStr;
      fitRouteText(wrapDir === "wrap" ? "WETH Wrap" : "WETH Unwrap");
      const _ln = $("routeInfo")?.parentNode?.querySelector(".lido-note");
      if (_ln) _ln.style.display = "none";
      $("chartLink").style.display = "none";
      setText("impactInfo", "0%");
      setShown("allRoutesWrap", false);
      setShown("impactRow", true);
      setShown("slippageRow", false);
      setShown("refreshRow", false);
      setShown(quoteInfoEl, true);
      stopQuoteRefresh(); // No refresh needed for 1:1
      setText(swapBtn, wrapDir === "wrap" ? "Wrap" : "Unwrap");
      setDisabled(swapBtn, !connectedAddress);
    } catch (e) {
      toAmountEl.value = "";
      setShown(quoteInfoEl, false);
      setText(swapBtn, e.message || "Invalid amount");
      setDisabled(swapBtn, true);
    }
    return;
  }

  if (!provider) return;

  const seq = ++_quoteSeq;
  const fromSnap = fromToken,
    toSnap = toToken;

  // try {
  setHTML(swapBtn, `<span class="loading"></span> Getting quote...`);
  setDisabled(swapBtn, true);
  toAmountEl.value = "";
  toAmountEl.placeholder = "Fetching\u2026";

  const quote = await requestQuote(amtStr, fromSnap, toSnap);
  console.log("quote received inside handleAmountChange(): ", quote);

  if (seq !== _quoteSeq || fromSnap !== fromToken || toSnap !== toToken) return;

  const toData = tokens[toSnap];
  toAmountEl.placeholder = "0.0";
  const outRaw = ethers.formatUnits(quote.expectedOutput, toData.decimals);
  const outDisplay = fmtOutput(outRaw);
  if (toAmountEl.value !== outDisplay) toAmountEl.value = outDisplay;

  // Exchange rate line
  const rateEl = $("quoteRate");
  if (rateEl) {
    const inNum = Number(amtStr);
    const outNum = Number(outRaw);
    if (inNum > 0 && Number.isFinite(outNum) && outNum > 0) {
      const rate = outNum / inNum;
      // Adaptive precision: use more decimals for tiny rates (e.g. ZAMM → ETH)
      const rateDec = rate >= 1 ? 2 : rate >= 0.01 ? 4 : rate >= 0.0001 ? 6 : 8;
      rateEl.textContent = `1 ${tokens[fromSnap].symbol} \u2248 ${fmt(rate.toString(), rateDec)} ${toData.symbol}`;
      rateEl.style.display = "";
    } else {
      rateEl.style.display = "none";
    }
  }

  // Route display
  const isLidoRoute =
    quote.sourceA === "Lido" && !quote.isSplit && !quote.isTwoHop;
  const isRocketRoute =
    quote.sourceA === "Rocket Pool" && !quote.isSplit && !quote.isTwoHop;
  const isStakeRoute = isLidoRoute || isRocketRoute;
  const route = quote.isSplit
    ? formatSplitRoute(quote.splitLegs)
    : quote.isTwoHop
      ? `${quote.sourceA} + ${quote.sourceB}`
      : isStakeRoute
        ? `${quote.sourceA} Stake`
        : `${quote.sourceA}`;
  fitRouteText(route);
  updateChartLink(quote);
  // Show "Direct stake" note for Lido/Rocket Pool routes
  const routeEl = $("routeInfo");
  if (routeEl) {
    let noteEl = routeEl.parentNode.querySelector(".lido-note");
    if (isStakeRoute) {
      if (!noteEl) {
        noteEl = document.createElement("span");
        noteEl.className = "lido-note";
        noteEl.style.cssText =
          "font-size:11px;color:var(--fg-muted);margin-left:6px";
        routeEl.parentNode.appendChild(noteEl);
      }
      noteEl.textContent = "Direct stake — no DEX fees";
      noteEl.style.display = "";
    } else if (noteEl) {
      noteEl.style.display = "none";
    }
  }

  // Split/multi-hop slippage note
  const ssn = $("splitSlipNote");
  if (ssn) {
    if (quote.isSplit || quote.isTwoHop) {
      const slippageBps = readSlippage();
      const perLeg = Math.min(Math.max(slippageBps * 3, 150), 500) / 100;
      ssn.textContent = `(${perLeg}% per leg)`;
      ssn.style.display = "";
    } else {
      ssn.style.display = "none";
    }
  }

  // Price impact
  displayPriceImpact(amtStr, fromSnap, toSnap, quote);

  // All routes
  displayAllRoutes(quote, toSnap);

  // Allowance check
  const fromData = tokens[fromSnap];
  const isDirectStake = false;
  const isRagequit = false;
  const isDirectPath = false;
  const isLidoStake = false;
  const hideSlippage = isDirectPath || isLidoStake;

  // Hide slippage & refresh for 1:1 / Lido / Rocket Pool / ragequit operations
  setShown("slippageRow", !hideSlippage);
  setShown("impactRow", !isLidoStake && !isRagequit);
  setShown("refreshRow", !isDirectPath);
  setShown(quoteInfoEl, true);
  if (isDirectPath) stopQuoteRefresh();
  else startQuoteRefresh();
  const isZOrgSell = false;
  const isZammSell = false;
  let btnLabel = isRagequit
    ? "Ragequit"
    : isDirectStake
      ? "Stake"
      : isLidoStake
        ? "Stake"
        : "Swap";
  if (fromData.address !== ZERO_ADDRESS) {
    const amountIn = safeParseUnits(amtStr, fromData.decimals);
    let allowance = cacheGetAllowance(
      fromData.address,
      connectedAddress,
      ZROUTER_ADDRESS,
    );
    if (allowance == null) {
      const r = erc20Read(fromData.address);
      allowance = await r.allowance(connectedAddress, ZROUTER_ADDRESS);
      cacheSetAllowance(
        fromData.address,
        connectedAddress,
        ZROUTER_ADDRESS,
        allowance,
      );
    }
    if (allowance < amountIn) {
      const [permitCfg, p2Allowance] = await Promise.all([
        getPermitConfig(fromData.address),
        checkPermit2Allowance(fromData.address),
      ]);
      btnLabel =
        permitCfg || p2Allowance >= amountIn
          ? btnLabel
          : "Approve & " + btnLabel;
    }
  }

  setText(swapBtn, btnLabel);
  setDisabled(swapBtn, false);
  /*} catch (e) {
                console.error("Quote error:", e);
                toAmountEl.value = "";
                toAmountEl.placeholder = "0.0";
                setShown(quoteInfoEl, false);
                stopQuoteRefresh();
                const msg = /Too many decimals|Invalid number|Empty amount/i.test(
                  String(e?.message || ""),
                )
                  ? e.message
                  : "Quote failed";
                setText(swapBtn, msg);
                setDisabled(swapBtn, true);
                setTimeout(() => {
                  if (seq === _quoteSeq) {
                    setText(swapBtn, "Enter an amount");
                    setDisabled(swapBtn, true);
                  }
                }, 1500);
              }*/
}

async function setPercentBalance(pct) {
  try {
    if (!provider || !connectedAddress) {
      toggleWallet();
      return;
    }

    const f = tokens[fromToken];
    let raw = getCachedBalance(f.address);

    if (raw == null) {
      if (f.address === ZERO_ADDRESS) {
        raw = await provider.getBalance(connectedAddress);
      } else {
        const c = new ethers.Contract(
          f.address,
          ["function balanceOf(address) view returns (uint256)"],
          provider,
        );
        raw = await c.balanceOf(connectedAddress);
      }
      setCachedBalance(f.address, raw);
    }

    // Apply percentage
    raw = (raw * BigInt(pct)) / 100n;

    // Reserve 5% for gas when sending ETH at 100%
    if (f.address === ZERO_ADDRESS && pct === 100) raw = (raw * 95n) / 100n;

    const valStr = ethers.formatUnits(raw, f.decimals);
    const pretty = valStr.includes(".") ? valStr.replace(/\.?0+$/, "") : valStr;

    const input = $("fromAmount");
    input.value = pretty || "0";
    handleAmountChange();
  } catch (e) {
    console.error("Percent balance error:", e);
  }
}

// ---- Slippage ----
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function readSlippage(finalize = false) {
  const el = $("slippagePct");
  if (!el) return;
  const raw = el.value;
  let v = parseFloat(raw);
  if (Number.isFinite(v)) {
    v = clamp(v, 0, 20);
    slippageBps = Math.round(v * 100);
    if (finalize) {
      const stepDigits = (String(el.step || "0.1").split(".")[1] || "").length;
      el.value = v.toFixed(stepDigits);
    }
  } else if (finalize) {
    const stepDigits = (String(el.step || "0.1").split(".")[1] || "").length;
    el.value = clamp(slippageBps / 100, 0, 20).toFixed(stepDigits);
  }
  return slippageBps;
}

function initSimpleSlippage() {
  const el = $("slippagePct");
  if (!el || el.dataset.inited === "1") return;
  el.dataset.inited = "1";
  readSlippage(false);

  const reQuote = debounce(() => {
    const amt = $("fromAmount")?.value;
    if (amt) handleAmountChange();
  }, 250);

  el.addEventListener("input", () => {
    readSlippage(false);
    reQuote();
  });
  el.addEventListener("blur", () => {
    readSlippage(true);
    reQuote();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = parseFloat(el.step || "0.01") || 0.01;
    const digits = (String(step).split(".")[1] || "").length;
    const cur = parseFloat(el.value || "0") || 0;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    const next = clamp(cur + dir * step, 0, 20);
    el.value = next.toFixed(digits);
    readSlippage(true);
    reQuote();
  });
}
document.addEventListener("DOMContentLoaded", initSimpleSlippage);

// ---- Probability slider ----
function readProbability(rawVal, finalize = false) {
  const sliderEl = $("slider");
  const numEl = $("sliderValue");
  if (rawVal === undefined) rawVal = sliderEl?.value ?? 50;
  const parsed = parseInt(rawVal, 10);
  const v = clamp(isNaN(parsed) ? 50 : parsed, 5, 95);
  probabilityBps = v * 100;
  if (sliderEl) sliderEl.value = v;
  if (finalize && numEl) numEl.value = v;
  return probabilityBps;
}

function initSlider() {
  const sliderEl = $("slider");
  const numEl = $("sliderValue");
  if (!sliderEl || sliderEl.dataset.inited === "1") return;
  sliderEl.dataset.inited = "1";
  readProbability(undefined, true);

  const reQuote = debounce(() => {
    const amt = $("fromAmount")?.value;
    if (amt) handleAmountChange();
  }, 250);

  // Slider is always a valid clamped integer — finalize immediately to sync num input
  sliderEl.addEventListener("input", () => {
    readProbability(sliderEl.value, true);
    reQuote();
  });

  if (numEl) {
    // During typing: update slider for visual feedback but don't overwrite the input
    numEl.addEventListener("input", () => {
      readProbability(numEl.value, false);
      reQuote();
    });
    // On blur: clamp and write the final value back to the input
    numEl.addEventListener("blur", () => readProbability(numEl.value, true));
    // Arrow keys: discrete step, finalize immediately
    numEl.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const cur = parseInt(numEl.value || "50", 10) || 50;
      const dir = e.key === "ArrowUp" ? 1 : -1;
      readProbability(cur + dir, true);
      reQuote();
    });
  }
}
document.addEventListener("DOMContentLoaded", initSlider);

// ---- Receiver name resolution ----
let _resolvedReceiver = null; // { input, address } or null
let _receiverResolveSeq = 0;

function getReceiver() {
  if (!connectedAddress) return null;
  const v = ($("receiverAddress")?.value || "").trim();
  if (!v) return connectedAddress;
  if (ethers.isAddress(v) && v !== ZERO_ADDRESS) return ethers.getAddress(v);
  if (
    _resolvedReceiver &&
    _resolvedReceiver.input === v &&
    _resolvedReceiver.address
  )
    return _resolvedReceiver.address;
  return connectedAddress;
}

function isReceiverPending() {
  const v = ($("receiverAddress")?.value || "").trim();
  if (!v || ethers.isAddress(v)) return false;
  return (
    !_resolvedReceiver ||
    _resolvedReceiver.input !== v ||
    !_resolvedReceiver.address
  );
}

let _receiverDebounce = null;
function onReceiverInput() {
  clearTimeout(_receiverDebounce);
  const v = ($("receiverAddress")?.value || "").trim();
  const el = $("receiverResolved");

  // Clear state
  _resolvedReceiver = null;

  // Direct 0x address
  if (!v) {
    el.style.display = "none";
    return;
  }
  if (ethers.isAddress(v)) {
    el.style.display = "block";
    el.style.color = "var(--fg-muted)";
    el.textContent = ethers.getAddress(v);
    _resolvedReceiver = { input: v, address: ethers.getAddress(v) };
    return;
  }

  // Name resolution (.wei or .eth)
  if (v.endsWith(".wei") || v.endsWith(".eth")) {
    el.style.display = "block";
    el.style.color = "var(--fg-muted)";
    el.textContent = "Resolving " + v + "...";
    _receiverDebounce = setTimeout(() => resolveReceiverName(v), 350);
  } else {
    el.style.display = "block";
    el.style.color = "#c0392b";
    el.textContent = "Enter 0x address, name.wei, or name.eth";
  }
}

async function resolveReceiverName(name) {
  const seq = ++_receiverResolveSeq;
  const el = $("receiverResolved");
  try {
    let resolved = null;
    if (name.endsWith(".eth")) {
      resolved = await quoteRPC.call(async (rpc) => {
        return await rpc.resolveName(name);
      });
    }
    if (seq !== _receiverResolveSeq) return;
    if (resolved && resolved !== ZERO_ADDRESS) {
      _resolvedReceiver = { input: name, address: resolved };
      el.style.color = "var(--fg-muted)";
      el.textContent = resolved;
    } else {
      _resolvedReceiver = null;
      el.style.color = "#c0392b";
      el.textContent = "Name not found";
    }
  } catch (e) {
    if (seq !== _receiverResolveSeq) return;
    _resolvedReceiver = null;
    el.style.color = "#c0392b";
    el.textContent = "Failed to resolve " + name;
  }
}

// Wire up receiver input listener after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const ri = $("receiverAddress");
  if (ri) ri.addEventListener("input", onReceiverInput);
});

// Cache contract instances per provider to avoid repeated construction
const _contractCache = new WeakMap();
function _getCached(rpc, addr, abi) {
  let m = _contractCache.get(rpc);
  if (!m) {
    m = new Map();
    _contractCache.set(rpc, m);
  }
  let c = m.get(addr);
  if (!c) {
    c = new ethers.Contract(addr, abi, rpc);
    m.set(addr, c);
  }
  return c;
}
function getQuoterContract(rpc) {
  return _getCached(rpc, ZQUOTER_ADDRESS, QUOTER_IFACE);
}
function getStateViewContract(rpc) {
  return _getCached(rpc, V4_STATE_VIEW_ADDRESS, V4_STATE_VIEW_IFACE);
}
function getMaybeHookContract(rpc) {
  return _getCached(rpc, MAYBE_HOOK_ADDRESS, MAYBE_HOOK_IFACE);
}
function getVRFV2PlusWrapperContract(rpc) {
  return _getCached(
    rpc,
    VRF_V2_PLUS_WRAPPER_ADDRESS,
    VRF_V2_PLUS_WRAPPER_IFACE,
  );
}
function getQuoterBaseContract(rpc) {
  return _getCached(rpc, ZQUOTERBASE_ADDRESS, QUOTERBASE_IFACE);
}
function getWeinsContract(rpc) {
  return _getCached(rpc, WEINS_ADDRESS, WEINS_ABI);
}

// ---- zAMM reverse quote: ZAMM → ETH (client-side AMM math) ----
function getZammAmountOut(amtIn, resIn, resOut, feeBps) {
  if (amtIn === 0n || resIn === 0n || resOut === 0n) return 0n;
  const amtFee = amtIn * (10000n - feeBps);
  return (amtFee * resOut) / (resIn * 10000n + amtFee);
}

function computeZammPoolKey() {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "address", "address", "uint256"],
    [0, ZORG_ID, ZERO_ADDRESS, ZORG_TOKEN, 100],
  );
}

async function getZammPoolReserves(rpc) {
  const poolId = BigInt(ethers.keccak256(computeZammPoolKey()));
  const zammHooked = new ethers.Contract(ZAMM_HOOKED, ZAMM_POOLS_ABI, rpc);
  const zammHookless = new ethers.Contract(ZAMM_HOOKLESS, ZAMM_POOLS_ABI, rpc);
  const callOpts = { blockTag: "latest" };
  const [hookedRes, hooklessRes] = await Promise.all([
    zammHooked.pools(poolId, callOpts).catch(() => [0n, 0n]),
    zammHookless.pools(poolId, callOpts).catch(() => [0n, 0n]),
  ]);
  return {
    hooked: {
      reserve0: BigInt(hookedRes[0]),
      reserve1: BigInt(hookedRes[1]),
    },
    hookless: {
      reserve0: BigInt(hooklessRes[0]),
      reserve1: BigInt(hooklessRes[1]),
    },
  };
}

// ZAMM → ETH: sell ERC6909 ZORG for ETH (zeroForOne=false, reserveIn=reserve1, reserveOut=reserve0)
function getZammToEthQuote(amountIn, reserves) {
  const hookedOut = getZammAmountOut(
    amountIn,
    reserves.hooked.reserve1,
    reserves.hooked.reserve0,
    100n,
  );
  const hooklessOut = getZammAmountOut(
    amountIn,
    reserves.hookless.reserve1,
    reserves.hookless.reserve0,
    100n,
  );
  const useHookless = hooklessOut >= hookedOut;
  return { ethOut: useHookless ? hooklessOut : hookedOut, useHookless };
}

// ---- ETH ↔ WETH wrap/unwrap detection ----
const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 wad)",
];

function isWrapUnwrap(fromSym, toSym) {
  const from = tokens[fromSym],
    to = tokens[toSym];
  if (!from || !to) return null;
  const fa = from.address.toLowerCase(),
    ta = to.address.toLowerCase();
  const weth = WETH_ADDRESS.toLowerCase();
  if (fa === ZERO_ADDRESS && ta === weth) return "wrap";
  if (fa === weth && ta === ZERO_ADDRESS) return "unwrap";
  return null;
}

function getSqrtPriceAtTick(tick) {
  return new Decimal(1.0001)
    .pow(tick)
    .sqrt()
    .mul(new Decimal(2).pow(96))
    .toFixed(0);
}

function getSqrtPriceLimit(zeroForOne, slippageInBps, currentTick) {
  const tickDelta = BigInt(zeroForOne ? -slippageInBps : slippageInBps);
  const limitTick = currentTick + tickDelta;
  return BigInt(getSqrtPriceAtTick(limitTick.toString()));
}

async function getQuote(fromAmountStr, fromSym, toSym) {
  if (!connectedAddress) throw new Error("Connect wallet to get a quote");
  const fromData = tokens[fromSym],
    toData = tokens[toSym];
  if (!fromData || !toData) throw new Error("Unknown token");
  if (fromData.address === toData.address) throw new Error("Same token");

  // const receiver = getReceiver();
  const receiver = getReceiver(); // @NOTE: Since this is is meant to swap token X to ETH and this ETH should be recevied by the roouter to be used, the receiver should be maybe router
  const amountIn = safeParseUnits(fromAmountStr, fromData.decimals);
  readSlippage(true);
  const deadline = BigInt(Math.trunc(Date.now() / 1000) + 300);

  return await quoteRPC.call(async (rpc) => {
    const quoter = getQuoterContract(rpc);
    const callOpts = { blockTag: "latest" };
    const maybifyingProbabilityInBps = BigInt(readProbability());
    const swapBackOnlyToEth =
      toData.address === tokens.ETH.address ? true : false;

    // Fire all calls in parallel (V4 hooked only for PNKSTR swaps)
    const isPNKSTR = false;
    // Split/multi-hop routes need wider per-leg slippage to avoid intermittent reverts
    // (each leg has its own amountLimit; first leg moves price affecting the second)STETH_ADDRESS
    const splitSlip = BigInt(Math.min(Math.max(slippageBps * 3, 150), 500));
    const hookFee = 0;
    const hookTick = isPNKSTR ? 60 : 0;
    const hookAddr = isPNKSTR ? PNKSTR_HOOK_ADDRESS : ZERO_ADDRESS;
    const midToken = "ETH";
    const midData = tokens[midToken];
    console.log("receiver inside getQuote: ", receiver);
    const stateViewer = getStateViewContract(rpc);
    const maybeHook = getMaybeHookContract(rpc);
    const vrfV2PlusWrapper = getVRFV2PlusWrapperContract(rpc);
    const quoterBase = getQuoterBaseContract(rpc);

    // @TODO: We gotta manually handle fromData is either for ETH or MAYBE as they are not just token X. We gotta manually handle them
    // First of all, if its ETH, we can just skip the initial quoting and assume that multicall value is just 0x and msg.value is
    const omitSwapAmountForBuildingCalldata = true;
    const allCalls = [
      stateViewer.getSlot0(ETH_MAYBE_HOOKED_POOL_ID),
      provider.getFeeData(),
      vrfV2PlusWrapper.estimateRequestPriceNative(
        DEFAULT_VRF_CALLBACK_GAS_LIMIT,
        1n,
        DEFAULT_GAS_PRICE, // we currently do not know the gas price, yet to estimate the vrf's eth fee we need that. So, we would first fetch the gas price then fetch it again. Yet, since gas price has linear effect on the fee, what we can do is, get the vrf fee using some gas price and then we can update the estimated fee with fetched gas price. This allows us to do the estimation with a single rpc call time rather than consequent two requests
      ),
    ];
    // if input token is not ETH, we should quote to get ETH for it
    if (fromData.address !== tokens.ETH.address) {
      allCalls.push(
        ...[
          quoter.buildBestSwapViaETHMulticall(
            MAYBE_ROUTER_ADDRESS,
            connectedAddress,
            false,
            fromData.address,
            midData.address,
            // toData.address,
            amountIn,
            BigInt(slippageBps),
            deadline,
            hookFee,
            hookTick,
            hookAddr,
            !omitSwapAmountForBuildingCalldata,
            callOpts,
          ),
          quoter.buildSplitSwap(
            MAYBE_ROUTER_ADDRESS,
            fromData.address,
            midData.address,
            // toData.address,
            amountIn,
            splitSlip,
            deadline,
            !omitSwapAmountForBuildingCalldata,
            callOpts,
          ),
          quoter.getQuotes(
            false,
            fromData.address,
            midData.address,
            // toData.address,
            amountIn,
            callOpts,
          ),
          quoter.build3HopMulticall(
            MAYBE_ROUTER_ADDRESS,
            fromData.address,
            midData.address,
            // toData.address,
            amountIn,
            splitSlip,
            deadline,
            !omitSwapAmountForBuildingCalldata,
            callOpts,
          ),
          quoter.buildHybridSplit(
            MAYBE_ROUTER_ADDRESS,
            fromData.address,
            midData.address,
            // toData.address,
            amountIn,
            splitSlip,
            deadline,
            !omitSwapAmountForBuildingCalldata,
            callOpts,
          ),
        ],
      );
    }
    // @NOTE: Maybe Swap does not swap from token X to token Y directly. We gotta get quotes for swapping from token X to ETH and then MaybeRouter will be handling the swapping to MAYBE part for the first tx
    // @TODO: Try using multicall3 to have a single rpc call
    const settled = await Promise.allSettled(allCalls);
    const [
      slot0Result,
      feeDataResult,
      estimatedVrfFeeResult,
      bestResult,
      splitResult,
      quotesResult,
      threeHopResult,
      hybridSplitResult,
    ] = settled;
    console.log("calls");
    console.log(allCalls);
    console.log("settled calls");
    console.log(settled);
    console.log("slot0: ");
    console.log(slot0Result.value);
    console.log(slot0Result.value[0]);
    console.log(slot0Result.value[1]);
    const protocolFeeInBps = DEFAULT_PROTOCOL_FEE_IN_BPS;
    const {
      gasPrice: baseGasPrice, // ethersjs adds 20% buffer on top of current base fee, yet we want to add only 10% base fee so we are doing multiplications for that
      maxFeePerGas,
      maxPriorityFeePerGas, // ethersjs automatically add 1 gwei to max priority fee, so we gotta subtract 1 gwei to find a logical value for base
    } = feeDataResult.value;
    const adjustedFeeData = {
      baseGasPrice: (((baseGasPrice * 10n) / 12n) * 11n) / 10n,
      maxFeePerGas:
        (((baseGasPrice * 10n) / 12n) * 11n) / 10n +
        maxPriorityFeePerGas -
        ONE_GWEI, // Its basically base + maxPriority
      maxPriorityFeePerGas: maxPriorityFeePerGas - ONE_GWEI,
    };
    // set app wide maxGasPrice to be able to send txs with these gas configurations so that VRF fee uses that gas price for sure and not what metamask or some other wallet sets the fee for
    appWideMaxGasPrice = adjustedFeeData.maxFeePerGas;
    console.log("adjusted fee data: ", adjustedFeeData);
    console.log("max gas price: ", adjustedFeeData.maxFeePerGas);
    const estimatedVrfFee = estimatedVrfFeeResult.value;
    console.log("estimated vrf fee: ", estimatedVrfFee);
    console.log(
      "NOTE: estimated the vrf fee with gas price being: ",
      DEFAULT_GAS_PRICE,
    );
    const adjustedVrfFeeEstimate =
      (estimatedVrfFee / DEFAULT_GAS_PRICE) * appWideMaxGasPrice;
    console.log(
      "adjusted vrf fee estimate for max gas price is: ",
      adjustedVrfFeeEstimate,
    );
    // slot0 is required // @TODO: Maybe not? how about we use min and max ticks?
    if (slot0Result.status === "rejected") throw slot0Result.reason;
    const currentTick = slot0Result.value[1];
    console.log("current tick: ", currentTick);
    // Work on calculating sqrt price limit for swapping from ETH to MAYBE
    let sqrtPriceLimitForSlippageForSwappingFromEthToMaybe =
      MIN_SQRT_PRICE_LIMIT_PLUS_ONE;
    const zeroForOneForSwappingFromEthToMaybe = true;
    sqrtPriceLimitForSlippageForSwappingFromEthToMaybe = getSqrtPriceLimit(
      zeroForOneForSwappingFromEthToMaybe,
      slippageBps,
      currentTick,
    );
    // Work on calculating sqrt price limit for swapping from MAYBE to ETH
    let sqrtPriceLimitForSlippageForSwappingFromMaybeToEth =
      MAX_SQRT_PRICE_LIMIT_MINUS_ONE;
    const zeroForOneForSwappingFromMaybeToEth =
      !zeroForOneForSwappingFromEthToMaybe;
    sqrtPriceLimitForSlippageForSwappingFromMaybeToEth = getSqrtPriceLimit(
      zeroForOneForSwappingFromMaybeToEth,
      slippageBps,
      currentTick,
    );
    console.log("calculated sqrt price limits");
    let result = {
      expectedOutput: amountIn,
      multicall: "0x",
      calls: [],
      msgValue: 0n,
      isTwoHop: false,
      isSplit: false,
      splitLegs: null,
      sourceA: "Unknown",
      sourceB: null,
      allQuotes: null,
    };

    console.log("fromData.address: ", fromData.address);
    console.log("tokens.ETH.address: ", tokens.ETH.address);
    if (fromData.address !== tokens.ETH.address) {
      console.log("trying to pick the best result");
      // bestResult is required
      if (bestResult.status === "rejected") throw bestResult.reason;
      const r = bestResult.value;

      const isTwoHop = r.b.amountOut > 0n;
      const bestOutput = isTwoHop ? r.b.amountOut : r.a.amountOut;

      result = {
        expectedOutput: bestOutput,
        multicall: r.multicall,
        calls: r.calls,
        msgValue: r.msgValue ?? 0n,
        isTwoHop,
        isSplit: false,
        splitLegs: null,
        sourceA: AMM_NAMES[r.a.source] || "Unknown",
        sourceB: isTwoHop ? AMM_NAMES[r.b.source] || "Unknown" : null,
        allQuotes: null,
      };

      // Check if split beats best
      if (splitResult.status === "fulfilled") {
        const s = splitResult.value;
        const splitTotal = s.legs[0].amountOut + s.legs[1].amountOut;
        if (
          splitTotal > bestOutput &&
          s.legs[0].amountOut > 0n &&
          s.legs[1].amountOut > 0n
        ) {
          result.expectedOutput = splitTotal;
          result.multicall = s.multicall;
          result.msgValue = s.msgValue ?? 0n;
          result.isSplit = true;
          result.isTwoHop = false;
          result.splitLegs = [
            {
              source: AMM_NAMES[s.legs[0].source] || "Unknown",
              amountIn: s.legs[0].amountIn,
              amountOut: s.legs[0].amountOut,
              feeBps: s.legs[0].feeBps,
            },
            {
              source: AMM_NAMES[s.legs[1].source] || "Unknown",
              amountIn: s.legs[1].amountIn,
              amountOut: s.legs[1].amountOut,
              feeBps: s.legs[1].feeBps,
            },
          ];
          // calls not returned by buildSplitSwap; multicall is directly usable
          result.calls = null;
        }
      }

      // Attach all-quotes for display
      if (quotesResult.status === "fulfilled") {
        const q = quotesResult.value;
        result.allQuotes = q.quotes
          .map((qt) => ({
            source: AMM_NAMES[qt.source] || `AMM #${qt.source}`,
            sourceId: Number(qt.source),
            feeBps: qt.feeBps,
            amountIn: qt.amountIn,
            amountOut: qt.amountOut,
          }))
          .filter((qt) => qt.amountOut > 0n);
      }

      // Check if 3-hop beats current best
      if (threeHopResult?.status === "fulfilled" && threeHopResult.value) {
        const h3 = threeHopResult.value;
        const h3Output = h3.c.amountOut;
        if (h3Output > result.expectedOutput && h3Output > 0n) {
          result.expectedOutput = h3Output;
          result.multicall = h3.multicall;
          result.calls = h3.calls;
          result.msgValue = h3.msgValue ?? 0n;
          result.isTwoHop = true;
          result.isSplit = false;
          result.splitLegs = null;
          result.sourceA = `${AMM_NAMES[h3.a.source] || "?"} → ${AMM_NAMES[h3.b.source] || "?"}`;
          result.sourceB = AMM_NAMES[h3.c.source] || "?";
        }
      }

      // Check if hybrid split (single-hop + 2-hop) beats current best
      if (
        hybridSplitResult?.status === "fulfilled" &&
        hybridSplitResult.value
      ) {
        const hs = hybridSplitResult.value;
        const hsTotal = hs.legs[0].amountOut + hs.legs[1].amountOut;
        const isTrueSplit =
          hs.legs[0].amountOut > 0n && hs.legs[1].amountOut > 0n;
        if (hsTotal > result.expectedOutput && hsTotal > 0n) {
          result.expectedOutput = hsTotal;
          result.multicall = hs.multicall;
          result.msgValue = hs.msgValue ?? 0n;
          result.calls = null;
          if (isTrueSplit) {
            result.isSplit = true;
            result.isTwoHop = false;
            result.splitLegs = [
              {
                source: AMM_NAMES[hs.legs[0].source] || "Unknown",
                amountIn: hs.legs[0].amountIn,
                amountOut: hs.legs[0].amountOut,
                feeBps: hs.legs[0].feeBps,
              },
              {
                source:
                  (AMM_NAMES[hs.legs[1].source] || "Unknown") + " (via hub)",
                amountIn: hs.legs[1].amountIn,
                amountOut: hs.legs[1].amountOut,
                feeBps: hs.legs[1].feeBps,
              },
            ];
            result.sourceA = AMM_NAMES[hs.legs[0].source] || "Unknown";
            result.sourceB = null;
          } else {
            // Single strategy won (100% direct or 100% 2-hop)
            const activeLeg =
              hs.legs[0].amountOut > 0n ? hs.legs[0] : hs.legs[1];
            result.isSplit = false;
            result.isTwoHop = hs.legs[1].amountOut > 0n;
            result.sourceA = AMM_NAMES[activeLeg.source] || "Unknown";
            result.sourceB = null;
            result.splitLegs = null;
          }
        }
      }
    }
    console.log("found the best first swap");

    const expectedEthTokenOutput = result.expectedOutput;
    console.log("expected eth token output: ", expectedEthTokenOutput);
    const minEthTokenOutputAfterSlippage =
      fromData.address === tokens.ETH.address
        ? expectedEthTokenOutput
        : (expectedEthTokenOutput * (10000n - BigInt(slippageBps))) / 10000n;
    console.log(
      "min eth token output because of slippage: ",
      minEthTokenOutputAfterSlippage,
    );
    const expectedVrfFeeInEth = adjustedVrfFeeEstimate;
    console.log("expected vrf fee in eth: ", expectedVrfFeeInEth);
    // const minEthAmountAfterVrfFee =
    //   minEthTokenOutputAfterSlippage - expectedVrfFeeInEth;
    const minEthAmountAfterVrfFee =
      expectedEthTokenOutput - expectedVrfFeeInEth;
    console.log(
      "expected min eth token output because of slippage and vrf fee: ",
      minEthAmountAfterVrfFee,
    );
    if (minEthAmountAfterVrfFee < 0n) {
      throw Error("Swap is not even worth to pay for VRF fee");
    }
    // @TODO: We could add extra errors like if this VRF fee amount is more than 1% of the swap maybe user should know? Well at least not for now
    // @TODO: Using MaybeZQuoterBase use quoteV4 and swap minEthAmountAfterVrfFee amount of ETH for MAYBE
    const ethToMaybeV4Quote = await quoterBase.quoteV4(
      false,
      tokens.ETH.address,
      tokens.MAYBE.address,
      ETH_MAYBE_POOL_FEE,
      ETH_MAYBE_TICK_SPACING,
      MAYBE_HOOK_ADDRESS,
      minEthAmountAfterVrfFee,
    );
    console.log("ethToMaybeV4Quote: ", ethToMaybeV4Quote);
    const [spentEth, expectedMaybeAmountOut] = ethToMaybeV4Quote;
    console.log("spent eth for maybe swap: ", spentEth);
    console.log(
      "expected received maybe from eth swap: ",
      expectedMaybeAmountOut,
    );
    const minMaybeAmountOut = expectedMaybeAmountOut;
    // const minMaybeAmountOut =
    //   (expectedMaybeAmountOut * (10000n - BigInt(slippageBps))) / 10000n;
    console.log("expected min maybe from eth swap: ", minMaybeAmountOut);
    const payoutMultiplierInWad =
      ((MAX_PROBABILITY_IN_BPS - protocolFeeInBps) * WAD) /
      maybifyingProbabilityInBps;
    console.log("maybifiying payout multiplier: ", payoutMultiplierInWad);
    const minMaybePayoutAmount =
      (payoutMultiplierInWad * minMaybeAmountOut) / WAD;
    console.log("expected min maybe given user wins: ", minMaybePayoutAmount);
    // @TODO: Using MaybeZQuoterBase use quoteV4 and swap minMaybePayoutAmount amount of MAYBE for ETH
    const maybeToEthV4Quote = await quoterBase.quoteV4(
      false,
      tokens.MAYBE.address,
      tokens.ETH.address,
      ETH_MAYBE_POOL_FEE,
      ETH_MAYBE_TICK_SPACING,
      MAYBE_HOOK_ADDRESS,
      minMaybePayoutAmount,
    );
    console.log("maybeToEthV4Quote: ", maybeToEthV4Quote);
    const [spentMaybe, ethAmountOut] = maybeToEthV4Quote;
    console.log("ethAmountOut: ", ethAmountOut);
    // const minEthAmountOut =
    //   (ethAmountOut * (10000n - BigInt(slippageBps))) / 10000n;
    const minEthAmountOut = ethAmountOut;
    console.log("minEthAmountOut: ", minEthAmountOut);

    // if output token is ETH, set the expected output value to be the expected ETH output after calculating the newly minted MAYBE and swapping it to ETH
    let expectedOutput = minEthAmountOut; // This is the ETH output value as we are building the call to get the ETH
    if (toData.address === tokens.MAYBE.address) {
      // if output token is MAYBE, set the expected output value to be the newly minted MAYBE amount
      expectedOutput = minMaybePayoutAmount;
    }
    // if its neither, there will be extra calls for swapping back and it will set the expectedOutput based on it's result

    // Check if user's wanted toToken is MAYBE, ETH or something else. If its something else, we will do swapBackCalls
    // If user's toToken is MAYBE, swapBackOnlyToEth should be set to false and swap back params should be set to "0x"
    // If user's toToken is ETH, swapBackOnlyToEth should be set to true and swap back params should be set to "0x"
    let swapBackParams = "0x";
    if (
      !(
        toData.address === tokens.ETH.address ||
        toData.address === tokens.MAYBE.address
      )
    ) {
      // GET ANOTHER QUOTE AND BUILD THE SWAP BACK PARAM for swapping minEthAmountOut ETH for token Y (toData)
      const swapBackCalls = [
        quoter.buildBestSwapViaETHMulticall(
          receiver,
          connectedAddress,
          false,
          // fromData.address,
          midData.address,
          toData.address,
          minEthAmountOut,
          // BigInt(slippageBps),
          9999n,
          deadline,
          hookFee,
          hookTick,
          hookAddr,
          omitSwapAmountForBuildingCalldata,
          callOpts,
        ),
        // @NOTE: We cant support split swap as, since we are encoding both swapAmounts to be 0, its consuming all the input token in the first swap and seconds swap causes a problem because all of it got consumed by the other one
        // quoter.buildSplitSwap(
        //   receiver,
        //   // fromData.address,
        //   midData.address,
        //   toData.address,
        //   minEthAmountOut,
        //   splitSlip,
        //   deadline,
        //   omitSwapAmountForBuildingCalldata,
        //   callOpts,
        // ),
        quoter.getQuotes(
          false,
          // fromData.address,
          midData.address,
          toData.address,
          minEthAmountOut,
          callOpts,
        ),
        quoter.build3HopMulticall(
          receiver,
          // fromData.address,
          midData.address,
          toData.address,
          minEthAmountOut,
          // splitSlip,
          9999n,
          deadline,
          omitSwapAmountForBuildingCalldata,
          callOpts,
        ),
        // @NOTE: We cant support split swap as, since we are encoding both swapAmounts to be 0, its consuming all the input token in the first swap and seconds swap causes a problem because all of it got consumed by the other one
        // quoter.buildHybridSplit(
        //   receiver,
        //   // fromData.address,
        //   midData.address,
        //   toData.address,
        //   minEthAmountOut,
        //   splitSlip,
        //   deadline,
        //   omitSwapAmountForBuildingCalldata,
        //   callOpts,
        // ),
      ];
      const swapBackSettled = await Promise.allSettled(swapBackCalls);
      const [swapBackBestResult, swapBackQuotesResult, swapBackThreeHopResult] =
        swapBackSettled;
      let swapBackResult = {};
      // swapBackBestResult is required
      {
        if (swapBackBestResult.status === "rejected") throw bestResult.reason;
        const r = swapBackBestResult.value;

        const isTwoHop = r.b.amountOut > 0n;
        const bestOutput = isTwoHop ? r.b.amountOut : r.a.amountOut;

        swapBackResult = {
          expectedOutput: bestOutput,
          multicall: r.multicall,
          calls: r.calls,
          msgValue: r.msgValue ?? 0n,
          isTwoHop,
          isSplit: false,
          splitLegs: null,
          sourceA: AMM_NAMES[r.a.source] || "Unknown",
          sourceB: isTwoHop ? AMM_NAMES[r.b.source] || "Unknown" : null,
          allQuotes: null,
        };

        // Attach all-quotes for display
        if (swapBackQuotesResult.status === "fulfilled") {
          const q = swapBackQuotesResult.value;
          swapBackResult.allQuotes = q.quotes
            .map((qt) => ({
              source: AMM_NAMES[qt.source] || `AMM #${qt.source}`,
              sourceId: Number(qt.source),
              feeBps: qt.feeBps,
              amountIn: qt.amountIn,
              amountOut: qt.amountOut,
            }))
            .filter((qt) => qt.amountOut > 0n);
        }

        // Check if 3-hop beats current best
        if (
          swapBackThreeHopResult?.status === "fulfilled" &&
          swapBackThreeHopResult.value
        ) {
          const h3 = swapBackThreeHopResult.value;
          const h3Output = h3.c.amountOut;
          if (h3Output > swapBackResult.expectedOutput && h3Output > 0n) {
            swapBackResult.expectedOutput = h3Output;
            swapBackResult.multicall = h3.multicall;
            swapBackResult.calls = h3.calls;
            swapBackResult.msgValue = h3.msgValue ?? 0n;
            swapBackResult.isTwoHop = true;
            swapBackResult.isSplit = false;
            swapBackResult.splitLegs = null;
            swapBackResult.sourceA = `${AMM_NAMES[h3.a.source] || "?"} → ${AMM_NAMES[h3.b.source] || "?"}`;
            swapBackResult.sourceB = AMM_NAMES[h3.c.source] || "?";
          }
        }
      }
      console.log("swapBackResult: ", swapBackResult);
      swapBackParams = swapBackResult.multicall;
      expectedOutput = swapBackResult.expectedOutput;
    }

    //  Build MaybeRouter call and just send these multicall for the first quote bytes as `multicall` param for `maybeSwap` func
    console.log("fromData.address: ", fromData.address);
    console.log("amountIn: ", amountIn);
    console.log("result.msgValue: ", result.msgValue);
    console.log("result.multicall: ", result.multicall);
    const maybeRouterCall = MAYBE_ROUTER_IFACE.encodeFunctionData("maybeSwap", [
      fromData.address,
      amountIn,
      result.multicall,
      // sqrtPriceLimitForSlippageForSwappingFromEthToMaybe, // @TODO: Problem is, if we hit the price limit before consuming all the ETH, there will be unspent ETH
      MIN_SQRT_PRICE_LIMIT_PLUS_ONE,
      maybifyingProbabilityInBps, // @TODO: Work on the slider input for maybifying probability
      swapBackOnlyToEth, // (swapBackOnlyToEth) should be set to true only if output token is ETH
      // sqrtPriceLimitForSlippageForSwappingFromMaybeToEth, // @TODO: Problem is, if we hit the price limit before consuming all the ETH, there will be unspent ETH
      MAX_SQRT_PRICE_LIMIT_MINUS_ONE,
      swapBackParams,
      toData.address,
      // "0x", // (swapBackParams) should be set to zero bytes (0x) only if output token is MAYBE and in that case swapBackOnlyToEth should be false as well
    ]);
    console.log("MaybeRouter encoded call data: ", maybeRouterCall);
    result.multicall = maybeRouterCall;
    result.expectedOutput = expectedOutput;

    return result;
  });
}

// ---- Split route formatting ----
function formatSplitRoute(legs) {
  if (!legs || legs.length < 2) return "Split";
  const total = legs[0].amountIn + legs[1].amountIn;
  if (total === 0n) return `${legs[0].source} + ${legs[1].source}`;
  const pct0 = Number((legs[0].amountIn * 100n) / total);
  const pct1 = 100 - pct0;
  return `${pct0}% ${legs[0].source} + ${pct1}% ${legs[1].source}`;
}

// ---- All-routes toggle ----
function toggleAllRoutes() {
  const list = $("allRoutesList");
  const chev = $("routesChevron");
  const open = list.style.display !== "none";
  list.style.display = open ? "none" : "block";
  chev.innerHTML = open ? "&#9654;" : "&#9660;";
}

function displayAllRoutes(quote, toSym) {
  const wrap = $("allRoutesWrap");
  const list = $("allRoutesList");
  if (!quote.allQuotes || quote.allQuotes.length === 0) {
    setShown(wrap, false);
    return;
  }
  const toData = tokens[toSym];
  const sorted = [...quote.allQuotes].sort((a, b) =>
    b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0,
  );
  const bestAmt = sorted[0].amountOut;
  list.innerHTML = sorted
    .map((q) => {
      const out = fmt(ethers.formatUnits(q.amountOut, toData.decimals));
      const badge =
        q.amountOut === bestAmt ? '<span class="best-badge">best</span>' : "";
      const fee = Number(q.feeBps);
      const feeLabel =
        fee > 0 ? ` (${fee >= 100 ? fee / 100 + "%" : fee + "bp"})` : "";
      return `<div class="routes-list-item"><span>${escText(q.source)}${escText(feeLabel)}</span><span>${out} ${escText(toData.symbol)}${badge}</span></div>`;
    })
    .join("");
  setShown(wrap, true);
}

// ---- Price impact via spot rate ----
const _spotCache = new Map();
const _spotTTL = 60_000;
const _spotMaxSize = 50;

function _spotKey(tokenIn, tokenOut) {
  return `${tokenIn.toLowerCase()}:${tokenOut.toLowerCase()}`;
}

async function getSpotRate(fromSym, toSym) {
  const fromData = tokens[fromSym],
    toData = tokens[toSym];
  const key = _spotKey(fromData.address, toData.address);
  const cached = _spotCache.get(key);
  if (cached && Date.now() - cached.t < _spotTTL) return cached.rate;

  // zAMM/zOrg special paths: use reserve math (quoter doesn't know these tokens)
  const isFromZamm = fromData._isZammStake || fromData._isZOrg;
  const isToZamm = toData._isZammStake || toData._isZOrg;
  if (isFromZamm || isToZamm) {
    try {
      const spotRate = await quoteRPC.call(async (rpc) => {
        const reserves = await getZammPoolReserves(rpc);
        // Pick best pool
        const h = reserves.hooked,
          hl = reserves.hookless;
        // Use the pool with more liquidity (higher product)
        const useHookless =
          hl.reserve0 * hl.reserve1 >= h.reserve0 * h.reserve1;
        const r0 = useHookless ? hl.reserve0 : h.reserve0; // ETH
        const r1 = useHookless ? hl.reserve1 : h.reserve1; // ZAMM/ERC6909
        if (r0 === 0n || r1 === 0n) return null;
        // zOrg ↔ ZAMM is 1:1, so zOrg rate = ZAMM rate
        // ZAMM/zOrg → ETH: num=r0 (ETH per unit), den=r1
        // ETH → ZAMM/zOrg: num=r1, den=r0
        if (isFromZamm && !isToZamm) {
          // Selling ZAMM/zOrg → ETH (or via ETH to target)
          if (toData.address === ZERO_ADDRESS) return { num: r0, den: r1 };
          // For non-ETH target, rate = (r0/r1) * ethToTargetRate — fall through to generic
          return null;
        }
        if (isToZamm && !isFromZamm) {
          // Buying ZAMM/zOrg: ETH → ZAMM
          if (fromData.address === ZERO_ADDRESS) return { num: r1, den: r0 };
          return null;
        }
        // Both are ZAMM/zOrg: 1:1
        return { num: 1n, den: 1n };
      });
      if (spotRate != null) {
        if (_spotCache.size >= _spotMaxSize) {
          const oldest = _spotCache.keys().next().value;
          _spotCache.delete(oldest);
        }
        _spotCache.set(key, { rate: spotRate, t: Date.now() });
        return spotRate;
      }
    } catch (e) {
      console.warn("zAMM spot rate failed:", e);
    }
  }

  // Use a small reference amount: 10^(decimals-2) or at least 1 unit
  const refExp = Math.max(0, fromData.decimals - 2);
  const refAmount = 10n ** BigInt(refExp);

  try {
    const spotRate = await quoteRPC.call(async (rpc) => {
      const quoter = getQuoterContract(rpc);
      const callOpts = { blockTag: "latest" };
      const spotCalls = [
        quoter.getQuotes(
          false,
          fromData.address,
          toData.address,
          refAmount,
          callOpts,
        ),
      ];
      // Rocket Pool spot rate for ETH→rETH
      const isRocketSpot = false;
      if (isRocketSpot) {
        spotCalls.push(
          (async () => {
            const reth = new ethers.Contract(RETH_ADDRESS, RETH_RATE_ABI, rpc);
            const rethOut = await reth.getRethValue(refAmount);
            return { amountIn: refAmount, amountOut: rethOut };
          })(),
        );
      }
      const [baseResult] = await Promise.allSettled(spotCalls);
      let bestOut = 0n,
        bestIn = 0n;
      if (baseResult.status === "fulfilled") {
        const q = baseResult.value;
        if (q.best.amountOut > bestOut) {
          bestOut = q.best.amountOut;
          bestIn = q.best.amountIn;
        }
      }
      /*
                  if (curveResult.status === "fulfilled") {
                    const c = curveResult.value;
                    if (c.amountOut > bestOut) {
                      bestOut = c.amountOut;
                      bestIn = c.amountIn;
                    }
                  }
                  if (rocketSpotResult?.status === "fulfilled") {
                    const rp = rocketSpotResult.value;
                    if (rp.amountOut > bestOut) {
                      bestOut = rp.amountOut;
                      bestIn = rp.amountIn;
                    }
                  }
                  */
      if (bestOut === 0n || bestIn === 0n) return null;
      // Store raw BigInts to avoid precision loss in Number conversion
      return { num: bestOut, den: bestIn };
    });
    if (spotRate != null) {
      if (_spotCache.size >= _spotMaxSize) {
        const oldest = _spotCache.keys().next().value;
        _spotCache.delete(oldest);
      }
      _spotCache.set(key, { rate: spotRate, t: Date.now() });
    }
    return spotRate;
  } catch (e) {
    console.warn("Spot rate fetch failed:", e);
    return null;
  }
}

async function displayPriceImpact(amtStr, fromSym, toSym, quote) {
  const el = $("impactInfo");
  if (!el) return;
  const seq = _quoteSeq; // capture to detect staleness after await
  try {
    const fromData = tokens[fromSym],
      toData = tokens[toSym];
    const amountIn = safeParseUnits(amtStr, fromData.decimals);

    const spotRate = await getSpotRate(fromSym, toSym);
    if (seq !== _quoteSeq) return; // stale — newer quote already in flight
    if (spotRate == null || spotRate.den === 0n) {
      el.textContent = "--";
      el.className = "";
      return;
    }

    // impact = (1 - execRate/spotRate) * 100
    // execRate = expectedOutput / amountIn, spotRate = num / den
    // impact = (1 - (expectedOutput * den) / (amountIn * num)) * 100
    const SCALE = 10n ** 18n;
    const ratio =
      (quote.expectedOutput * spotRate.den * SCALE) / (amountIn * spotRate.num);
    const impact = (Number(SCALE - ratio) * 100) / Number(SCALE);
    const displayImpact = Math.max(0, impact);
    el.textContent =
      displayImpact < 0.01 ? "<0.01%" : displayImpact.toFixed(2) + "%";

    const qBox = $("quoteInfo");
    if (displayImpact > 5) {
      el.className = "impact-danger";
      if (qBox) qBox.classList.add("impact-high");
    } else if (displayImpact > 2) {
      el.className = "impact-warn";
      if (qBox) qBox.classList.remove("impact-high");
    } else {
      el.className = "";
      if (qBox) qBox.classList.remove("impact-high");
    }
  } catch (e) {
    el.textContent = "--";
    el.className = "";
    const qBox = $("quoteInfo");
    if (qBox) qBox.classList.remove("impact-high");
  }
}

async function withRetry(task, { tries = 3, base = 120 } = {}) {
  let attempt = 0,
    lastErr;
  while (attempt < tries) {
    try {
      return await task();
    } catch (e) {
      const s = String(e?.message || "");
      const transient =
        /missing revert data|CALL_EXCEPTION|timeout|ETIMEDOUT|429|rate/i.test(
          s,
        );
      if (!transient || attempt === tries - 1) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, base * Math.pow(2, attempt)));
      attempt++;
    }
  }
  throw lastErr;
}

let _quoteLock = Promise.resolve();
let _pendingQuoteArgs = null;
let _pendingQuoteSeq = 0;

let _quoteResult = null;
function requestQuote(amtStr, fromSnap, toSnap) {
  const mySeq = ++_pendingQuoteSeq;
  _pendingQuoteArgs = { amtStr, fromSnap, toSnap, seq: mySeq };
  _quoteLock = _quoteLock
    .catch(() => {})
    .then(async () => {
      const args = _pendingQuoteArgs;
      if (!args || args.seq !== mySeq) return _quoteResult;
      _pendingQuoteArgs = null;
      _quoteResult = await withRetry(() =>
        getQuote(args.amtStr, args.fromSnap, args.toSnap),
      );
      return _quoteResult;
    });
  return _quoteLock;
}

// ---- Swap execution ----
let _swapBusy = false;

async function executeSwap() {
  if (_swapBusy) return;
  _swapBusy = true;
  stopQuoteRefresh();

  const swapBtn = $("swapBtn");
  try {
    if (!signer || !connectedAddress) {
      toggleWallet();
      return;
    }

    const amtStr = $("fromAmount").value;
    const amtNum = parseFloat(amtStr);
    if (!amtStr || !Number.isFinite(amtNum) || amtNum <= 0) {
      showStatus("Please enter an amount", "error");
      return;
    }
    // // @TODO: we are disabling swapping from ETH or MAYBE for now as they are not supported yet
    // if (fromToken === tokens.ETH.symbol || fromToken === tokens.MAYBE.symbol) {
    //   showStatus("Invalid input token", "error");
    //   return;
    // }
    if (fromToken === toToken) {
      showStatus("Select different tokens", "error");
      return;
    }
    const receiverRaw = ($("receiverAddress")?.value || "").trim();
    if (receiverRaw && !ethers.isAddress(receiverRaw)) {
      if (isReceiverPending()) {
        showStatus("Receiver name still resolving...", "error");
        return;
      }
      if (
        !_resolvedReceiver ||
        _resolvedReceiver.input !== receiverRaw ||
        !_resolvedReceiver.address
      ) {
        showStatus("Could not resolve receiver name", "error");
        return;
      }
    }

    // ETH ↔ WETH wrap/unwrap: direct contract call, no DEX (only when sending to self)
    const resolvedAddr = getReceiver();
    const hasCustomReceiver =
      receiverRaw &&
      (isReceiverPending() ||
        (resolvedAddr && resolvedAddr !== connectedAddress));
    const wrapDir = !hasCustomReceiver
      ? isWrapUnwrap(fromToken, toToken)
      : null;
    if (wrapDir) {
      const fromData = tokens[fromToken];
      const amountIn = safeParseUnits(amtStr, fromData.decimals);
      const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);

      if (wrapDir === "wrap") {
        swapBtn.textContent = "Wrapping...";
        swapBtn.disabled = true;
        const tx = await wcTransaction(
          wethContract.deposit({ value: amountIn }),
          "Confirm wrap in your wallet",
        );
        swapBtn.innerHTML = `Confirming wrap... <a href="https://etherscan.io/tx/${escAttr(tx.hash)}" target="_blank" style="color:var(--btn-fg);text-decoration:underline;font-weight:400">view tx &#8599;</a>`;
        const receipt = await waitForTx(tx);
        if (receipt.status === 0) throw new Error("Wrap transaction failed");
      } else {
        swapBtn.textContent = "Unwrapping...";
        swapBtn.disabled = true;
        const tx = await wcTransaction(
          wethContract.withdraw(amountIn),
          "Confirm unwrap in your wallet",
        );
        swapBtn.innerHTML = `Confirming unwrap... <a href="https://etherscan.io/tx/${escAttr(tx.hash)}" target="_blank" style="color:var(--btn-fg);text-decoration:underline;font-weight:400">view tx &#8599;</a>`;
        const receipt = await waitForTx(tx);
        if (receipt.status === 0) throw new Error("Unwrap transaction failed");
      }

      swapBtn.textContent =
        wrapDir === "wrap" ? "Wrap Complete!" : "Unwrap Complete!";
      $("fromAmount").value = "";
      $("toAmount").value = "";
      $("quoteInfo").style.display = "none";
      setTimeout(() => {
        updateBalances();
        swapBtn.textContent = "Enter an amount";
        swapBtn.disabled = true;
      }, 1500);
      return;
    }

    swapBtn.innerHTML = `<span class="loading"></span> Getting quote...`;
    swapBtn.disabled = true;

    const fromSnap = fromToken,
      toSnap = toToken;
    console.log(
      `inside execute swap, getting quote from ${fromSnap} to ${toToken}`,
    );
    const quote = await withRetry(() => getQuote(amtStr, fromSnap, toSnap));
    const fromData = tokens[fromSnap];
    const amountIn = safeParseUnits(amtStr, fromData.decimals);

    let txData = quote.multicall;

    console.log("from token inside execute swap: ", fromSnap);
    console.log("amount in inside execute swap: ", amountIn);
    console.log("txData inside execute swap: ", txData);

    // ERC20 approval
    if (fromData.address !== ZERO_ADDRESS) {
      const r = erc20Read(fromData.address);
      swapBtn.textContent = "Checking allowance...";
      let allowance = await r.allowance(connectedAddress, MAYBE_ROUTER_ADDRESS);
      cacheSetAllowance(
        fromData.address,
        connectedAddress,
        MAYBE_ROUTER_ADDRESS,
        allowance,
      );

      if (allowance < amountIn) {
        let approved = false;

        // --- Try 1: EIP-2612 Permit (single tx) ---
        const permitCfg = await getPermitConfig(fromData.address);
        if (permitCfg) {
          try {
            swapBtn.textContent = "Sign permit...";
            const permitData = await signPermit(permitCfg, fromData.address);
            const innerCalls =
              quote.calls || decodeMulticallCalls(quote.multicall);
            const permitTxData = buildPermitMulticall(innerCalls, permitData);
            // Pre-flight: catch on-chain permit failures (e.g. InvalidShortString)
            await provider.estimateGas({
              from: connectedAddress,
              to: MAYBE_ROUTER_ADDRESS,
              data: permitTxData,
              value: quote.msgValue ?? 0n,
            });
            txData = permitTxData;
            approved = true;
          } catch (permitErr) {
            const msg = String(permitErr?.message || "");
            if (/user rejected|user denied|user cancelled/i.test(msg))
              throw permitErr;
            console.warn("Permit failed, falling back:", permitErr);
            _permitCache.set(fromData.address.toLowerCase(), null);
            txData = quote.multicall;
          }
        }

        // --- Try 2: Permit2 (single tx, sign-only) ---
        if (!approved) {
          let p2Allowance = cacheGetAllowance(
            fromData.address,
            connectedAddress,
            PERMIT2_ADDRESS,
          );
          if (p2Allowance == null) {
            swapBtn.textContent = "Checking Permit2...";
            const r2 = erc20Read(fromData.address);
            p2Allowance = await r2.allowance(connectedAddress, PERMIT2_ADDRESS);
            cacheSetAllowance(
              fromData.address,
              connectedAddress,
              PERMIT2_ADDRESS,
              p2Allowance,
            );
          }
          if (p2Allowance >= amountIn) {
            try {
              swapBtn.textContent = "Sign Permit2...";
              const permit2Data = await signPermit2(fromData.address, amountIn);
              const innerCalls =
                quote.calls || decodeMulticallCalls(quote.multicall);
              txData = buildPermit2Multicall(innerCalls, permit2Data);
              approved = true;
            } catch (p2Err) {
              const msg = String(p2Err?.message || "");
              if (/user rejected|user denied|user cancelled/i.test(msg))
                throw p2Err;
              console.warn("Permit2 failed, falling back:", p2Err);
              txData = quote.multicall;
            }
          }
        }

        // --- Try 3: Approve (two tx, traditional fallback) ---
        if (!approved) {
          swapBtn.textContent = "Approving token...";
          const erc20W = new ethers.Contract(
            fromData.address,
            ["function approve(address,uint256) returns (bool)"],
            signer,
          );
          // WBTC/USDT revert on approve(spender, newVal) when current != 0
          // Reset to zero first if there's a stale non-zero allowance
          if (allowance > 0n) {
            const resetTx = await wcTransaction(
              erc20W.approve(MAYBE_ROUTER_ADDRESS, 0),
              "Reset allowance in your wallet",
            );
            swapBtn.textContent = "Resetting allowance...";
            const resetRc = await waitForTx(resetTx);
            if (resetRc.status === 0) throw new Error("Allowance reset failed");
          }
          const approveTx = await wcTransaction(
            erc20W.approve(MAYBE_ROUTER_ADDRESS, ethers.MaxUint256),
            "Approve token spending in your wallet",
          );
          swapBtn.innerHTML = `Approving... <a href="https://etherscan.io/tx/${escAttr(approveTx.hash)}" target="_blank" style="color:var(--btn-fg);text-decoration:underline;font-weight:400">view tx &#8599;</a>`;
          const rc = await waitForTx(approveTx);
          if (rc.status === 0) throw new Error("Approval transaction failed");
          const fresh = await getQuote(amtStr, fromSnap, toSnap);
          txData = fresh.multicall;
          quote.msgValue = fresh.msgValue;
          cacheSetAllowance(
            fromData.address,
            connectedAddress,
            MAYBE_ROUTER_ADDRESS,
            ethers.MaxUint256,
          );
        }
      }
    }

    const actionLabel = "Swapping";
    swapBtn.textContent = actionLabel + "...";
    const txValue = quote.msgValue ?? 0n;

    const swapTx = await wcTransaction(
      signer.sendTransaction({
        to: MAYBE_ROUTER_ADDRESS,
        data: txData,
        value: fromData.address === tokens.ETH.address ? amountIn : 0n,
        maxFeePerGas: appWideMaxGasPrice,
      }),
      "Confirm swap in your wallet",
    );
    swapBtn.innerHTML = `Confirming ${actionLabel.toLowerCase()}... <a href="https://etherscan.io/tx/${escAttr(swapTx.hash)}" target="_blank" style="color:var(--btn-fg);text-decoration:underline;font-weight:400">view tx &#8599;</a>`;

    const receipt = await waitForTx(swapTx);
    if (receipt.status === 0) throw new Error("Swap transaction failed");

    // Handle maybify swap UX (lock card for VRF wait, or show inline result)
    const maybifyResult = connectedAddress
      ? await handleMaybifyReceipt(receipt, connectedAddress)
      : null;

    if (maybifyResult?.type === "pending") {
      // Lock swap card — inputs stay visible, button shows VRF status
      _lockSwapCardForMaybify(maybifyResult.maybifyId, maybifyResult.swapCtx);
      // @TODO: user should not be able to change token amounts, slippage....
    } else if (maybifyResult?.type === "resolved") {
      // VRF resolved in same block — show result briefly then reset
      swapBtn.textContent =
        (maybifyResult.won ? "🎉 " : "😢 ") + maybifyResult.desc;
      setTimeout(() => {
        $("fromAmount").value = "";
        $("toAmount").value = "";
        $("quoteInfo").style.display = "none";
        updateBalances();
        handleAmountChange();
      }, 3000);
    } else {
      // Normal (non-maybify) swap — reset immediately
      swapBtn.textContent =
        (isLidoExec ? "Stake" : isZOrgSwap(toSnap) ? "Swap & Stake" : "Swap") +
        " Complete!";
      $("fromAmount").value = "";
      $("toAmount").value = "";
      $("quoteInfo").style.display = "none";
      stopQuoteRefresh();
      setTimeout(() => {
        updateBalances();
        swapBtn.textContent = "Enter an amount";
        swapBtn.disabled = true;
      }, 1500);
    }
  } catch (e) {
    console.error("Swap error:", e);
    let msg = "Swap failed";
    const s = String(e?.message || e?.reason || "");
    if (e.code === 4001 || /user rejected|denied/i.test(s))
      msg = "Transaction cancelled";
    else if (/insufficient funds/i.test(s)) msg = "Insufficient balance";
    else if (/Too many decimals|Invalid number/i.test(s)) msg = s;

    swapBtn.textContent = msg;
    setTimeout(() => {
      handleAmountChange();
    }, 2000);
  } finally {
    _swapBusy = false;
  }
}

// ---- Token swap direction ----
function swapTokens() {
  if (fromToken === toToken) return;
  const prevFrom = fromToken,
    prevTo = toToken;
  const fAmt = $("fromAmount").value;
  const tAmt = $("toAmount").value;

  fromToken = prevTo;
  toToken = prevFrom;
  $("fromAmount").value = tAmt;
  $("toAmount").value = "";
  updateTokenDisplay();
  _quoteSeq++;
  updateBalances();
  if (tAmt) handleAmountChange();
}

function fitRouteText(route) {
  const el = $("routeInfo");
  el.textContent = route;
  el.title = route;
  el.removeAttribute("data-size");
  const len = route.length;
  if (len > 48) el.setAttribute("data-size", "xs");
  else if (len > 32) el.setAttribute("data-size", "sm");
}

function computeZammPoolId(addr0, addr1, id0, id1, fee) {
  const [sortedA, sortedB] =
    addr0.toLowerCase() < addr1.toLowerCase() ? [addr0, addr1] : [addr1, addr0];
  const [sortedId0, sortedId1] =
    addr0.toLowerCase() < addr1.toLowerCase() ? [id0, id1] : [id1, id0];
  const poolKey = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "address", "address", "uint256"],
    [sortedId0, sortedId1, sortedA, sortedB, fee],
  );
  return BigInt(ethers.keccak256(poolKey));
}

function updateChartLink(quote) {
  const link = $("chartLink");
  const zammRe = /zAMM|V4 Hooked/;
  const hasZamm =
    zammRe.test(quote.sourceA || "") ||
    zammRe.test(quote.sourceB || "") ||
    (quote.splitLegs &&
      quote.splitLegs.some((l) => zammRe.test(l.source || "")));
  if (!hasZamm) {
    link.style.display = "none";
    return;
  }
  // Determine pool ID: for zOrg route use ZORG_ID; otherwise standard ERC20 pool
  const fromAddr = tokens[fromToken].address;
  const toAddr = tokens[toToken].address;
  const isZorg = !!(
    tokens[fromToken]._isZOrg ||
    tokens[toToken]._isZOrg ||
    tokens[fromToken]._isZammStake ||
    tokens[toToken]._isZammStake
  );
  let poolId;
  if (isZorg) {
    poolId = computeZammPoolId(ZERO_ADDRESS, ZORG_TOKEN, 0n, ZORG_ID, 100n);
  } else {
    // Standard zAMM pool between the two tokens
    poolId = computeZammPoolId(fromAddr, toAddr, 0n, 0n, 100n);
  }
  link.href = "./chart/#/" + poolId.toString();
  link.style.display = "inline-flex";
}

// ---- Quick-pick popular tokens ----
const QUICK_TOKENS = ["DAI"];

function renderQuickTokens() {
  const el = $("quickTokens");
  if (!el) return;
  el.innerHTML = "";
  for (const sym of QUICK_TOKENS) {
    if (!tokens[sym] || sym === toToken || sym === fromToken) continue;
    const btn = document.createElement("button");
    btn.className = "quick-token";
    btn.setAttribute("aria-label", sym);
    btn.innerHTML = `<span class="qi">${iconForSymbol(sym)}</span>`;
    // Make inner icon fill the container
    const svgOrImg = btn.querySelector(".qi > *");
    if (svgOrImg) {
      svgOrImg.style.width = "100%";
      svgOrImg.style.height = "100%";
    }
    btn.onclick = () => {
      toToken = sym;
      updateTokenDisplay();
      updateBalances();
      const amt = $("fromAmount");
      if (amt && amt.value) reQuoteDebounced();
    };
    el.appendChild(btn);
  }
}

// ---- Token display ----
function updateTokenDisplay() {
  const fSym = fromToken,
    tSym = toToken;
  setHTML("fromTokenIcon", iconForSymbol(fSym));
  setText("fromTokenSymbol", tokens[fSym].symbol);
  setHTML("toTokenIcon", iconForSymbol(tSym));
  setText("toTokenSymbol", tokens[tSym].symbol);
  renderQuickTokens();
}

// ---- Token modal ----
function initTokenListClick() {
  const list = $("tokenList");
  if (!list || list.dataset.inited === "1") return;
  list.dataset.inited = "1";
  list.addEventListener("click", (e) => {
    // Handle .wei list remove button
    const removeBtn = e.target.closest(".wei-list-remove");
    if (removeBtn) {
      const listName = removeBtn.getAttribute("data-list");
      if (listName) {
        removeWeiList(listName);
        renderTokenList($("tokenSearchInput")?.value || "");
      }
      return;
    }
    const row = e.target.closest(".token-list-item");
    if (!row) return;
    const symbol = row.getAttribute("data-symbol");
    if (symbol) selectToken(symbol);
  });
}

function openTokenModal(side) {
  currentModal = side;
  const searchInput = $("tokenSearchInput");
  if (searchInput) searchInput.value = "";
  const statusEl = $("weiListStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "token-search-status";
  }
  renderTokenList("");
  $("tokenModal").classList.add("active");
  document.body.classList.add("modal-open");
  if (searchInput) searchInput.focus();
  // Batch-fetch all token balances via Multicall3 (single RPC)
  if (connectedAddress) fetchModalBalances();
}

function closeTokenModal() {
  $("tokenModal").classList.remove("active");
  document.body.classList.remove("modal-open");
  $("customTokenAddress").value = "";
  const searchInput = $("tokenSearchInput");
  if (searchInput) searchInput.value = "";
  const statusEl = $("weiListStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "token-search-status";
  }
}

const reQuoteDebounced = debounce(handleAmountChange, 600);

function selectToken(symbol) {
  if (currentModal === "from") {
    if (symbol === toToken) toToken = fromToken;
    fromToken = symbol;
    // // @TODO: we are disabling swapping from ETH or MAYBE for now as they are not supported yet
    // if (fromToken === tokens.ETH.symbol || fromToken === tokens.MAYBE.symbol) {
    //   showStatus("Invalid input token", "error");
    // }
  } else {
    if (symbol === fromToken) fromToken = toToken;
    toToken = symbol;
  }
  updateTokenDisplay();
  updateBalances();
  closeTokenModal();
  currentModal = null;
  const amt = $("fromAmount");
  if (amt) amt.focus();
  if (amt && amt.value) reQuoteDebounced();
}

function setupDirectZammStake() {
  fromToken = "ZAMM";
  toToken = "zOrg";
  updateTokenDisplay();
  updateBalances();
  const amt = $("fromAmount");
  if (amt) amt.focus();
  if (amt && amt.value) reQuoteDebounced();
}

function setupRagequit() {
  fromToken = "zOrg";
  toToken = "ZAMM";
  updateTokenDisplay();
  updateBalances();
  const amt = $("fromAmount");
  if (amt) amt.focus();
  if (amt && amt.value) reQuoteDebounced();
}

async function addCustomToken() {
  let address = $("customTokenAddress").value.trim();
  if (!ethers.isAddress(address)) {
    showStatus("Invalid address", "error");
    return;
  }
  address = ethers.getAddress(address);
  if (address === ZERO_ADDRESS) {
    showStatus("Zero address is not a valid ERC-20", "error");
    return;
  }

  try {
    const rpc =
      provider || new ethers.JsonRpcProvider("https://eth.llamarpc.com");
    try {
      const code = await rpc.getCode(address);
      if (!code || code === "0x") {
        showStatus("That address has no contract code on Ethereum", "error");
        return;
      }
    } catch (_) {}

    const erc20 = new ethers.Contract(
      address,
      [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      rpc,
    );
    const [rawSymbol, rawDecimals] = await Promise.all([
      erc20.symbol(),
      erc20.decimals(),
    ]);

    const symbol =
      String(rawSymbol || "")
        .trim()
        .slice(0, 24) || "TKN";
    const rawDec = Number(rawDecimals);
    const decimals =
      Number.isInteger(rawDec) && rawDec >= 0 && rawDec <= 36 ? rawDec : 18;

    const existing = tokens[symbol];
    if (existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      showStatus(
        `A different token with symbol ${symbol} is already listed`,
        "error",
      );
      return;
    }

    tokens[symbol] = { address, symbol, decimals };
    saveCustomTokens();
    selectToken(symbol);
  } catch (e) {
    console.error("Error adding token:", e);
    showStatus(
      "Failed to add token. Ensure it's a valid ERC-20 on Ethereum",
      "error",
    );
  }
}

// ---- Keyboard shortcuts ----
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeTokenModal();
    closeWalletModal();
  }
});

// ---- Init ----
// ---- Maybify event subscriptions & notifications ----
const MAYBIFY_STORAGE_KEY = "maybify_pending_v2";
// maybifyId (string) → intervalId
const _maybifyPolls = new Map();
// maybifyId (string) locking the swap card UI, or null
let _swapCardMaybifyId = null;
// maybifyId (string) → elapsed setInterval id
const _maybifyElapsedTimers = new Map();
// maybifyId (string) → auto-dismiss setTimeout id
const _maybifyAutoDismiss = new Map();

function _loadMaybifyPending() {
  try {
    return JSON.parse(localStorage.getItem(MAYBIFY_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function _saveMaybifyPending(items) {
  try {
    localStorage.setItem(MAYBIFY_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}
function _addMaybifyPending(item) {
  const items = _loadMaybifyPending().filter(
    (i) => i.maybifyId !== item.maybifyId,
  );
  items.push(item);
  _saveMaybifyPending(items);
}
function _removeMaybifyPending(maybifyId) {
  _saveMaybifyPending(
    _loadMaybifyPending().filter((i) => i.maybifyId !== String(maybifyId)),
  );
}

function _lockSwapCardForMaybify(maybifyId, swapCtx) {
  _swapCardMaybifyId = String(maybifyId);
  const fromEl = $("fromAmount");
  if (fromEl) fromEl.disabled = true;
  stopQuoteRefresh();
  const swapBtn = $("swapBtn");
  if (!swapBtn) return;
  const pct = swapCtx?.probabilityInBps
    ? (Number(swapCtx.probabilityInBps) / 100).toFixed(0) + "% chance"
    : null;
  const outSym = swapCtx?.swapBackIntendedOutToken
    ? Object.values(tokens).find(
        (t) =>
          t.address?.toLowerCase() ===
          swapCtx.swapBackIntendedOutToken.toLowerCase(),
      )?.symbol || null
    : null;
  // @TODO: Add the ability of notification where we see the seconds passed
  const parts = ["⏳ Waiting for VRF", pct, outSym && "→ " + outSym].filter(
    Boolean,
  );
  swapBtn.textContent = parts.join(" · ");
  swapBtn.disabled = true;
}

function _resolveSwapCardMaybify(maybifyId, won, desc) {
  if (_swapCardMaybifyId !== String(maybifyId)) return;
  _swapCardMaybifyId = null;
  const swapBtn = $("swapBtn");
  if (swapBtn) swapBtn.textContent = (won ? "🎉 " : "😢 ") + desc;
  // @TODO: Balance is not getting updated...
  setTimeout(() => {
    const fromEl = $("fromAmount");
    if (fromEl) {
      fromEl.disabled = false;
      fromEl.value = "";
    }
    const toEl = $("toAmount");
    if (toEl) toEl.value = "";
    const qEl = $("quoteInfo");
    if (qEl) qEl.style.display = "none";
    handleAmountChange();
    updateBalances();
  }, 5_000);
}

function _fmtTokenByAddr(address, amount) {
  const t = Object.values(tokens).find(
    (t) => t.address?.toLowerCase() === address?.toLowerCase(),
  );
  return `${fmt(ethers.formatUnits(amount, t?.decimals ?? 18))} ${t?.symbol || (address ? address.slice(0, 8) + "..." : "?")}`;
}

function _buildSwapCtxLine(swapCtx, status) {
  if (!swapCtx) return "";
  try {
    const inStr = _fmtTokenByAddr(
      swapCtx.inToken,
      BigInt(swapCtx.inTokenAmount),
    );
    const hasPct = swapCtx.probabilityInBps != null;
    const pct = hasPct
      ? (Number(swapCtx.probabilityInBps) / 100).toFixed(0) + "%"
      : null;
    if (status === "pending") {
      const outT = Object.values(tokens).find(
        (t) =>
          t.address?.toLowerCase() ===
          swapCtx.swapBackIntendedOutToken?.toLowerCase(),
      );
      const outStr =
        outT?.symbol ||
        (swapCtx.swapBackIntendedOutToken
          ? swapCtx.swapBackIntendedOutToken.slice(0, 8) + "..."
          : "?");
      return [inStr + " in", pct && pct + " chance", "→ " + outStr]
        .filter(Boolean)
        .join(" · ");
    }
    if (status === "won") {
      return [inStr + " in", pct && pct + " chance"]
        .filter(Boolean)
        .join(" · ");
    }
    if (status === "lost") {
      return pct ? pct + " odds were not in your favor." : "";
    }
  } catch {}
  return "";
}

function _startElapsedTimer(maybifyId, timestamp) {
  _stopElapsedTimer(maybifyId);
  const key = String(maybifyId);
  const tid = setInterval(() => {
    const el = document.getElementById(`mn-elapsed-${key}`);
    if (!el) {
      _stopElapsedTimer(maybifyId);
      return;
    }
    const secs = Math.floor((Date.now() - timestamp) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    // el.textContent = m > 0 ? `Waiting ${m}m ${s}s…` : `Waiting ${s}s…`;
    el.textContent = m > 0 ? `Waiting ${m}m ${s}s…` : `Waiting ${s}s…`;
  }, 1000);
  _maybifyElapsedTimers.set(key, tid);
}

function _stopElapsedTimer(maybifyId) {
  const key = String(maybifyId);
  const tid = _maybifyElapsedTimers.get(key);
  if (tid != null) {
    clearInterval(tid);
    _maybifyElapsedTimers.delete(key);
  }
}

function confirmDismissMaybifyNotif(maybifyId) {
  if (
    confirm(
      "Stop monitoring this swap? It has already been submitted on-chain — you won't be notified of the result.",
    )
  ) {
    dismissMaybifyNotif(maybifyId);
  }
}

function showMaybifyNotif(maybifyId, status, desc, txLink, swapCtx, timestamp) {
  const id = `mn-${maybifyId}`;
  const container = $("maybifyNotifContainer");
  if (!container) return;
  let el = document.getElementById(id);
  const wasPending = el?.classList.contains("maybify-notif-pending");
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    container.appendChild(el);
  }
  const icons = { pending: "⏳", won: "🎉", lost: "😢" };
  const titles = {
    pending: "Swap Pending",
    won: "You Won!",
    lost: "No Luck This Time",
  };
  if (status !== "pending") _stopElapsedTimer(maybifyId);
  const idEsc = escAttr(String(maybifyId));
  const closeBtn =
    status === "pending"
      ? `<button class="maybify-notif-close" onclick="confirmDismissMaybifyNotif('${idEsc}')">×</button>`
      : `<button class="maybify-notif-close" onclick="dismissMaybifyNotif('${idEsc}')">×</button>`;
  const ctxLine = _buildSwapCtxLine(swapCtx, status);
  const elapsedEl =
    status === "pending"
      ? `<div class="maybify-notif-elapsed" id="${escAttr(`mn-elapsed-${String(maybifyId)}`)}"></div>`
      : "";
  el.className = `maybify-notif maybify-notif-${status}`;
  el.innerHTML =
    closeBtn +
    `<div class="maybify-notif-icon">${icons[status] || "⏳"}</div>` +
    `<div class="maybify-notif-body">` +
    `<div class="maybify-notif-title">${escText(titles[status] || status)}</div>` +
    `<div class="maybify-notif-desc">${escText(desc)}</div>` +
    (ctxLine
      ? `<div class="maybify-notif-context">${escText(ctxLine)}</div>`
      : "") +
    elapsedEl +
    (txLink
      ? `<a href="${escAttr(txLink)}" target="_blank" class="maybify-notif-link">View transaction ↗</a>`
      : "") +
    `</div>`;
  if (wasPending && (status === "won" || status === "lost")) {
    el.classList.add("maybify-notif-resolving");
    setTimeout(() => el.classList.remove("maybify-notif-resolving"), 350);
  }
  if (status === "pending") {
    _startElapsedTimer(maybifyId, timestamp ?? Date.now());
  }
  if (status === "won" || status === "lost") {
    const prevAutoId = _maybifyAutoDismiss.get(String(maybifyId));
    if (prevAutoId != null) clearTimeout(prevAutoId);
    const autoId = setTimeout(() => dismissMaybifyNotif(maybifyId), 30_000);
    _maybifyAutoDismiss.set(String(maybifyId), autoId);
  }
}

function dismissMaybifyNotif(maybifyId) {
  const el = document.getElementById(`mn-${maybifyId}`);
  if (el) {
    el.classList.add("maybify-notif-fade-out");
    setTimeout(() => el.remove(), 300);
  }
  const timerId = _maybifyPolls.get(String(maybifyId));
  if (timerId != null) {
    clearInterval(timerId);
    _maybifyPolls.delete(String(maybifyId));
  }
  _stopElapsedTimer(maybifyId);
  const autoId = _maybifyAutoDismiss.get(String(maybifyId));
  if (autoId != null) {
    clearTimeout(autoId);
    _maybifyAutoDismiss.delete(String(maybifyId));
  }
  _removeMaybifyPending(maybifyId);
}

function _decodeSwapBackResult(swapBackState, swapBackResultData, swapCtx) {
  const state = Number(swapBackState);
  const dec = ethers.AbiCoder.defaultAbiCoder();
  try {
    if (state === 0) {
      if (swapCtx?.inToken && swapCtx?.inTokenAmount) {
        try {
          const inStr = _fmtTokenByAddr(
            swapCtx.inToken,
            BigInt(swapCtx.inTokenAmount),
          );
          return {
            won: false,
            desc: `Your ${inStr} was converted to MAYBE and burned.`,
          };
        } catch {}
      }
      return { won: false, desc: "Better luck next time." };
    }
    if (state === 1) {
      // NEWLY_MINTED_MAYBE
      const [amt] = dec.decode(["uint256"], swapBackResultData);
      return {
        won: true,
        desc: `Received ${fmt(ethers.formatEther(amt))} MAYBE`,
      };
    }
    if (state === 2) {
      // SWAP_FROM_MAYBE_TO_ETH_NOT_FULLY_CONSUMED
      const [ethAmt, maybeAmt] = dec.decode(
        ["uint256", "uint256"],
        swapBackResultData,
      );
      return {
        won: true,
        desc: `Received ${fmt(ethers.formatEther(ethAmt))} ETH + ${fmt(ethers.formatEther(maybeAmt))} MAYBE`,
      };
    }
    if (state === 3 || state === 4) {
      // SWAPPED_BACK_TO_ETH or ETH fallback
      const [ethAmt] = dec.decode(["uint256"], swapBackResultData);
      return {
        won: true,
        desc: `Received ${fmt(ethers.formatEther(ethAmt))} ETH${state === 4 ? " (token swap failed)" : ""}`,
      };
    }
    if (state === 5) {
      // SWAPPED_BACK_TO_TOKEN_Y
      const [tokenAddr, tokenAmt] = dec.decode(
        ["address", "uint256"],
        swapBackResultData,
      );
      if (tokenAmt === ethers.MaxUint256)
        return { won: true, desc: `Received output token` };
      const t = Object.values(tokens).find(
        (t) => t.address?.toLowerCase() === tokenAddr.toLowerCase(),
      );
      return {
        won: true,
        desc: `Received ${fmt(ethers.formatUnits(tokenAmt, t?.decimals ?? 18))} ${t?.symbol || tokenAddr.slice(0, 8) + "..."}`,
      };
    }
  } catch {}
  return { won: true, desc: "Swap resolved." };
}

async function _pollMaybifyResolved(maybifyId, swapper, fromBlock) {
  const resolvedTopic = MAYBE_HOOK_IFACE.getEvent(
    "MaybifiedSwapResolved",
  ).topicHash;
  const idPadded = ethers.zeroPadValue(ethers.toBeHex(BigInt(maybifyId)), 32);
  const swapperPadded = ethers.zeroPadValue(swapper.toLowerCase(), 32);
  try {
    const logs = await quoteRPC.call((rpc) =>
      rpc.getLogs({
        address: MAYBE_HOOK_ADDRESS,
        fromBlock,
        topics: [resolvedTopic, idPadded, swapperPadded],
      }),
    );
    if (logs.length > 0) return MAYBE_HOOK_IFACE.parseLog(logs[0]);
  } catch (e) {
    console.warn("Maybify poll error:", e);
  }
  return null;
}

function _startMaybifyPolling(
  maybifyId,
  swapper,
  fromBlock,
  swapCtx,
  timestamp,
) {
  const key = String(maybifyId);
  if (_maybifyPolls.has(key)) return;
  const timerId = setInterval(async () => {
    const parsed = await _pollMaybifyResolved(maybifyId, swapper, fromBlock);
    if (!parsed) return;
    clearInterval(timerId);
    _maybifyPolls.delete(key);
    _removeMaybifyPending(key);
    const { won, desc } = _decodeSwapBackResult(
      parsed.args.swapBackState,
      parsed.args.swapBackResultData,
      swapCtx,
    );
    showMaybifyNotif(
      maybifyId,
      won ? "won" : "lost",
      desc,
      undefined,
      swapCtx,
      timestamp,
    );
    _resolveSwapCardMaybify(maybifyId, won, desc);
  }, 1_000);
  _maybifyPolls.set(key, timerId);
}

async function handleMaybifyReceipt(receipt, swapper) {
  // Extract maybifyId and swap context from SwapBeforeMaybifying on MaybeRouter
  let maybifyId = null;
  let inToken = null;
  let inTokenAmount = null;
  console.log(
    "[maybify] handleMaybifyReceipt: total logs",
    receipt.logs.length,
    "routerAddr",
    MAYBE_ROUTER_ADDRESS,
    "hookAddr",
    MAYBE_HOOK_ADDRESS,
  );
  console.log(
    "[maybify] log addresses:",
    receipt.logs.map((l) => l.address),
  );
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MAYBE_ROUTER_ADDRESS.toLowerCase())
      continue;
    try {
      const parsed = MAYBE_ROUTER_IFACE.parseLog(log);
      if (parsed?.name === "SwapBeforeMaybifying") {
        maybifyId = parsed.args.maybifyId;
        inToken = parsed.args.inToken;
        inTokenAmount = parsed.args.inTokenAmount;
        break;
      }
    } catch (e) {
      console.warn("[maybify] router log parse error:", e);
    }
  }
  console.log(
    "[maybify] maybifyId:",
    maybifyId,
    "inToken:",
    inToken,
    "inTokenAmount:",
    inTokenAmount,
  );
  if (maybifyId == null) return null; // not a maybify swap

  // Gather MaybifiedSwapRegistered for probability/out-token info
  let probabilityInBps = null;
  let swapBackIntendedOutToken = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MAYBE_HOOK_ADDRESS.toLowerCase())
      continue;
    try {
      const parsed = MAYBE_HOOK_IFACE.parseLog(log);
      if (
        parsed?.name === "MaybifiedSwapRegistered" &&
        String(parsed.args.id) === String(maybifyId)
      ) {
        probabilityInBps = parsed.args.probabilityInBps;
        swapBackIntendedOutToken = parsed.args.swapBackIntendedOutToken;
        break;
      }
    } catch (e) {
      console.warn("[maybify] hook registered log parse error:", e);
    }
  }
  console.log(
    "[maybify] probabilityInBps:",
    probabilityInBps,
    "swapBackIntendedOutToken:",
    swapBackIntendedOutToken,
  );

  const swapCtx =
    inToken != null
      ? {
          inToken,
          inTokenAmount: String(inTokenAmount),
          probabilityInBps:
            probabilityInBps != null ? String(probabilityInBps) : null,
          swapBackIntendedOutToken: swapBackIntendedOutToken ?? null,
        }
      : null;
  const timestamp = Date.now();

  // Check if already resolved in the same receipt (fast VRF in tests)
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MAYBE_HOOK_ADDRESS.toLowerCase())
      continue;
    try {
      const parsed = MAYBE_HOOK_IFACE.parseLog(log);
      if (
        parsed?.name === "MaybifiedSwapResolved" &&
        String(parsed.args.id) === String(maybifyId)
      ) {
        console.log(
          "[maybify] resolved in same receipt, state:",
          parsed.args.swapBackState,
        );
        const { won, desc } = _decodeSwapBackResult(
          parsed.args.swapBackState,
          parsed.args.swapBackResultData,
          swapCtx,
        );
        showMaybifyNotif(
          maybifyId,
          won ? "won" : "lost",
          desc,
          undefined,
          swapCtx,
          timestamp,
        );
        return { type: "resolved", won, desc, swapCtx };
      }
    } catch (e) {
      console.warn("[maybify] hook resolved log parse error:", e);
    }
  }

  // Show pending and start polling
  showMaybifyNotif(
    maybifyId,
    "pending",
    "Waiting for VRF randomness…",
    undefined,
    swapCtx,
    timestamp,
  );
  _addMaybifyPending({
    maybifyId: String(maybifyId),
    swapper,
    fromBlock: receipt.blockNumber,
    swapCtx,
    timestamp,
  });
  _startMaybifyPolling(
    maybifyId,
    swapper,
    receipt.blockNumber,
    swapCtx,
    timestamp,
  );
  return { type: "pending", maybifyId, swapCtx };
}

function restoreMaybifyPolls() {
  for (const {
    maybifyId,
    swapper,
    fromBlock,
    swapCtx,
    timestamp,
  } of _loadMaybifyPending()) {
    showMaybifyNotif(
      maybifyId,
      "pending",
      "Waiting for VRF randomness…",
      undefined,
      swapCtx,
      timestamp,
    );
    _startMaybifyPolling(maybifyId, swapper, fromBlock, swapCtx, timestamp);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateTokenDisplay();
  initTokenListClick();
  initTokenSearch();
  const fromEl = $("fromAmount");
  if (fromEl)
    fromEl.addEventListener("input", debounce(handleAmountChange, 400));
  // Defer heavy localStorage parsing until after first render
  (window.requestIdleCallback || setTimeout)(() => loadWeiLists());
});

// Swap button click
$("swapBtn").addEventListener("click", () => {
  if (!connectedAddress) {
    showWalletModal();
    return;
  }
  executeSwap();
});

// ---- Auto-reconnect (non-blocking) ----
window.addEventListener("load", () => {
  restoreMaybifyPolls();
  const savedWallet = localStorage.getItem("zswap_wallet");
  if (!savedWallet) return;
  setText("walletBtn", "...");
  // Fire-and-forget: don't block page interactivity
  setTimeout(async () => {
    try {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      await new Promise((r) => setTimeout(r, 300));
      await connectWithWallet(savedWallet);
    } catch (e) {
      console.error("Auto-reconnect failed:", e);
      setText("walletBtn", "connect");
    }
  }, 100);
});
