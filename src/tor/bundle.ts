// Finds a `tor` binary, or downloads the official Tor Expert Bundle and verifies it
// against SHA-256 hashes pinned in this file (copied from the Tor Project's
// sha256sums-signed-build.txt). Pinning in source means a compromised mirror
// cannot swap the binary: the hash lives in reviewed git history.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";

const run = promisify(execFile);

export const TOR_BUNDLE_VERSION = "16.0.1";

/** platform key -> sha256 of tor-expert-bundle-<key>-<version>.tar.gz */
export const BUNDLE_SHA256: Record<string, string> = {
  "linux-aarch64": "67040520d44c87ccaaf5aa7df0dc1ff122eb938dbb600ae7722e8b6b75282a4b",
  "linux-x86_64": "7039cb16060ab22e669852e55774d894b55f25ea8bd0ab7194d3478429a58725",
  "macos-aarch64": "0b7d022017c31e3f972d06465bcd7ac50feb66ac825547419a934914fe4bb156",
  "macos-x86_64": "15464d99adc3bb4de1308260d79878336b04a1ac1aeff83e10f192de7d235946",
  "windows-i686": "4aa4bed8397349612c7dda0e13697b92f40059763a7158d037be7bed5429232c",
  "windows-x86_64": "9eed3c3ff1fe43df034ce360196c9ec95472560d77ff55614d0cd5120edea27b",
};

export function platformKey(platform = process.platform, arch = process.arch): string {
  const os = platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform === "linux" ? "linux" : null;
  if (!os) throw new Error(`Unsupported platform: ${platform}. Install tor yourself and set TOR_MCP_TOR_PATH.`);
  const cpu =
    arch === "arm64" ? "aarch64" : arch === "x64" ? "x86_64" : arch === "ia32" && os === "windows" ? "i686" : null;
  if (!cpu || !BUNDLE_SHA256[`${os}-${cpu}`]) {
    throw new Error(`Unsupported CPU: ${platform}/${arch}. Install tor yourself and set TOR_MCP_TOR_PATH.`);
  }
  return `${os}-${cpu}`;
}

export function cacheDir(): string {
  return process.env.TOR_MCP_CACHE_DIR ?? join(homedir(), ".cache", "tor-mcp");
}

export interface TorBinary {
  path: string;
  /** directory holding bundled shared libraries, if any */
  libDir?: string;
  source: "env" | "path" | "bundle";
}

function exeName(): string {
  return process.platform === "win32" ? "tor.exe" : "tor";
}

function findOnPath(): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exeName());
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** Resolve a tor binary: TOR_MCP_TOR_PATH, then PATH, then the verified bundle. */
export async function ensureTorBinary(log: (msg: string) => void = () => {}): Promise<TorBinary> {
  const fromEnv = process.env.TOR_MCP_TOR_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`TOR_MCP_TOR_PATH points to a missing file: ${fromEnv}`);
    return { path: fromEnv, source: "env" };
  }
  const onPath = findOnPath();
  if (onPath) return { path: onPath, source: "path" };

  const key = platformKey();
  const dir = join(cacheDir(), `${TOR_BUNDLE_VERSION}-${key}`);
  const torPath = join(dir, "tor", exeName());
  if (existsSync(torPath)) return { path: torPath, libDir: join(dir, "tor"), source: "bundle" };

  if (process.env.TOR_MCP_NO_DOWNLOAD === "1") {
    throw new Error("No tor binary found and TOR_MCP_NO_DOWNLOAD=1. Install tor or set TOR_MCP_TOR_PATH.");
  }

  const file = `tor-expert-bundle-${key}-${TOR_BUNDLE_VERSION}.tar.gz`;
  const url = `https://dist.torproject.org/torbrowser/${TOR_BUNDLE_VERSION}/${file}`;
  log(`Downloading ${url}`);
  await mkdir(cacheDir(), { recursive: true });
  const tmpArchive = join(cacheDir(), `${file}.part`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tmpArchive));

  const actual = await sha256File(tmpArchive);
  const expected = BUNDLE_SHA256[key];
  if (actual !== expected) {
    await rm(tmpArchive, { force: true });
    throw new Error(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}. Refusing to run it.`);
  }
  log(`Checksum OK (${actual})`);

  const staging = `${dir}.staging`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await run("tar", ["-xzf", tmpArchive, "-C", staging]);
  await rm(tmpArchive, { force: true });
  if (process.platform === "darwin") {
    // The expert bundle's macOS binaries ship with a signature macOS rejects
    // ("invalid signature"), so the kernel SIGKILLs them. We already verified the
    // archive hash, so re-sign ad hoc locally.
    const torDir = join(staging, "tor");
    const libs = (await readdir(torDir)).filter((f) => f.endsWith(".dylib")).map((f) => join(torDir, f));
    await run("codesign", ["--force", "--sign", "-", ...libs, join(torDir, "tor")]);
  }
  await rm(dir, { recursive: true, force: true });
  await rename(staging, dir);
  if (process.platform !== "win32") await chmod(torPath, 0o755);
  if (!existsSync(torPath)) throw new Error(`Bundle extracted but ${torPath} is missing.`);
  return { path: torPath, libDir: join(dir, "tor"), source: "bundle" };
}
