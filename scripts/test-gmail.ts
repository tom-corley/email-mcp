import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "node:fs/promises";
import { getAuthHelpText } from "../src/auth.js";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);

function getArg(name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) return null;
  return argv[index + 1] ?? null;
}

const shouldDraft = argv.includes("--draft");
const shouldAuthUrl = argv.includes("--auth-url");
const shouldExchangeCode = argv.includes("--exchange-code");
const shouldRefreshToken = argv.includes("--refresh-token");
const maxResults = Number(getArg("--max") || 5);
const to = getArg("--to");
const subject = getArg("--subject") || "Test reply";
const body = getArg("--body") || "Hello from MCP test script.";
const threadId = getArg("--thread");
const redirectUri = getArg("--redirect-uri");
const code = getArg("--code");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const serverPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

async function loadSecrets() {
  try {
    const raw = await readFile(
      new URL("../secrets.env", import.meta.url),
      "utf8"
    );
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!key || rest.length === 0) continue;
      const value = rest.join("=").trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional secrets file; ignore if missing.
  }
}

function isTextContent(
    content: unknown
): content is { type: "text"; text: string } {
    return (
        typeof content === "object" &&
        content !== null &&
        (content as { type?: unknown }).type === "text" &&
        typeof (content as { text?: unknown }).text === "string"
    );
}

function logToolResult(label: string, result: unknown) {
    if (!result || typeof result !== "object") {
        console.log(label, result);
        return;
    }
    const content = Array.isArray((result as { content?: unknown }).content)
        ? ((result as { content?: unknown }).content as unknown[])[0]
        : null;
    if (isTextContent(content)) {
        console.log(label, content.text);
        return;
    }
    console.log(label, JSON.stringify(result, null, 2));
}

async function main() {
    await loadSecrets();
    const client = new Client(
        { name: "gmail-test-client", version: "1.0.0" },
        { capabilities: {} }
    );
    const transport = new StdioClientTransport({
        command: "node",
        args: ["--import", "tsx", serverPath],
        stderr: "inherit",
        cwd: projectRoot,
    });

  console.log("Connecting to MCP server...");
  await client.connect(transport);
  console.log("Connected.");

  const tools = await client.listTools();
    console.log(
        "Available tools:",
        tools.tools.map((tool) => tool.name).join(", ") || "(none)"
    );

    if (shouldAuthUrl) {
        if (!redirectUri) {
            throw new Error("Missing --redirect-uri for auth URL.");
        }
        console.log("Requesting auth URL...");
        const result = await client.callTool({
            name: "gmail_get_auth_url",
            arguments: {
                redirectUri,
            },
        });
        logToolResult("Auth URL:", result);
    } else if (shouldExchangeCode) {
        if (!code || !redirectUri) {
            throw new Error("Missing --code or --redirect-uri for exchange.");
        }
        console.log("Exchanging auth code...");
        const result = await client.callTool({
            name: "gmail_exchange_code",
            arguments: {
                code,
                redirectUri,
            },
        });
        logToolResult("Exchange result:", result);
    } else if (shouldRefreshToken) {
        console.log("Refreshing access token...");
        const result = await client.callTool({
            name: "gmail_refresh_access_token",
        });
        logToolResult("Refresh result:", result);
    } else if (shouldDraft) {
        if (!process.env.GOOGLE_ACCESS_TOKEN) {
            throw new Error(getAuthHelpText());
        }
        if (!to) {
            throw new Error("Missing --to for draft creation.");
        }
        console.log("Creating draft...");
        const result = await client.callTool({
            name: "gmail_create_draft",
            arguments: {
                to,
                subject,
                body,
                threadId: threadId || undefined,
            },
        });
        logToolResult("Draft result:", result);
    } else {
        if (!process.env.GOOGLE_ACCESS_TOKEN) {
            throw new Error(getAuthHelpText());
        }
        console.log("Fetching unread messages...");
        const result = await client.callTool({
            name: "gmail_get_unread",
            arguments: {
                maxResults,
            },
        });
        logToolResult("Unread result:", result);
  }

  await transport.close();
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
