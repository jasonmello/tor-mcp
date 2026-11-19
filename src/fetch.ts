// Plain HTTP(S) GET through Tor's SOCKS port. DNS is resolved by Tor (socks5h),
// so .onion names work and no DNS query leaves your machine.
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import { SocksProxyAgent } from "socks-proxy-agent";

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0";
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: Buffer;
  sha256: string;
  truncated: boolean;
  retrievedAt: string;
  /** value of the Onion-Location header, if the site advertises an onion mirror */
  onionLocation?: string;
}

export function assertWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http and https URLs are allowed (got ${url.protocol}).`);
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^127\.|^10\.|^192\.168\.|^0\.|^\[?::1\]?$/.test(host)) {
    throw new Error("Local and private network addresses are blocked.");
  }
  return url;
}

export function isOnion(url: URL): boolean {
  return url.hostname.toLowerCase().endsWith(".onion");
}

function decode(stream: Readable, encoding: string | undefined): Readable {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return stream.pipe(createGunzip());
    case "deflate":
      return stream.pipe(createInflate());
    case "br":
      return stream.pipe(createBrotliDecompress());
    default:
      return stream;
  }
}

export async function torGet(
  rawUrl: string,
  socks: { host: string; port: number },
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  const agent = new SocksProxyAgent(`socks5h://${socks.host}:${socks.port}`);
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  let url = assertWebUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.get(
        url,
        {
          agent,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
          },
          timeout: opts.timeoutMs ?? 60_000,
        },
        resolve,
      );
      req.on("timeout", () => req.destroy(new Error("Request timed out (onion sites can be slow; try again).")));
      req.on("error", reject);
    });

    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      url = assertWebUrl(new URL(res.headers.location, url).toString());
      continue;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const body = decode(res, res.headers["content-encoding"] as string | undefined);
    await new Promise<void>((resolve, reject) => {
      body.on("data", (c: Buffer) => {
        if (truncated) return;
        size += c.length;
        if (size > maxBytes) {
          truncated = true;
          chunks.push(c.subarray(0, c.length - (size - maxBytes)));
          res.destroy();
          resolve();
          return;
        }
        chunks.push(c);
      });
      body.on("end", resolve);
      body.on("error", (e) => (truncated ? resolve() : reject(e)));
    });
    const buf = Buffer.concat(chunks);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;

    return {
      requestedUrl: rawUrl,
      finalUrl: url.toString(),
      status,
      contentType: headers["content-type"] ?? "",
      headers,
      body: buf,
      sha256: createHash("sha256").update(buf).digest("hex"),
      truncated,
      retrievedAt: new Date().toISOString(),
      onionLocation: headers["onion-location"],
    };
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}).`);
}

export function isTextual(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct === "" || ct.startsWith("text/") || ct.includes("html") || ct.includes("xml") || ct.includes("json");
}
