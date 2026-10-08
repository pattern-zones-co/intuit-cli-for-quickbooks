# Intuit QuickBooks CLI

A command-line interface for the QuickBooks Online API. Designed for developer keystrokes and AI agent runtimes alike — every command emits structured JSON, OAuth refreshes silently, rate limits retry automatically, and errors carry trace IDs.

## Overview

- **17 entity types** — customers, vendors, invoices, estimates, payments, bills, bill payments, sales receipts, credit memos, deposits, purchases, items, accounts, employees, plus IES Premium APIs (projects, custom fields, dimensions)
- **OAuth 2.0** with encrypted token storage, silent refresh, and multi-realm profiles
- **Verb-noun grammar** — `intuit <entity> <verb> [args]` — predictable and scriptable
- **Agent-grade write safety** — `--dry-run` previews and `--idempotency-tag` audit markers
- **Built-in webhooks** — local listener with signature verification and event replay
- **Resilient** — 429s and 5xx retried with exponential backoff; full `--debug` request/response logging

## Installation

```bash
npm install -g intuit-cli
```

Or run without installing:

```bash
npx intuit-cli --help
```

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/intuit/intuit-cli-for-quickbooks.git
cd intuit-cli-for-quickbooks
npm install
npm run build
npm link
```
</details>

## Prerequisites

- Node.js 18+
- An Intuit Developer app with OAuth 2.0 credentials ([create one](https://developer.intuit.com/app/developer/dashboard))
- Redirect URI configured in app settings:
  - **Sandbox:** `http://localhost:9477/callback`
  - **Production:** A registered HTTPS URL (localhost not supported)

## Quick start

```bash
intuit auth configure                  # interactive credential setup
intuit auth login --env sandbox        # opens browser for OAuth
intuit auth status                     # verify connection
intuit customers list --json           # first call
```

## Configuration

Use `intuit auth configure` for interactive setup of credentials.

Credentials and Premium scope opt-in live in `.env`:

```
# Required: OAuth credentials from developer.intuit.com
INTUIT_SANDBOX_CLIENT_ID=...
INTUIT_SANDBOX_CLIENT_SECRET=...
INTUIT_PROD_CLIENT_ID=...
INTUIT_PROD_CLIENT_SECRET=...

# Optional: Premium API scopes (only if your app has Premium approval)
INTUIT_SANDBOX_PREMIUM_SCOPES=project-management.project app-foundations.custom-field-definitions
INTUIT_PROD_PREMIUM_SCOPES=
```

See [`.env.example`](.env.example) for the full list. 

### Profiles

Each connection is a named **profile**. The first login creates `default` automatically.

```bash
intuit auth login --profile client-a --env sandbox
intuit auth login --profile prod --env production --redirect-uri https://yourapp.com/callback
intuit profile list
intuit profile switch client-a
intuit customers list --profile client-b       # one-off override
```

## How OAuth works

The CLI uses OAuth 2.0 to connect to a QuickBooks company on your behalf. The full flow happens once, then access tokens auto-refresh silently for up to 101 days.

### The flow at a glance

```
1. intuit auth login          ──► starts local listener on localhost:9477
2. Browser opens              ──► Intuit authorization URL
3. You sign in + pick a company
4. Intuit redirects back      ──► localhost:9477/callback?code=...&realmId=...
5. CLI exchanges code for tokens (access + refresh)
6. Tokens encrypted and stored at ~/.config/intuit-cli/
```

Steps 1-5 happen interactively. Every subsequent CLI call auto-refreshes the access token as needed using the refresh token — no further browser interaction until the refresh token expires.

### Tokens

| Token | Lifetime | Auto-refreshes? |
|---|---|---|
| Access token | 1 hour | Yes, by the CLI on next API call |
| Refresh token | 101 days from issue | No — re-run `intuit auth login` when it expires |

Tokens are encrypted with AES-256-GCM. Each profile's key lives in its own key file, `~/.config/intuit-cli/<profile>.key`, separate from the token file. Both are written with `0600` permissions, and token writes are atomic. If the key file is lost or doesn't match, commands fail with an error naming both files; run `auth login` again to start over.

### Picking a QuickBooks company

Each OAuth flow connects to **one company** (the "realm"). On the Intuit authorization screen, you select which QuickBooks company to connect — the realm ID for that company is recorded in your profile. To connect a different company, use a different profile name and re-run `auth login`:

```bash
intuit auth login --profile company-a --env sandbox
intuit auth login --profile company-b --env sandbox
intuit profile list   # shows both, with realm IDs
```

### Sandbox vs production

- **Sandbox** apps can use `http://localhost:9477/callback` as the redirect URI — convenient for development, and the CLI's local listener handles the callback automatically.
- **Production** apps must use a **registered HTTPS URL** in your app settings (e.g. `https://yourapp.com/callback`). Intuit rejects `localhost` URLs for production. Pass the URL with `--redirect-uri` at login.

### Scopes — what the app is allowed to do

Apps declare which scopes they need at developer.intuit.com. The CLI requests the standard accounting scope (`com.intuit.quickbooks.accounting`) and OpenID by default — enough for the 14 core entity types.

**Premium APIs** (Projects, Custom Fields, Dimensions) require additional scopes that your app must be **approved for** by Intuit. Set them in `.env` (see Configuration above) only after approval. Requesting unapproved scopes causes `auth login` to fail with an OAuth error.

### When `auth login` fails

Common causes:

- **Credentials wrong in `.env`** — Client ID or Secret doesn't match the app at developer.intuit.com
- **Redirect URI mismatch** — your app settings don't include `http://localhost:9477/callback` (sandbox) or your production HTTPS URL
- **Requested Premium scopes your app isn't approved for** — clear `INTUIT_<env>_PREMIUM_SCOPES` and re-login

### When you'll need to re-login

- Refresh token expired (101 days since issue)
- You ran `intuit auth logout` or `profile remove`
- You changed credentials in `.env`
- You added a Premium scope to `.env` and need a new token with that scope granted

## Commands

The grammar is `intuit <noun> <verb> [args] [flags]`. List commands support `--where`, `--order-by`, `--limit`, `--all`, `--json`, `--csv`. Create commands support `--dry-run` and `--idempotency-tag` on supported entities.

```bash
# Browse with filters
intuit customers list --where "Balance > 0" --order-by "DisplayName ASC" --json
intuit invoices list --all --csv > invoices.csv

# Inspect a single entity
intuit invoices get 123 --json

# Write — inline flags or --file for full payloads (see examples/)
intuit customers create --display-name "Acme Corp" --email a@b.com
intuit invoices create --file examples/invoice.json --idempotency-tag run-b3a7

# Update is sparse — only the fields you supply change
intuit customers update 42 --email new@acme.com

# Void (accounting-correct, zeroes balance) vs delete (permanent)
intuit invoices void 123
intuit invoices delete 123

# Raw QBO query
intuit query "SELECT * FROM Customer MAXRESULTS 10"

# Debug any command — full HTTP request/response logging
intuit customers list --debug
```

### Command reference

| Command | Description |
|---------|-------------|
| **Auth & profiles** | |
| `auth configure` | Set up OAuth credentials interactively |
| `auth login` | Authenticate with QuickBooks (`--profile`, `--env`, `--redirect-uri`) |
| `auth status` | Check token status, scopes, and config provenance |
| `auth refresh` | Manually refresh access token |
| `auth logout` | Clear tokens and remove profile |
| `profile list/switch/remove` | Manage profiles |
| **Entities** | All support `get <id>`. List commands support `--where`, `--order-by`, `--limit`, `--all`, `--json`, `--csv` |
| `customers list/get/create/update` | Customers |
| `vendors list/get/create/update` | Vendors |
| `invoices list/get/create/update/void/delete` | Invoices |
| `estimates list/get/create/update/delete` | Estimates |
| `payments list/get/create/update/void/delete` | Customer payments |
| `salesreceipts list/get/create/update/delete` | Sales receipts |
| `creditmemos list/get/create/update/delete` | Credit memos |
| `bills list/get/create/delete` | Bills |
| `billpayments list/get/create/update/delete` | Bill payments |
| `purchases list/get/create/update/delete` | Purchases/expenses |
| `deposits list/get/create/update/delete` | Deposits |
| `employees list/get/create/update` | Employees |
| `items list/get/create/update` | Items (products/services) |
| `accounts list/get` | Chart of accounts |
| `company info/preferences` | Company details |
| **Premium APIs (IES)** | Requires Premium scope; see Configuration above |
| `projects list/get/create/update/delete/attach` | Project management |
| `custom-fields list/create/update/attach` | Custom field definitions |
| `dimensions list/values/attach` | Custom dimensions |
| **Webhooks** | |
| `webhooks guide/listen/replay` | Webhook development tools |
| **Other** | |
| `query <statement>` | Run a raw QBO query |
| `completions bash/zsh` | Generate shell completions |

**Global flags:** `--debug`, `--help`, `--version`

Use `--help` on any command: `intuit invoices create --help`. Sample JSON payloads live in [`examples/`](examples/). Shell completion scripts are available via `intuit completions bash` / `zsh`.

## For AI agents

The CLI is usable as an agent tool surface as-is — pipe `intuit ...` into any agent runtime (Claude Agent SDK, OpenAI Agents, LangChain, MCP host, or shell). No SDK to learn beyond the CLI grammar.

### Write safety

Every create command supports `--dry-run` (preview without sending) and `--idempotency-tag <run-id>` (writes a marker into entity Notes for audit traceability):

```bash
intuit customers create --display-name "Acme" --dry-run --idempotency-tag run-b3a7
# Prints request body, no write

intuit customers create --display-name "Acme" --idempotency-tag run-b3a7
# Created customer [42] Acme   ← Notes tagged "[via Intuit CLI · run run-b3a7]"
```

After the run, search QBO for `[via Intuit CLI · run <id>]` to find every entity an agent created.

### Error handling

Every error is human-formatted on stderr and includes an `intuit_tid` trace ID. Exit code is `1` for any failure.

| Status | Meaning | Action |
|---|---|---|
| `401 Unauthorized` | Token expired and refresh failed | `intuit auth login` |
| `403 Forbidden` | Missing OAuth scope | Check app scopes at developer.intuit.com |
| `404 Not Found` | Entity ID doesn't exist on this realm | Verify with `intuit query` |
| `429 Too Many Requests` | Rate limited | CLI retries automatically with backoff |
| `400` + `Fault.Error` | Validation failure | Error message identifies the bad field |

### Event-driven agents

```bash
intuit webhooks listen --verifier-token <token> --events qbo.invoice.created.v1
```

Signatures are verified and recent events can be replayed with `intuit webhooks replay`.

## Query syntax

The `--where` flag accepts [QBO query language](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries). String values must be single-quoted.

| Operator | Example |
|----------|---------|
| `=` `!=` `>` `<` | `--where "Balance > 100"` |
| `LIKE` | `--where "DisplayName LIKE '%Acme%'"` |
| `IN` | `--where "Id IN ('1', '2', '3')"` |
| `AND` | `--where "Balance > 0 AND Active = true"` |

`--order-by "DisplayName ASC"` for sort order.

## Environment variables

Credentials and Premium scopes are covered under [Configuration](#configuration). A few additional vars:

| Variable | Description |
|---|---|
| `INTUIT_PROFILE` | Override the active profile (useful in CI/CD and scripts) |
| `INTUIT_WEBHOOK_VERIFIER_TOKEN` | Default verifier token for `webhooks listen` |
| `NODE_EXTRA_CA_CERTS` | Path to custom CA bundle (corporate proxies) |

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Missing sandbox credentials` | No Client ID/Secret configured | `intuit auth configure --env sandbox` |
| `401 Unauthorized` | Access token expired and refresh failed | `intuit auth login` |
| `403 Forbidden` | App lacks required OAuth scopes | Check app scopes; for Premium see `.env` `INTUIT_<env>_PREMIUM_SCOPES` |
| `429 Rate limited` | Too many requests | CLI retries; reduce volume if persistent |
| `ECONNREFUSED` | Can't reach Intuit API | Check network/proxy; set `NODE_EXTRA_CA_CERTS` |
| `Port 9477 in use` | Prior OAuth callback still listening | Kill the process or wait |
| `OAuth callback timed out` | Browser auth not completed within 2 minutes | Retry; verify redirect URI matches app config |

Use `--debug` for full HTTP request/response logging. Share the `intuit_tid` value with Intuit support for escalation.

To uninstall fully: `npm uninstall -g intuit-cli && rm -rf ~/.config/intuit-cli`.

## Development

```bash
npm install
npm run build
npm test
npm run dev -- customers list   # run from source
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
