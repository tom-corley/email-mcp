import {
    base64UrlEncode,
    base64UrlDecode,
    decodeHtmlEntities,
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
        name: "get_unread_emails",
        description: "List unread Gmail messages with sender, subject, snippet, and IDs",
        inputSchema: {
            type: "object",
            properties: {
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
        name: "create_draft_reply",
        description: "Create a draft reply to a message ID with plain text content",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", default: "me" },
                messageId: { type: "string" },
                body: { type: "string" },
            },
            required: ["messageId", "body"],
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
        headers?: Array<{ name?: string; value?: string }>;
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

    function getHeaderValue(payload: GmailPart | undefined, headerName: string) {
        const headers = payload?.headers;
        if (!Array.isArray(headers)) return undefined;
        const match = headers.find(
            (header) =>
                header?.name?.toLowerCase() === headerName.toLowerCase()
        );
        return match?.value;
    }

    function buildReplyMime(headers: {
        to: string;
        subject: string;
        inReplyTo?: string;
        references?: string;
        body: string;
    }) {
        const lines = [
            `To: ${headers.to}`,
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
            `Subject: ${headers.subject}`,
        ];
        if (headers.inReplyTo) {
            lines.push(`In-Reply-To: ${headers.inReplyTo}`);
        }
        if (headers.references) {
            lines.push(`References: ${headers.references}`);
        }
        lines.push("", headers.body);
        return lines.join("\r\n");
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

    if (name === "get_unread_emails") {
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
                const payload = messageData.payload as GmailPart | undefined;
                const decodedText = extractPlainText(payload);
                const from = getHeaderValue(payload, "From");
                const subject = getHeaderValue(payload, "Subject");
                results.push({
                    id: messageData.id,
                    threadId: messageData.threadId,
                    from,
                    subject,
                    snippet: messageData.snippet,
                    text: decodedText,
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

    if (name === "create_draft_reply") {
        const accessToken = getAccessToken();
        if (!accessToken) {
            return errorResult(getAuthHelpText(), envStatus);
        }
        const userId = getString(args.userId) || "me";
        const body = getString(args.body);
        const messageId = getString(args.messageId);
        if (!messageId || !body) {
            return errorResult("Missing required fields: messageId, body.", envStatus);
        }
        try {
            const messageUrl = new URL(
                `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
                    userId
                )}/messages/${encodeURIComponent(messageId)}`
            );
            messageUrl.searchParams.set("format", "metadata");
            messageUrl.searchParams.set(
                "metadataHeaders",
                ["From", "Reply-To", "Subject", "Message-ID", "References"].join(",")
            );
            const original = await fetchJson(messageUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const originalData = original as {
                threadId?: string;
                payload?: unknown;
            };
            const payload = originalData.payload as GmailPart | undefined;
            const replyTo =
                getHeaderValue(payload, "Reply-To") ||
                getHeaderValue(payload, "From");
            if (!replyTo) {
                return errorResult("Could not determine reply recipient.", envStatus);
            }
            const originalSubject = getHeaderValue(payload, "Subject") || "";
            const subject = originalSubject.toLowerCase().startsWith("re:")
                ? originalSubject
                : `Re: ${originalSubject}`.trim();
            const messageIdHeader = getHeaderValue(payload, "Message-ID");
            const references = getHeaderValue(payload, "References");
            const combinedReferences = messageIdHeader
                ? [references, messageIdHeader].filter(Boolean).join(" ")
                : references;
            const replyHeaders: {
                to: string;
                subject: string;
                inReplyTo?: string;
                references?: string;
                body: string;
            } = {
                to: replyTo,
                subject,
                body,
            };
            if (messageIdHeader) {
                replyHeaders.inReplyTo = messageIdHeader;
            }
            if (combinedReferences) {
                replyHeaders.references = combinedReferences;
            }
            const mime = buildReplyMime(replyHeaders);
            const draftPayload: { message: { raw: string; threadId?: string } } = {
                message: {
                    raw: base64UrlEncode(mime),
                },
            };
            if (originalData.threadId) {
                draftPayload.message.threadId = originalData.threadId;
            }
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
                    body: JSON.stringify(draftPayload),
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
