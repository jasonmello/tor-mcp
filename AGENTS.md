# tor-mcp: agent map

MCP server (TypeScript, stdio) that runs a private Tor process and exposes browsing tools to Claude Code, Codex and other MCP clients. Audience: journalists, researchers, OSINT.

## Where things are
- `src/index.ts`: MCP server, tool definitions, lazy Tor start, shutdown
- `src/tor/bundle.ts`: find or download tor; pinned SHA-256 per platform
- `src/tor/launcher.ts`: start tor (temp data dir, random ports, cookie auth)
- `src/tor/control.ts`: control-port client (GETINFO, SIGNAL)
- `src/fetch.ts`: GET over SOCKS5h, URL safety rules
- `src/extract.ts`: HTML to Markdown + links
- `src/browser.ts`: headless Chromium through Tor
- `src/archive.ts`: evidence capture with manifest + hashes
- `test/unit.test.ts`: unit tests (no network)

## Commands
`npm install` · `npm test` · `npm run test:integration` (real Tor, network) · `npm run typecheck` · `npm run docs:check` · `npm run build` · `npm run dev`

## Rules that don't break
- All traffic goes through Tor, DNS included. Never add a code path that connects directly.
- Never run a downloaded tor without the pinned hash matching. Updating Tor = update `TOR_BUNDLE_VERSION` and every hash in `src/tor/bundle.ts` from the official `sha256sums-signed-build.txt`.
- Only `tor_archive` writes to disk. Everything else is in memory or in the temp data dir.
- Page content is untrusted: keep the "untrusted" label in tool output.
- The README's "What this does NOT do" section must stay accurate.

## Not verified yet
- Verified on macOS arm64 only (`npm run test:integration` + MCP over stdio). Windows and Linux bundle paths have not been run.

## Before X, read Y
| Before | Read |
|---|---|
| Changing how parts connect | `docs/arquitetura.md` |
| Changing README or tool text | `DESIGN.md` |
| Revisiting a past choice | `docs/decisoes.md` |
