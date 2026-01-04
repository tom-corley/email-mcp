export function getString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/\\+$/, "");
}

export function getNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function fetchJson(url: string | URL, options: RequestInit) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data: unknown = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }
    }
    if (!response.ok) {
        const error = data as {
            error?: { message?: string };
            error_description?: string;
        };
        const message =
            error?.error?.message ||
            error?.error_description ||
            `Request failed with status ${response.status}`;
        throw new Error(message);
    }
    return data;
}

export function base64UrlEncode(input: string) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

export function buildPlainTextEmail({
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
