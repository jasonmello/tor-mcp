// Starts a private, throwaway tor process: temp DataDirectory, random ports,
// cookie auth on the control port. Everything is deleted on shutdown.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTorBinary, type TorBinary } from "./bundle.js";
import { TorControl } from "./control.js";

export interface TorInstance {
  socksHost: string;
  socksPort: number;
  control: TorControl;
  binary: TorBinary;
  dataDir: string;
  startedAt: Date;
  stop(): Promise<void>;
}

/** "PORT=127.0.0.1:9051" -> 9051 */
export function parsePortFile(text: string): number {
  const m = text.match(/PORT=[^:\s]+:(\d+)/);
  if (!m) throw new Error(`Unexpected control port file: ${text}`);
  return Number(m[1]);
}

/** '"127.0.0.1:41234"' or '127.0.0.1:41234 [::1]:1' -> 41234 (first IPv4 listener) */
export function parseSocksListeners(value: string): { host: string; port: number } {
  for (const raw of value.split(/\s+/)) {
    const item = raw.replace(/"/g, "");
    const m = item.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
    if (m) return { host: m[1], port: Number(m[2]) };
  }
  throw new Error(`No IPv4 SOCKS listener in: ${value}`);
}

export async function startTor(opts: { log?: (m: string) => void; bootstrapTimeoutMs?: number } = {}): Promise<TorInstance> {
  const log = opts.log ?? (() => {});
  const binary = await ensureTorBinary(log);
  const dataDir = await mkdtemp(join(tmpdir(), "tor-mcp-"));
  const portFile = join(dataDir, "control.port");

  const args = [
    "--DataDirectory", dataDir,
    "--SocksPort", "auto",
    "--ControlPort", "auto",
    "--ControlPortWriteToFile", portFile,
    "--CookieAuthentication", "1",
    "--ClientOnly", "1",
    "--AvoidDiskWrites", "1",
    "--Log", "notice stdout",
    "--__OwningControllerProcess", String(process.pid),
  ];
  const env = { ...process.env };
  if (binary.libDir) {
    env.LD_LIBRARY_PATH = [binary.libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
    env.DYLD_LIBRARY_PATH = [binary.libDir, env.DYLD_LIBRARY_PATH].filter(Boolean).join(":");
  }

  log(`Starting tor (${binary.source}: ${binary.path})`);
  const child: ChildProcess = spawn(binary.path, args, { env, stdio: ["ignore", "pipe", "pipe"] });

  const cleanup = async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Tor did not finish bootstrapping in time. Your network may block Tor.")),
        opts.bootstrapTimeoutMs ?? 120_000,
      );
      let tail = "";
      const onLine = (chunk: Buffer) => {
        const text = chunk.toString();
        tail = (tail + text).slice(-2000);
        const m = text.match(/Bootstrapped (\d+)%/g);
        if (m) log(m[m.length - 1]);
        if (text.includes("Bootstrapped 100%")) {
          clearTimeout(timeout);
          resolve();
        }
      };
      child.stdout?.on("data", onLine);
      child.stderr?.on("data", onLine);
      child.once("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`tor exited early (code ${code}). Last output:\n${tail}`));
      });
    });

    const controlPort = parsePortFile(await readFile(portFile, "utf8"));
    const cookie = (await readFile(join(dataDir, "control_auth_cookie"))).toString("hex");
    const control = new TorControl(controlPort);
    await control.connect(cookie);
    // Take ownership so tor exits if we die, even without __OwningControllerProcess.
    await control.command("TAKEOWNERSHIP");
    const socks = parseSocksListeners(await control.getInfo("net/listeners/socks"));

    let stopped = false;
    const instance: TorInstance = {
      socksHost: socks.host,
      socksPort: socks.port,
      control,
      binary,
      dataDir,
      startedAt: new Date(),
      async stop() {
        if (stopped) return;
        stopped = true;
        await control.signal("SHUTDOWN").catch(() => {});
        control.close();
        await new Promise((r) => setTimeout(r, 300));
        await cleanup();
      },
    };
    return instance;
  } catch (err) {
    await cleanup();
    throw err;
  }
}
