import { ServerConfig } from './src/types.js';

/**
 * Server configurations
 * List of available MCP servers and their configurations
 */
const config: ServerConfig[] = [
  {
    name: "youtube-transcript",
    type: "command",
    command: "npx",
    args: ["-y", "@sinco-lab/mcp-youtube-transcript"],
    isOpen: true
  },
  {
    name: "mcp-server-firecrawl",
    type: "command",
    command: "node",
    args: ["~/Research/mcp/firecrawl-mcp-server/dist/index.js"],
    env: {
      "FIRECRAWL_API_URL": "http://192.168.0.106:3002",
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    },
    isOpen: false
  },
  {
    name: "evm-mcp-server",
    type: "command",
    command: "npx",
    args: ["-y", "@sinco-lab/evm-mcp-server"],
    env: {
      "WALLET_PRIVATE_KEY": process.env.WALLET_PRIVATE_KEY as string,
      "RPC_PROVIDER_URL": process.env.RPC_PROVIDER_URL as string
    },
    isOpen: true,
    sendResultToAI: true
  }
];

export default config; 