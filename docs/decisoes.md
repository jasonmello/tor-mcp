# Decisions

- **2026-11-19 · MCP server, not a browser fork.** Built-in browsers of Claude/Codex can't be routed through Tor; MCP works in both apps.
- **2026-11-19 · Audience: journalists, researchers, OSINT.** Existing Tor MCPs (max ~8 stars) are generic "dark web search"; a reporting focus (archive with hashes, honest limits) is the differentiator.
- **2026-11-19 · Pin Tor Expert Bundle hashes in source** (16.0.1) instead of fetching the checksum file at runtime: a compromised mirror can't swap both.
- **2026-11-19 · playwright-core + system Chrome** instead of bundling Chromium: keeps `npx` install small.
- **2026-11-19 · Public docs in English** (with a Portuguese README summary) to reach a global audience.
- **2026-11-19 · Re-sign the macOS bundle ad hoc after the hash check.** The expert bundle's `tor` has a signature macOS rejects (SIGKILL on launch); the hash check already proves it's the official file.
- **2026-11-19 · No `--disable-features` flag in Chromium.** It overrides Playwright's own list and Chrome then blocks .onion with ERR_BLOCKED_BY_CLIENT.
- **2026-11-20 · Apache 2.0 instead of MIT.** Same freedom to use, plus a patent grant, no rights to the project name, and a NOTICE file that forks must keep (credit to the author).
