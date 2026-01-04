export function getAuthHelpText() {
    return (
        "Missing access token. Use gmail_get_auth_url to get an authorization URL, " +
        "then gmail_exchange_code to obtain tokens. Alternatively, pass accessToken " +
        "or set GOOGLE_ACCESS_TOKEN in secrets.env."
    );
}
