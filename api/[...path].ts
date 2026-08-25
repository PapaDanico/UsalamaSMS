// Vercel adapter for the existing Fastify API.
//
// The browser already calls /api/* on the same origin. This catch-all
// Function preserves that contract and delegates to Fastify through
// `inject`, the same path exercised by the integration tests.
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<{
  inject: (options: {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
    payload?: Buffer;
  }) => Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | number | undefined>;
    rawPayload: Buffer;
  }>;
}> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    const payload = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
    const result = await app.inject({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: headersToObject(req.headers),
      ...(payload === undefined ? {} : { payload }),
    });

    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) res.setHeader(name, value);
    }
    res.statusCode = result.statusCode;
    res.end(result.rawPayload);
  } catch (error) {
    // Connection and cold-start details belong only in Vercel Function logs.
    console.error("[usalamasms] function failed", error);
    appPromise = null;
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "internal_error" }));
  }
}

async function getApp() {
  if (!appPromise) {
    appPromise = import("../apps/api/src/server.js").then(async (mod) => {
      const app = await mod.build();
      await app.ready();
      return app as never;
    });
  }
  return appPromise;
}

function headersToObject(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
