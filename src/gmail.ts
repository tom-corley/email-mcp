import {
    base64UrlEncode,
    base64UrlDecode,
    decodeHtmlEntities,
    buildPlainTextEmail,
    fetchJson,
    getNumber,
    getString,
} from "./utils.js";
import { getAccessToken, getAuthEnvStatus, getClientCredentials } from "./secrets.js";
import { getAuthHelpText } from "./auth.js";

type ToolResult = {
    content: Array<{ type: "text"; text: string }>;
};

function errorResult(message: string, details?: Record<string, unknown>): ToolResult {
    const payload = {
        error: message,
        details,
    };
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(payload),
            },
        ],
    };
}

function authHelp(): ToolResult {
    return {
        content: [
            {
                type: "text",
                text: getAuthHelpText(),
            },
        ],
    };
}

export const gmailTools = [
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
            required: [],
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
] as const;

export async function handleGmailTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult | null> {
    const envStatus = getAuthEnvStatus();

    type GmailPart = {
        mimeType?: string;
        body?: { data?: string };
        parts?: unknown[];
    };

    function isGmailPart(value: unknown): value is GmailPart {
        return typeof value === "object" && value !== null;
    }

    function extractPlainText(payload: unknown): string | null {
        if (!payload || typeof payload !== "object") return null;
        const data = payload as GmailPart;
        if (data.body?.data) {
            return decodeHtmlEntities(base64UrlDecode(data.body.data));
        }
        const queue: unknown[] = Array.isArray(data.parts) ? [...data.parts] : [];
        while (queue.length > 0) {
            const part = queue.shift();
            if (!isGmailPart(part)) continue;
            const partData = part;
            if (partData.mimeType === "text/plain" && partData.body?.data) {
                return decodeHtmlEntities(base64UrlDecode(partData.body.data));
            }
            if (Array.isArray(partData.parts)) {
                queue.push(...partData.parts);
            }
        }
        return null;
    }

    if (name === "gmail_get_auth_url") {
        const redirectUri =
            process.env.GOOGLE_REDIRECT_URI || getString(args.redirectUri);
        if (!redirectUri) {
            return errorResult(
                "Missing redirectUri. Pass redirectUri or set GOOGLE_REDIRECT_URI in secrets.env.",
                envStatus
            );
        }
        let clientId: string;
        try {
            ({ clientId } = getClientCredentials());
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Missing client credentials.",
                envStatus
            );
        }
        const scopes = Array.isArray(args.scope)
            ? args.scope.filter((scope): scope is string => typeof scope === "string")
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
        if (
            prompt === "consent" ||
            prompt === "none" ||
            prompt === "select_account"
        ) {
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

    if (name === "gmail_exchange_code") {
        const code = getString(args.code);
        const redirectUri = getString(args.redirectUri);
        if (!code || !redirectUri) {
            return errorResult("Missing code or redirectUri.", envStatus);
        }
        let clientId: string;
        let clientSecret: string;
        try {
            ({ clientId, clientSecret } = getClientCredentials());
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Missing client credentials.",
                envStatus
            );
        }
        const body = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        });
        try {
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
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Failed to exchange code.",
                envStatus
            );
        }
    }

    if (name === "gmail_refresh_access_token") {
        const refreshToken =
            getString(args.refreshToken) || process.env.GOOGLE_REFRESH_TOKEN;
        if (!refreshToken) {
            return errorResult(
                "Missing refresh token. Set GOOGLE_REFRESH_TOKEN or pass refreshToken.",
                envStatus
            );
        }
        let clientId: string;
        let clientSecret: string;
        try {
            ({ clientId, clientSecret } = getClientCredentials());
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Missing client credentials.",
                envStatus
            );
        }
        const body = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
        });
        try {
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
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Failed to refresh token.",
                envStatus
            );
        }
    }

    if (name === "gmail_get_unread") {
        const accessToken = getAccessToken();
        if (!accessToken) {
            return errorResult(getAuthHelpText(), envStatus);
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
        try {
            const listData = await fetchJson(listUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const messages = (listData as { messages?: Array<{ id: string }> })
                ?.messages || [];
            const results = [];
            for (const message of messages) {
                const messageUrl = new URL(
                    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                        userId
                    )}/messages/${encodeURIComponent(message.id)}`
                );
                messageUrl.searchParams.set("format", "full");
                const data = await fetchJson(messageUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                const messageData = data as {
                    id: string;
                    threadId?: string;
                    snippet?: string;
                    payload?: unknown;
                };
                const decodedText = extractPlainText(messageData.payload);
                results.push({
                    id: messageData.id,
                    threadId: messageData.threadId,
                    snippet: messageData.snippet,
                    text: decodedText,
                    payload: messageData.payload,
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
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Failed to fetch messages.",
                envStatus
            );
        }
    }

    if (name === "gmail_create_draft") {
        const accessToken = getAccessToken();
        if (!accessToken) {
            return errorResult(getAuthHelpText(), envStatus);
        }
        const userId = getString(args.userId) || "me";
        const to = getString(args.to);
        const subject = getString(args.subject);
        const body = getString(args.body);
        const threadId = getString(args.threadId);
        if (!to || !subject || !body) {
            return errorResult("Missing required fields: to, subject, body.", envStatus);
        }
        const mime = buildPlainTextEmail({ to, subject, body });
        const payload: { message: { raw: string; threadId?: string } } = {
            message: {
                raw: base64UrlEncode(mime),
            },
        };
        if (threadId) payload.message.threadId = threadId;
        try {
            const data = await fetchJson(
                `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                    userId
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
        } catch (error) {
            return errorResult(
                error instanceof Error ? error.message : "Failed to create draft.",
                envStatus
            );
        }
    }

    return null;
}
