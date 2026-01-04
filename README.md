# Email MCP Server

This repository is a basic example of an MCP server configured for tool calls to the Gmail API, for reading and writing emails.

## Setup

1. Clone the repo locally and run `npm install` to fetch the dependencies.
2. In Google Cloud Console:
   - Enable the Gmail API for your project.
   - Configure the OAuth consent screen and add yourself as a test user.
   - Create an OAuth Client ID of type **Web application**.
   - Add an authorized redirect URI, for example:
     `http://localhost:3000/oauth2callback`
3. Create a local `secrets.env` with:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (should match the authorized redirect URI exactly)
   - `GOOGLE_ACCESS_TOKEN` (added after OAuth exchange)
   - `GOOGLE_REFRESH_TOKEN` (optional but recommended)
4. See `claudeconfig.json` and include it in your local
   `claude_desktop_config.json` file (uses `node --import tsx`).

Example `claude_desktop_config.json` entry:
```
{
  "mcpServers": {
    "email-mcp": {
      "command": "node",
      "args": [
        "--import",
        "/absolute/path/to/email-mcp/node_modules/tsx/dist/esm/index.mjs",
        "/absolute/path/to/email-mcp/src/index.ts"
      ]
    }
  }
}
```

## OAuth flow (get access + refresh tokens)

1. Generate the auth URL (uses `GOOGLE_REDIRECT_URI` if set):
   ```
   npm run test:gmail -- --auth-url
   ```
   Or pass a redirect URI explicitly:
   ```
   npm run test:gmail -- --auth-url --redirect-uri http://localhost:3000/oauth2callback
   ```
2. Open the URL, approve access, and copy the `code` from the browser address bar.
3. Exchange the code for tokens:
   ```
   npm run test:gmail -- --exchange-code --code YOUR_CODE --redirect-uri http://localhost:3000/oauth2callback
   ```
4. Save the tokens to `secrets.env`:
   ```
   GOOGLE_ACCESS_TOKEN=...
   GOOGLE_REFRESH_TOKEN=...
   ```

## Usage

Once all of the above is configured you should be able to prompt Claude with something like "What tools do you have available". The response should include the tools defined in this MCP server. You can then call tools via chat.

## Tools

- `get_unread_emails`: returns sender, subject, snippet, body (plain text when available), and email/thread IDs
- `create_draft_reply`: creates a correctly threaded draft reply given a `messageId` and reply body
- OAuth helpers: `gmail_get_auth_url`, `gmail_exchange_code`, `gmail_refresh_access_token`

## Test script

List unread messages:
```
npm run test:gmail -- --max 10
```

Create a draft reply (use a `messageId` from the unread list):
```
npm run test:gmail -- --draft --message-id MESSAGE_ID --body "Hi there"
```

Refresh an access token:
```
npm run test:gmail -- --refresh-token
```

## Troubleshooting

- `redirect_uri_mismatch`:
  Ensure the `redirect_uri` in the auth URL exactly matches the authorized
  redirect URI in Google Cloud Console (scheme, host, port, and path).
- `Missing access token`:
  Add `GOOGLE_ACCESS_TOKEN` to `secrets.env` or run the OAuth flow above.

## Example prompts (Claude Desktop)

- "List my unread emails."
- "Draft a reply to the latest unread email: thanks, I will get back to you tomorrow."

## Screenshots

Add screenshots of:
- Claude listing unread emails
- Claude creating a draft reply

Store them in a `docs/screenshots/` folder and reference them here.
