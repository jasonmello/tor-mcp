// Minimal Tor control-protocol client (spec: control-spec.txt). Only what we need:
// cookie AUTHENTICATE, GETINFO and SIGNAL.
import { Socket, connect } from "node:net";

export interface ControlReply {
  code: number;
  lines: string[];
}

export class TorControl {
  private socket?: Socket;
  private buffer = "";
  private pending: Array<(r: ControlReply) => void> = [];

  constructor(private port: number, private host = "127.0.0.1") {}

  async connect(cookieHex: string): Promise<void> {
    this.socket = await new Promise<Socket>((resolve, reject) => {
      const s = connect(this.port, this.host, () => resolve(s));
      s.once("error", reject);
    });
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => this.onData(chunk));
    const auth = await this.command(`AUTHENTICATE ${cookieHex}`);
    if (auth.code !== 250) throw new Error(`Tor control auth failed: ${auth.lines.join(" ")}`);
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    // Only consume complete replies: find the last "NNN " terminator line we can fully parse.
    for (;;) {
      const { reply, consumed } = takeOneReply(this.buffer);
      if (!reply) break;
      this.buffer = this.buffer.slice(consumed);
      if (reply.code === 650) continue; // async events: ignored
      this.pending.shift()?.(reply);
    }
  }

  command(cmd: string, timeoutMs = 15000): Promise<ControlReply> {
    if (!this.socket) return Promise.reject(new Error("Control port not connected"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Tor control timeout: ${cmd.split(" ")[0]}`)), timeoutMs);
      this.pending.push((r) => {
        clearTimeout(timer);
        resolve(r);
      });
      this.socket!.write(`${cmd}\r\n`);
    });
  }

  async getInfo(key: string): Promise<string> {
    const r = await this.command(`GETINFO ${key}`);
    if (r.code !== 250) throw new Error(`GETINFO ${key} failed: ${r.lines.join(" ")}`);
    const first = r.lines[0] ?? "";
    const prefix = `${key}=`;
    if (first.startsWith(prefix)) {
      const inline = first.slice(prefix.length);
      // Multi-line values come as "key=" followed by data lines until "OK".
      const extra = r.lines.slice(1).filter((l) => l !== "OK");
      return [inline, ...extra].filter((l) => l !== "").join("\n");
    }
    return r.lines.filter((l) => l !== "OK").join("\n");
  }

  async signal(name: "NEWNYM" | "SHUTDOWN" | "HALT"): Promise<void> {
    const r = await this.command(`SIGNAL ${name}`);
    if (r.code !== 250) throw new Error(`SIGNAL ${name} failed: ${r.lines.join(" ")}`);
  }

  close() {
    this.socket?.destroy();
    this.socket = undefined;
  }
}

/** Take exactly one complete reply from the start of `buf`, if available. */
export function takeOneReply(buf: string): { reply?: ControlReply; consumed: number } {
  const lines: string[] = [];
  let pos = 0;
  let inData = false;
  for (;;) {
    const nl = buf.indexOf("\r\n", pos);
    if (nl === -1) return { consumed: 0 };
    const line = buf.slice(pos, nl);
    pos = nl + 2;
    if (inData) {
      if (line === ".") inData = false;
      else lines.push(line.startsWith("..") ? line.slice(1) : line);
      continue;
    }
    const code = Number(line.slice(0, 3));
    const sep = line[3];
    lines.push(line.slice(4));
    if (sep === "+") inData = true;
    else if (sep === " ") return { reply: { code, lines }, consumed: pos };
  }
}
