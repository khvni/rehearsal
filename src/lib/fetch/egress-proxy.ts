import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import { logEvent } from "../telemetry";
import { resolvePublicHost } from "./guards";

/**
 * Loopback HTTP proxy that every request from the local Chromium goes through. It resolves each
 * host itself, refuses private/link-local/metadata addresses, and connects to the exact IP it
 * checked, so redirects, subresources and DNS rebinding cannot reach internal services.
 */
export async function startEgressProxy(resolve: (host: string) => Promise<string> = resolvePublicHost) {
  const blocked = (target: string, err: unknown) =>
    logEvent({ stage: "egress", kind: "egress-blocked", data: { target: target.slice(0, 200), error: String(err).slice(0, 200) } });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void forward(req, res).catch(() => res.destroy());
  });

  async function forward(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? "");
      if (url.protocol !== "http:") throw new Error(`unsupported protocol ${url.protocol}`);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let ip: string;
    try {
      ip = await resolve(url.hostname);
    } catch (e) {
      blocked(url.href, e);
      res.writeHead(403, { "content-type": "text/plain" }).end("Blocked by Rehearsal egress guard");
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = httpRequest(
      { host: ip, port: url.port || 80, path: `${url.pathname}${url.search}`, method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  }

  const tunnels = new Set<Socket>();
  server.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
    tunnels.add(client);
    client.on("close", () => tunnels.delete(client));
    client.on("error", () => client.destroy());
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url ?? "");
    if (!m) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const [, host, port] = m;
    resolve(host).then(
      (ip) => {
        const upstream = connect(Number(port), ip, () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length > 0) upstream.write(head);
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on("error", () => {
          if (!client.destroyed) client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        });
        client.on("close", () => upstream.destroy());
      },
      (e) => {
        blocked(`${host}:${port}`, e);
        client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      },
    );
  });

  // Plain-HTTP upgrades are not proxied; Chromium tunnels WebSockets through CONNECT.
  server.on("upgrade", (_req: IncomingMessage, socket: Socket) => socket.destroy());
  server.on("clientError", (_e, socket: Socket) => socket.destroy());

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r) => {
        for (const socket of tunnels) socket.destroy();
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
