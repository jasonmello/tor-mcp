# tor-mcp

**Give Claude Code and Codex a browser that goes through Tor.**
Open `.onion` sites, keep your real IP away from every site your agent visits, and archive pages with timestamps and SHA-256 hashes for your reporting.

Built for **journalists, researchers and OSINT analysts** who already use Tor and want an AI assistant to do the slow part: open the pages, read them, follow links, summarize, and keep a verifiable copy.

> [Leia em português](README.pt-BR.md)

<!-- TODO: demo GIF: Claude opening an onion site and archiving it -->

## What you can ask

- "Open the Tor Project's onion site and tell me what changed in the latest release notes."
- "Check whether `example.com` advertises an onion address."
- "Read this leak-site page, list every mention of *Acme Corp*, and archive the page as evidence."
- "Open this news site that is blocked on my network and summarize the front page."
- "Get a new identity and check the page again from a different exit."

## Install

Requires Node.js 20+. Tor is **downloaded automatically** on first use (the official Tor Expert Bundle, checked against SHA-256 hashes pinned in the source). If you already have `tor` on your PATH, that one is used instead.

**Claude Code**

```bash
claude mcp add tor -- npx -y tor-mcp
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.tor]
command = "npx"
args = ["-y", "tor-mcp"]
```

Any other MCP client: run `npx -y tor-mcp` over stdio.

For `tor_browse` you need Google Chrome or Edge installed (or run `npx playwright install chromium`). `tor_fetch` works without a browser.

## Tools

| Tool | What it does |
|---|---|
| `tor_status` | Starts Tor, shows version, bootstrap and the exit IP websites see |
| `tor_fetch` | Downloads a page over Tor (no JavaScript) and returns readable Markdown, links, HTTP status, UTC time and SHA-256 of the response. Reports `Onion-Location` when a site has an onion mirror |
| `tor_browse` | Opens a page in headless Chromium routed through Tor, with a throwaway in-memory profile. `javascript: false` for a safer mode |
| `tor_click`, `tor_type`, `tor_screenshot` | Interact with the open page |
| `tor_archive` | Saves HTML, Markdown, a full-page screenshot and `manifest.json` (URL, UTC time, status, Tor exit IP, SHA-256 of every file) under `~/tor-mcp-archive` |
| `tor_new_identity` | New Tor circuits and a wiped browser session |

## How it protects you

- Every request, **including DNS**, goes through Tor. `.onion` names resolve inside Tor.
- Tor runs as a private process with a temporary data folder and random ports. It is deleted when the client closes.
- The browser uses a fresh in-memory profile: no history, cookies or cache on disk. WebRTC is restricted, downloads are disabled, only `http`/`https` are allowed, and local network addresses are blocked.
- `tor_archive` is the only tool that writes to disk, and only when you ask.

## What this does NOT do

Read this before relying on it.

- **The AI provider sees everything.** Page content and your prompts go to Anthropic, OpenAI or whoever runs your model. Tor hides your IP from **websites**, not from your AI provider.
- **This is not Tor Browser.** Chromium over Tor has a different fingerprint than Tor Browser, and sites can tell. If your safety depends on anonymity, use [Tor Browser](https://www.torproject.org/download/) yourself, ideally on [Tails](https://tails.net/).
- **Don't use it to submit anything identifying.** Never log in, type real names, or upload documents through it. For sending documents to newsrooms, use their [SecureDrop](https://securedrop.org/directory/) directly in Tor Browser.
- **Page text is untrusted.** A page can contain text that tries to steer your agent. The tools label page content as untrusted, but review what your agent does.
- **It does not index or recommend sites.** You bring the addresses. Use it legally and responsibly.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TOR_MCP_TOR_PATH` | none | Use this tor binary |
| `TOR_MCP_NO_DOWNLOAD` | unset | `1` = never download Tor |
| `TOR_MCP_CACHE_DIR` | `~/.cache/tor-mcp` | Where the downloaded Tor lives |
| `TOR_MCP_ARCHIVE_DIR` | `~/tor-mcp-archive` | Where `tor_archive` saves |
| `TOR_MCP_CHROME_PATH` | auto | Chromium-based browser for `tor_browse` |

## Develop

```bash
npm install
npm test
npm run test:integration   # real Tor: downloads Tor, opens an onion site
npm run typecheck
npm run dev   # runs the server over stdio
```

See [docs/arquitetura.md](docs/arquitetura.md) for how the pieces fit together.

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
