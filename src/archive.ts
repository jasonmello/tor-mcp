// Evidence capture for reporting: saves what was retrieved, when, through which
// Tor exit, with a SHA-256 for every file so the copy can be checked later.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function archiveRoot(): string {
  return process.env.TOR_MCP_ARCHIVE_DIR ?? join(homedir(), "tor-mcp-archive");
}

export function archiveFolderName(url: string, when: Date): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "page";
    }
  })();
  const stamp = when.toISOString().replace(/[:.]/g, "-");
  return `${stamp}_${host.replace(/[^a-z0-9.-]/gi, "_").slice(0, 80)}`;
}

export interface ArchiveInput {
  requestedUrl: string;
  finalUrl: string;
  retrievedAt: string;
  method: "fetch" | "browser";
  status?: number;
  exitIp?: string;
  note?: string;
  files: Record<string, Buffer | string>;
}

export async function writeArchive(input: ArchiveInput, toolVersion: string): Promise<{ dir: string; manifest: object }> {
  const dir = join(archiveRoot(), archiveFolderName(input.finalUrl, new Date(input.retrievedAt)));
  await mkdir(dir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(input.files)) {
    const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    await writeFile(join(dir, name), buf);
    hashes[name] = createHash("sha256").update(buf).digest("hex");
  }
  const manifest = {
    tool: `tor-mcp ${toolVersion}`,
    requested_url: input.requestedUrl,
    final_url: input.finalUrl,
    retrieved_at_utc: input.retrievedAt,
    method: input.method,
    http_status: input.status ?? null,
    tor_exit_ip: input.exitIp ?? null,
    note: input.note ?? null,
    sha256: hashes,
  };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest };
}
