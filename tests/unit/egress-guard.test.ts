import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { startEgressProxy } from "@/lib/fetch/egress-proxy";
import { assertPublicUrl, resolvePublicHost } from "@/lib/fetch/guards";
import { assertPublicPage } from "@/lib/browser/playwright";

const SECRET = "GEMINI_API_KEY=[fixture-secret]";

let internal: Server; // stands in for 169.254.169.254 / any loopback service
let site: Server; // the "public" attacker page, redirecting inward
let internalUrl: string;
let siteUrl: string;

const portOf = (s: Server) => (s.address() as AddressInfo).port;

beforeAll(async () => {
  internal = createServer((_req, res) => res.end(SECRET));
  await new Promise<void>((r) => internal.listen(0, "127.0.0.1", r));
  internalUrl = `http://localhost:${portOf(internal)}/metadata/v1/user-data`;
  site = createServer((req, res) => {
    if (req.url === "/to-metadata") res.writeHead(302, { location: "http://169.254.169.254/metadata/v1/user-data" }).end();
    else if (req.url === "/to-internal") res.writeHead(302, { location: internalUrl }).end();
    else res.writeHead(200, { "content-type": "text/html" }).end(`<title>ok</title><img src="${internalUrl}">`);
  });
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
  siteUrl = `http://127.0.0.1:${portOf(site)}`;
});

afterAll(async () => {
  await new Promise((r) => internal.close(r));
  await new Promise((r) => site.close(r));
});

afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
});

describe("SSRF guards", () => {
  it("rejects private, link-local, metadata and unspecified addresses", async () => {
    for (const host of ["169.254.169.254", "127.0.0.1", "10.0.0.5", "0.0.0.0", "[::1]", "[::ffff:169.254.169.254]", "localhost"]) {
      await expect(resolvePublicHost(host)).rejects.toThrow(/Blocked/);
    }
    await expect(assertPublicUrl("http://[fe80::1]/")).rejects.toThrow(/Blocked/);
    await expect(resolvePublicHost("8.8.8.8")).resolves.toBe("8.8.8.8");
  });
});

describe("egress proxy", () => {
  it("refuses CONNECT tunnels and plain-HTTP requests to private addresses", async () => {
    const proxy = await startEgressProxy();
    const port = Number(new URL(proxy.server).port);
    try {
      const connectReply = await new Promise<string>((resolve, reject) => {
        const s = connect(port, "127.0.0.1", () => s.write(`CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n`));
        s.on("data", (d) => {
          resolve(d.toString());
          s.destroy();
        });
        s.on("error", reject);
      });
      expect(connectReply).toMatch(/^HTTP\/1\.1 403/);

      const status = await new Promise<number>((resolve, reject) => {
        request({ host: "127.0.0.1", port, path: internalUrl, headers: { host: new URL(internalUrl).host } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
          .on("error", reject)
          .end();
      });
      expect(status).toBe(403);
    } finally {
      await proxy.close();
    }
  });

  describe("in a real Chromium", () => {
    let browser: Browser;
    let close: () => Promise<void>;

    beforeAll(async () => {
      // Treat the fixture site's 127.0.0.1 as "public"; everything else uses the real guard.
      const proxy = await startEgressProxy((host) => (host === "127.0.0.1" ? Promise.resolve(host) : resolvePublicHost(host)));
      close = proxy.close;
      browser = await chromium.launch({ headless: true, proxy: { server: proxy.server } });
    });

    afterAll(async () => {
      await browser.close();
      await close();
    });

    for (const path of ["/to-metadata", "/to-internal"]) {
      it(`blocks the redirect hop for ${path} and never shows the internal response`, async () => {
        const page = await browser.newPage();
        const res = await page.goto(`${siteUrl}${path}`, { waitUntil: "domcontentloaded" }).catch(() => null);
        expect(res?.status() ?? 403).toBe(403);
        expect(await page.content()).not.toContain(SECRET);
        await expect(assertPublicPage(page)).rejects.toThrow(/Blocked/);
        await page.close();
      });
    }

    it("still loads the public page and blocks its internal subresource", async () => {
      const page = await browser.newPage();
      const failed: string[] = [];
      page.on("response", (r) => {
        if (r.url().startsWith(internalUrl)) failed.push(String(r.status()));
      });
      const res = await page.goto(`${siteUrl}/`, { waitUntil: "load" });
      expect(res?.status()).toBe(200);
      expect(await page.title()).toBe("ok");
      expect(failed.every((s) => s === "403")).toBe(true);
      await page.close();
    });
  });
});
