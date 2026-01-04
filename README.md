# Email MCP Server

This repository is a basic example of an MCP server configured for tool calls to the Gmail API, for reading and writing emails.

## Setup

1. Clone the repo locally and run `npm install` to fetch the dependencies
2. Create a Google Cloud Project, configuring API credentials, scopes, and adding yourself as a test user
3. Write the following into a local `secrets.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ACCESS_TOKEN`
4. See `claudeconfig.json` and include this in your local `claude_desktop_config.json` file (uses `node --import tsx`)

## Usage

Once all of the above is configured you should be able to prompt claude with something along the lines of "What tools do you have available", and his answer should include the tools defined in this MCP server. You can then call tools via the chat, and query the LLM for further guidance.

OAuth tools are available for getting an auth URL and exchanging a code for tokens.

## Example Usage
