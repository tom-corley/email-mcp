import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types/index.js";

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
        tools: [
            {
                name: "get_time",
                description: "Gets the current time",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_time") {
        return {
            content: [
                {
                    type: "text",
                    text: `Current time: ${new Date().toISOString()}`,
                },
            ],
        };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});

// Test
