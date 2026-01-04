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

export function base64UrlDecode(input: string) {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
}

export function decodeHtmlEntities(input: string) {
    const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: "\"",
        apos: "'",
        nbsp: " ",
    };
    return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
        if (entity[0] === "#") {
            const isHex = entity[1] === "x" || entity[1] === "X";
            const num = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
            if (Number.isFinite(num)) {
                try {
                    return String.fromCodePoint(num);
                } catch {
                    return match;
                }
            }
            return match;
        }
        return named[entity] ?? match;
    });
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
