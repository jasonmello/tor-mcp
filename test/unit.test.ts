import { describe, expect, it } from "vitest";
import { archiveFolderName } from "../src/archive.js";
import { extractHtml } from "../src/extract.js";
import { assertWebUrl, isOnion, isTextual } from "../src/fetch.js";
import { BUNDLE_SHA256, platformKey } from "../src/tor/bundle.js";
import { takeOneReply } from "../src/tor/control.js";
import { parsePortFile, parseSocksListeners } from "../src/tor/launcher.js";

describe("URL safety", () => {
  it("accepts http, https and onion", () => {
    expect(assertWebUrl("https://example.com").hostname).toBe("example.com");
    expect(isOnion(assertWebUrl("http://abc.onion/x"))).toBe(true);
  });
  it("rejects other schemes and local addresses", () => {
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x.org", "http://localhost:3000", "http://127.0.0.1", "http://192.168.0.1", "http://10.0.0.1", "http://[::1]/"]) {
      expect(() => assertWebUrl(bad), bad).toThrow();
    }
  });
  it("classifies text content types", () => {
    expect(isTextual("text/html; charset=utf-8")).toBe(true);
    expect(isTextual("application/json")).toBe(true);
    expect(isTextual("application/zip")).toBe(false);
  });
});

describe("Tor bundle", () => {
  it("maps platforms to pinned hashes", () => {
    expect(platformKey("darwin", "arm64")).toBe("macos-aarch64");
    expect(platformKey("linux", "x64")).toBe("linux-x86_64");
    expect(platformKey("win32", "x64")).toBe("windows-x86_64");
    expect(() => platformKey("freebsd", "x64")).toThrow();
    for (const h of Object.values(BUNDLE_SHA256)) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("control protocol", () => {
  it("parses single-line, multi-line and data replies", () => {
    expect(takeOneReply("250 OK\r\n").reply).toEqual({ code: 250, lines: ["OK"] });
    expect(takeOneReply("250-version=0.4.8\r\n").reply).toBeUndefined();
    const multi = "250-version=0.4.8\r\n250 OK\r\n";
    expect(takeOneReply(multi)).toEqual({ reply: { code: 250, lines: ["version=0.4.8", "OK"] }, consumed: multi.length });
    const data = "250+net/listeners/socks=\r\n\"127.0.0.1:1234\"\r\n.\r\n250 OK\r\n";
    expect(takeOneReply(data).reply?.lines).toEqual(["net/listeners/socks=", "\"127.0.0.1:1234\"", "OK"]);
  });
  it("parses port files and listeners", () => {
    expect(parsePortFile("PORT=127.0.0.1:9151\n")).toBe(9151);
    expect(parseSocksListeners('"127.0.0.1:41234"')).toEqual({ host: "127.0.0.1", port: 41234 });
    expect(parseSocksListeners('"[::1]:1" "127.0.0.1:5"')).toEqual({ host: "127.0.0.1", port: 5 });
  });
});

describe("extraction", () => {
  it("returns title, markdown and absolute links without scripts", () => {
    const html = `<html><head><title>Hello</title><script>evil()</script></head><body>
      <article><h1>Report</h1><p>${"Important text. ".repeat(40)}</p><img src="/a.svg" alt="Logo"><a href="/next">Next page</a></article></body></html>`;
    const out = extractHtml(html, "http://abc.onion/dir/");
    expect(out.title).toBe("Hello");
    expect(out.markdown).toContain("Important text.");
    expect(out.markdown).not.toContain("evil()");
    expect(out.markdown).not.toContain("a.svg");
    expect(out.links).toContainEqual({ text: "Next page", href: "http://abc.onion/next" });
  });
});

describe("archive", () => {
  it("builds safe folder names", () => {
    const name = archiveFolderName("http://abc.onion/x?y", new Date("2026-01-02T03:04:05.678Z"));
    expect(name).toBe("2026-01-02T03-04-05-678Z_abc.onion");
  });
});
