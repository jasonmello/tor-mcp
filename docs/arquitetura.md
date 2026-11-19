# Architecture

```
MCP client (Claude Code / Codex)
   │ stdio
   ▼
src/index.ts ── first tool call ──► src/tor/launcher.ts
   │                                   │ ensureTorBinary (src/tor/bundle.ts)
   │                                   │   TOR_MCP_TOR_PATH → PATH → verified download
   │                                   │ spawn tor: temp DataDirectory, SocksPort auto,
   │                                   │   ControlPort auto, cookie auth, __OwningControllerProcess
   │                                   │ wait "Bootstrapped 100%"
   │                                   └► TorControl (src/tor/control.ts): TAKEOWNERSHIP,
   │                                        GETINFO net/listeners/socks → SOCKS port
   │
   ├─ tor_fetch / tor_archive(url) ─► src/fetch.ts torGet: https.get + SocksProxyAgent socks5h
   │                                   └► src/extract.ts: linkedom + Readability + Turndown
   ├─ tor_browse / click / type / screenshot ─► src/browser.ts: playwright-core Chromium
   │        --proxy-server socks5, --proxy-bypass-list=<-loopback>, host-resolver-rules (no local DNS),
   │        fresh BrowserContext per identity, route filter via assertWebUrl
   ├─ tor_archive ─► src/archive.ts: files + manifest.json with SHA-256
   └─ tor_new_identity ─► SIGNAL NEWNYM + browser.resetContext()
```

Shutdown: stdin close / SIGINT / SIGTERM → close browser → `SIGNAL SHUTDOWN` → delete temp dir. If the server dies abruptly, tor exits by itself because of `TAKEOWNERSHIP` and `__OwningControllerProcess`.

Browser choice order: `TOR_MCP_CHROME_PATH` → Chrome → Edge → Playwright's Chromium. It's imported lazily so `tor_fetch` works without any browser.
