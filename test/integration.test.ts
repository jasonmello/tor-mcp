// Real-network test. Runs only with TOR_IT=1 (downloads Tor on first run).
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeArchive } from "../src/archive.js";
import { TorBrowser } from "../src/browser.js";
import { extractHtml } from "../src/extract.js";
import { torGet } from "../src/fetch.js";
import { startTor, type TorInstance } from "../src/tor/launcher.js";

// The Tor Project's own onion service.
const TOR_PROJECT_ONION = "http://2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion/";

describe.runIf(process.env.TOR_IT === "1")("real Tor", () => {
  let tor: TorInstance;
  let browser: TorBrowser;
  const socks = () => ({ host: tor.socksHost, port: tor.socksPort });

  beforeAll(async () => {
    tor = await startTor({ log: (m) => console.log(`[tor] ${m}`) });
    browser = new TorBrowser(socks());
  }, 300_000);

  afterAll(async () => {
    await browser?.close();
    const dir = tor?.dataDir;
    await tor?.stop();
    if (dir) expect(existsSync(dir)).toBe(false);
  }, 60_000);

  it("exits through Tor", async () => {
    const r = await torGet("https://check.torproject.org/api/ip", socks());
    const j = JSON.parse(r.body.toString());
    console.log("exit ip", j.IP);
    expect(j.IsTor).toBe(true);
  }, 120_000);

  it("reads an onion site", async () => {
    const r = await torGet(TOR_PROJECT_ONION, socks());
    expect(r.status).toBe(200);
    const page = extractHtml(r.body.toString(), r.finalUrl);
    console.log("onion title:", page.title);
    expect(page.title.toLowerCase()).toContain("tor");
  }, 180_000);

  it("browses an onion site in Chromium and screenshots it", async () => {
    const snap = await browser.open(TOR_PROJECT_ONION);
    console.log("browser title:", snap.title, snap.url);
    expect(snap.title.toLowerCase()).toContain("tor");
    const png = await browser.screenshot(false);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  }, 240_000);

  it("browser traffic also exits through Tor", async () => {
    await browser.open("https://check.torproject.org/api/ip", { javascript: false });
    const body = await browser.html();
    expect(body).toMatch(/"IsTor"\s*:\s*true/);
  }, 180_000);

  it("archives with hashes", async () => {
    process.env.TOR_MCP_ARCHIVE_DIR = await mkdtemp(join(tmpdir(), "tor-mcp-archive-"));
    const r = await torGet(TOR_PROJECT_ONION, socks());
    const { dir } = await writeArchive(
      { requestedUrl: TOR_PROJECT_ONION, finalUrl: r.finalUrl, retrievedAt: r.retrievedAt, method: "fetch", status: r.status, files: { "response.bin": r.body } },
      "test",
    );
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.sha256["response.bin"]).toBe(r.sha256);
  }, 180_000);

  it("gets a new identity", async () => {
    await tor.control.signal("NEWNYM");
    expect(await tor.control.getInfo("status/bootstrap-phase")).toContain("PROGRESS=100");
  }, 60_000);
});
