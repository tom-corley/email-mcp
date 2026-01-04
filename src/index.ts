import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";

const SECRETS_PATH = new URL("../secrets.env", import.meta.url);

async function loadSecrets() {
    try {
        const raw = await readFile(SECRETS_PATH, "utf8");
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

function getString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/\\+$/, "");
}
function getNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getClientCredentials() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error(
            "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Add them to secrets.env."
        );
    }
    return { clientId, clientSecret };
}

function getAccessToken(args: Record<string, unknown>): string | undefined {
    return getString(args.accessToken) || process.env.GOOGLE_ACCESS_TOKEN;
}

async function fetchJson(url: string | URL, options: RequestInit) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
    }
    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.error_description ||
            `Request failed with status ${response.status}`;
        throw new Error(message);
    }
    return data;
}

function base64UrlEncode(input: string) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function buildPlainTextEmail({
    to,
    subject,
    body,
}: {
    to: string;
    subject: string;
    body: string;
}) {
    const lines = [
        `To: ${to}`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        `Subject: ${subject}`,
        "",
        body,
    ];
    return lines.join("\r\n");
}

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
            {
                name: "gmail_get_unread",
                description: "List unread Gmail messages with basic metadata",
                inputSchema: {
                    type: "object",
                    properties: {
                        accessToken: { type: "string" },
                        userId: { type: "string", default: "me" },
                        maxResults: { type: "number", default: 10 },
                    },
                    required: [],
                },
            },
            {
                name: "gmail_get_auth_url",
                description: "Create a Google OAuth URL for Gmail access",
                inputSchema: {
                    type: "object",
                    properties: {
                        redirectUri: { type: "string" },
                        scope: {
                            type: "array",
                            items: { type: "string" },
                            default: ["https://www.googleapis.com/auth/gmail.readonly"],
                        },
                        accessType: {
                            type: "string",
                            enum: ["online", "offline"],
                            default: "offline",
                        },
                        prompt: {
                            type: "string",
                            enum: ["consent", "none", "select_account"],
                            default: "consent",
                        },
                    },
                    required: ["redirectUri"],
                },
            },
            {
                name: "gmail_exchange_code",
                description: "Exchange an OAuth authorization code for tokens",
                inputSchema: {
                    type: "object",
                    properties: {
                        code: { type: "string" },
                        redirectUri: { type: "string" },
                    },
                    required: ["code", "redirectUri"],
                },
            },
            {
                name: "gmail_refresh_access_token",
                description: "Exchange a refresh token for a new access token",
                inputSchema: {
                    type: "object",
                    properties: {
                        refreshToken: { type: "string" },
                    },
                    required: [],
                },
            },
            {
                name: "gmail_create_draft",
                description: "Create a draft reply with plain text content",
                inputSchema: {
                    type: "object",
                    properties: {
                        accessToken: { type: "string" },
                        userId: { type: "string", default: "me" },
                        to: { type: "string" },
                        subject: { type: "string" },
                        body: { type: "string" },
                        threadId: { type: "string" },
                    },
                    required: ["to", "subject", "body"],
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
                    text: `Current time: ${new Date().toISOString()} and the secret word is "Cryptic"`,
                },
            ],
        };
    }
    if (request.params.name === "gmail_get_auth_url") {
        const args = request.params.arguments ?? {};
        const redirectUri = getString(args.redirectUri);
        if (!redirectUri) {
            throw new Error("Missing redirectUri.");
        }
        const { clientId } = getClientCredentials();
        const scopes = Array.isArray(args.scope)
            ? args.scope.filter((scope) => typeof scope === "string")
            : [];
        const accessType =
            getString(args.accessType) === "online" ? "online" : "offline";
        const prompt = getString(args.prompt);
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set(
            "scope",
            scopes.length > 0
                ? scopes.join(" ")
                : "https://www.googleapis.com/auth/gmail.readonly"
        );
        authUrl.searchParams.set("access_type", accessType);
        if (prompt === "consent" || prompt === "none" || prompt === "select_account") {
            authUrl.searchParams.set("prompt", prompt);
        }
        return {
            content: [
                {
                    type: "text",
                    text: authUrl.toString(),
                },
            ],
        };
    }
    if (request.params.name === "gmail_exchange_code") {
        const args = request.params.arguments ?? {};
        const code = getString(args.code);
        const redirectUri = getString(args.redirectUri);
        if (!code || !redirectUri) {
            throw new Error("Missing code or redirectUri.");
        }
        const { clientId, clientSecret } = getClientCredentials();
        const body = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        });
        const data = await fetchJson("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data),
                },
            ],
        };
    }
    if (request.params.name === "gmail_refresh_access_token") {
        const args = request.params.arguments ?? {};
        const refreshToken =
            getString(args.refreshToken) || process.env.GOOGLE_REFRESH_TOKEN;
        if (!refreshToken) {
            throw new Error(
                "Missing refresh token. Set GOOGLE_REFRESH_TOKEN or pass refreshToken."
            );
        }
        const { clientId, clientSecret } = getClientCredentials();
        const body = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
        });
        const data = await fetchJson("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data),
                },
            ],
        };
    }
    if (request.params.name === "gmail_get_unread") {
        const args = request.params.arguments ?? {};
        const accessToken = getAccessToken(args);
        if (!accessToken) {
            throw new Error("Missing access token. Set GOOGLE_ACCESS_TOKEN or pass accessToken.");
        }
        const userId = getString(args.userId) || "me";
        const maxResults = getNumber(args.maxResults) ?? 10;
        const listUrl = new URL(
            `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                userId
            )}/messages`
        );
        listUrl.searchParams.set("q", "is:unread");
        listUrl.searchParams.set("maxResults", String(maxResults));
        const listData = await fetchJson(listUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const messages = listData?.messages || [];
        const results = [];
        for (const message of messages) {
            const messageUrl = new URL(
                `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                    userId || "me"
                )}/messages/${encodeURIComponent(message.id)}`
            );
            messageUrl.searchParams.set("format", "metadata");
            messageUrl.searchParams.set(
                "metadataHeaders",
                ["From", "To", "Subject", "Date"].join(",")
            );
            const data = await fetchJson(messageUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            results.push({
                id: data.id,
                threadId: data.threadId,
                snippet: data.snippet,
                payload: data.payload,
            });
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ messages: results }),
                },
            ],
        };
    }
    if (request.params.name === "gmail_create_draft") {
        const args = request.params.arguments ?? {};
        const accessToken = getAccessToken(args);
        if (!accessToken) {
            throw new Error("Missing access token. Set GOOGLE_ACCESS_TOKEN or pass accessToken.");
        }
        const userId = getString(args.userId) || "me";
        const to = getString(args.to);
        const subject = getString(args.subject);
        const body = getString(args.body);
        const threadId = getString(args.threadId);
        if (!to || !subject || !body) {
            throw new Error("Missing required fields: to, subject, body.");
        }
        const mime = buildPlainTextEmail({ to, subject, body });
        const payload: { message: { raw: string; threadId?: string } } = {
            message: {
                raw: base64UrlEncode(mime),
            },
        };
        if (threadId) payload.message.threadId = threadId;
        const data = await fetchJson(
            `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                userId || "me"
            )}/drafts`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data),
                },
            ],
        };
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

// Test
