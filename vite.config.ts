import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handleMind, spendReport, type MindEnv } from "./server/mind.ts";

/**
 * Serves /api/mind from inside the dev server. The key is read here, on the
 * server side, from .env.local; nothing in this file reaches the browser.
 */
function mind(mode: string): Plugin {
  return {
    name: "eden-mind",
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), "");
      const mindEnv: MindEnv = {
        apiKey: env.EDEN_NO_KEY ? undefined : env.DEEPSEEK_API_KEY || undefined,
        spendFile: resolve(process.cwd(), ".eden-spend.json"),
        sessionLimit: Number(env.EDEN_SESSION_LIMIT) || undefined,
        totalLimit: Number(env.EDEN_TOTAL_LIMIT) || undefined,
        log: (line) => server.config.logger.info(line),
      };
      server.middlewares.use("/api/mind", (req, res) => {
        const send = (status: number, json: unknown): void => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(json));
        };
        if (req.method === "GET") return send(200, { ok: true, spend: spendReport(mindEnv) });
        if (req.method !== "POST") return send(405, { ok: false, reason: "bad_request" });
        let raw = "";
        let over = false;
        req.on("data", (chunk: Buffer) => {
          raw += chunk.toString("utf8");
          if (raw.length > 20000) over = true;
        });
        req.on("end", () => {
          if (over) return send(413, { ok: false, reason: "bad_request" });
          let body: unknown = null;
          try {
            body = JSON.parse(raw);
          } catch {
            return send(400, { ok: false, reason: "bad_request" });
          }
          handleMind(body, mindEnv).then(
            (r) => send(r.status, r.json),
            () => send(200, { ok: false, reason: "error" }),
          );
        });
      });
    },
  };
}

// Relative base: the built page works from any folder on any static host.
export default defineConfig(({ mode }) => ({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
  plugins: [mind(mode)],
}));
