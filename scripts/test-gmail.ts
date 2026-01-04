import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);

function getArg(name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) return null;
  return argv[index + 1] ?? null;
}

const shouldDraft = argv.includes("--draft");
const maxResults = Number(getArg("--max") || 5);
const to = getArg("--to");
const subject = getArg("--subject") || "Test reply";
const body = getArg("--body") || "Hello from MCP test script.";
const threadId = getArg("--thread");

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

async function main() {
  await loadSecrets();
  if (!process.env.GOOGLE_ACCESS_TOKEN) {
    throw new Error(
      "Missing GOOGLE_ACCESS_TOKEN. Add it to secrets.env or export it before running."
    );
  }
  const client = new Client(
    { name: "gmail-test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--loader", "tsx", serverPath],
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

  if (shouldDraft) {
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
    console.log("Draft result:", JSON.stringify(result, null, 2));
  } else {
    console.log("Fetching unread messages...");
    const result = await client.callTool({
      name: "gmail_get_unread",
      arguments: {
        maxResults,
      },
    });
    console.log("Unread result:", JSON.stringify(result, null, 2));
  }

  await transport.close();
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
