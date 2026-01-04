import { readFile } from "node:fs/promises";
import { getString } from "./utils.js";

const SECRETS_PATH = new URL("../secrets.env", import.meta.url);

export async function loadSecrets() {
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

export function getClientCredentials() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error(
            "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Add them to secrets.env."
        );
    }
    return { clientId, clientSecret };
}

export function getAccessToken(args: Record<string, unknown>): string | undefined {
    return getString(args.accessToken) || process.env.GOOGLE_ACCESS_TOKEN;
}
