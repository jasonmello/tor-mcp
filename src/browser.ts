// A headless Chromium whose every request goes through Tor. Each identity uses a
// fresh in-memory context: no profile, no history, no cookies on disk.
import type { Browser, BrowserContext, Page } from "playwright-core";
import { USER_AGENT, assertWebUrl } from "./fetch.js";
import { extractHtml, type Extracted } from "./extract.js";

export interface PageSnapshot extends Extracted {
  url: string;
}

export class TorBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private javascript = true;

  constructor(private socks: { host: string; port: number }) {}

  private async launch(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const { chromium } = await import("playwright-core");
    const args = [
      `--proxy-server=socks5://${this.socks.host}:${this.socks.port}`,
      // Chromium skips the proxy for loopback by default; force everything through Tor.
      "--proxy-bypass-list=<-loopback>",
      // Resolve every hostname at the proxy (Tor), never locally.
      `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${this.socks.host}`,
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      // Don't pass --disable-features: it replaces Playwright's own list and then
      // Chrome refuses .onion navigations with ERR_BLOCKED_BY_CLIENT.
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--disk-cache-size=1",
    ];
    const attempts: Array<() => Promise<Browser>> = [];
    const explicit = process.env.TOR_MCP_CHROME_PATH;
    if (explicit) attempts.push(() => chromium.launch({ executablePath: explicit, headless: true, args }));
    attempts.push(() => chromium.launch({ channel: "chrome", headless: true, args }));
    attempts.push(() => chromium.launch({ channel: "msedge", headless: true, args }));
    attempts.push(() => chromium.launch({ headless: true, args }));
    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        this.browser = await attempt();
        return this.browser;
      } catch (e) {
        errors.push((e as Error).message.split("\n")[0]);
      }
    }
    throw new Error(
      "No Chromium-based browser found for tor_browse. Install Google Chrome, set TOR_MCP_CHROME_PATH, " +
        "or run `npx playwright install chromium`. tor_fetch still works without a browser.\n" +
        errors.join("\n"),
    );
  }

  private async ensurePage(javascript: boolean): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.javascript === javascript) return this.page;
    await this.resetContext();
    const browser = await this.launch();
    this.javascript = javascript;
    this.context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
      timezoneId: "UTC",
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      javaScriptEnabled: javascript,
      serviceWorkers: "block",
      permissions: [],
    });
    await this.context.route("**/*", (route) => {
      try {
        assertWebUrl(route.request().url());
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(60_000);
    return this.page;
  }

  async open(url: string, opts: { javascript?: boolean } = {}): Promise<PageSnapshot> {
    assertWebUrl(url);
    const page = await this.ensurePage(opts.javascript ?? true);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    return this.snapshot();
  }

  private current(): Page {
    if (!this.page || this.page.isClosed()) throw new Error("No page open. Call tor_browse first.");
    return this.page;
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = this.current();
    const url = page.url();
    return { url, ...extractHtml(await page.content(), url) };
  }

  async click(target: { selector?: string; text?: string }): Promise<PageSnapshot> {
    const page = this.current();
    const locator = target.selector
      ? page.locator(target.selector).first()
      : target.text
        ? page.getByText(target.text, { exact: false }).first()
        : null;
    if (!locator) throw new Error("Give either selector or text.");
    await locator.click({ timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    return this.snapshot();
  }

  async type(selector: string, text: string, submit: boolean): Promise<PageSnapshot> {
    const page = this.current();
    const field = page.locator(selector).first();
    await field.fill(text, { timeout: 20_000 });
    if (submit) {
      await field.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    }
    return this.snapshot();
  }

  async screenshot(fullPage: boolean): Promise<Buffer> {
    return this.current().screenshot({ fullPage, type: "png" });
  }

  async html(): Promise<string> {
    return this.current().content();
  }

  /** Drop cookies, storage and the open page. */
  async resetContext(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = undefined;
    this.page = undefined;
  }

  async close(): Promise<void> {
    await this.resetContext();
    await this.browser?.close().catch(() => {});
    this.browser = undefined;
  }
}
