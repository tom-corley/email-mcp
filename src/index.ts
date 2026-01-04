import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { gmailTools, handleGmailTool } from "./gmail.js";
import { loadSecrets } from "./secrets.js";

const tools = [
    {
        name: "get_time",
        description: "Gets the current time",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    ...gmailTools,
];

// Create server instance
const server = new Server(
    {
        name: "my-mcp-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define your tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools,
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_time") {
        return {
            content: [
                {
                    type: "text",
                    text: `Current time: ${new Date().toISOString()} and the secret word is "Cryptic"`,
                },
            ],
        };
    }

    const args = request.params.arguments ?? {};
    const gmailResult = await handleGmailTool(request.params.name, args);
    if (gmailResult) {
        return gmailResult;
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start the server
async function main() {
    await loadSecrets();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
