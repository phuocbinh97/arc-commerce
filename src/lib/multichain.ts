// Multi-chain config for cross-chain checkout
// All testnets supported by Circle CCTP

export interface ChainConfig {
  key: string;           // Circle App Kit chain name
  chainId: number;       // hex as number
  label: string;         // display name
  shortLabel: string;
  color: string;
  usdc: string;          // USDC contract on this chain
  rpc: string;           // CORS-friendly public RPC
  explorer: string;
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    key: "Arc_Testnet",
    chainId: 5042002,
    label: "Arc Testnet",
    shortLabel: "Arc",
    color: "#0757f9",
    usdc: "0x3600000000000000000000000000000000000000",
    rpc: "https://rpc.testnet.arc.network",
    explorer: "https://testnet.arcscan.app",
  },
  {
    key: "Ethereum_Sepolia",
    chainId: 11155111,
    label: "Ethereum Sepolia",
    shortLabel: "ETH Sep",
    color: "#627eea",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    key: "Base_Sepolia",
    chainId: 84532,
    label: "Base Sepolia",
    shortLabel: "Base",
    color: "#0052ff",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
  {
    key: "Arbitrum_Sepolia",
    chainId: 421614,
    label: "Arbitrum Sepolia",
    shortLabel: "Arbitrum",
    color: "#12aaff",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
  },
  {
    key: "Optimism_Sepolia",
    chainId: 11155420,
    label: "Optimism Sepolia",
    shortLabel: "OP",
    color: "#ff0420",
    usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    rpc: "https://sepolia.optimism.io",
    explorer: "https://sepolia-optimism.etherscan.io",
  },
  {
    key: "Polygon_Amoy_Testnet",
    chainId: 80002,
    label: "Polygon Amoy",
    shortLabel: "Polygon",
    color: "#8247e5",
    usdc: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
    rpc: "https://rpc-amoy.polygon.technology",
    explorer: "https://amoy.polygonscan.com",
  },
  {
    key: "Avalanche_Fuji",
    chainId: 43113,
    label: "Avalanche Fuji",
    shortLabel: "Avax",
    color: "#e84142",
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
    explorer: "https://testnet.snowtrace.io",
  },
];

export const ARC_CHAIN = SUPPORTED_CHAINS[0];

export function getChainByChainId(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find(c => c.chainId === chainId);
}

export function parseChainId(hexOrNum: string | number): number {
  if (typeof hexOrNum === "number") return hexOrNum;
  return parseInt(hexOrNum, 16);
}

export async function fetchUsdcBalance(chain: ChainConfig, address: string): Promise<string> {
  const data = "0x70a08231" + address.toLowerCase().replace("0x", "").padStart(64, "0");
  try {
    const res = await fetch(chain.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: chain.usdc, data }, "latest"] }),
    }).then(r => r.json());
    const raw = res.result && res.result !== "0x" ? res.result : "0x0";
    return (Number(BigInt(raw)) / 1e6).toFixed(2);
  } catch {
    return "—";
  }
}
