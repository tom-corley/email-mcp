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

## Test script

List unread messages:
```
npm run test:gmail -- --max 10
```

Create a draft:
```
npm run test:gmail -- --draft --to you@example.com --subject "Hello" --body "Hi there"
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
