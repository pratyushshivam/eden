/**
 * The one place the language model is called from. It runs on the server side
 * only (here, inside the Vite dev server), reads the key from the environment,
 * and never passes it on. It is written as a plain function of a request body
 * so it can later be moved as it stands into a serverless function.
 *
 * It does not accept prompts. It accepts facts about creatures and builds the
 * prompt itself, so it cannot be used as an open door to the model.
 *
 * Spending is guarded here, not in the browser: every response's token counts
 * are priced and added to a small file on disk, and calls are refused once the
 * session or the total limit is reached.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ENDPOINT, MAX_OUT, MODEL, PRICE, SYSTEM, buildPrompt, estimateTokens, type Kind } from "./prompts.ts";


/** The most this route will ever spend in total, whatever the environment says. */
const HARD_TOTAL = 0.5;
const MAX_BODY = 9000;
const MAX_AT_ONCE = 2;
const MIN_GAP_MS = 1200;
const MAX_PER_MINUTE = 24;

export interface MindEnv {
  apiKey: string | undefined;
  /** Where the running total is kept. */
  spendFile: string;
  sessionLimit?: number;
  totalLimit?: number;
  log?: (line: string) => void;
}

export interface Spend {
  session: number;
  total: number;
  sessionLimit: number;
  totalLimit: number;
  calls: number;
  state: "ready" | "no_key" | "rejected" | "limit";
}

interface Ledger {
  total_usd: number;
  calls: number;
  tokens_in: number;
  tokens_out: number;
}

let session = 0;
let sessionCalls = 0;
let running = 0;
let lastCall = 0;
let recent: number[] = [];
let rejected = false;

function readLedger(file: string): Ledger {
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as Partial<Ledger>;
      return { total_usd: Number(j.total_usd) || 0, calls: Number(j.calls) || 0, tokens_in: Number(j.tokens_in) || 0, tokens_out: Number(j.tokens_out) || 0 };
    }
  } catch {
    // An unreadable file must never open the purse: treat it as fully spent.
    return { total_usd: HARD_TOTAL, calls: 0, tokens_in: 0, tokens_out: 0 };
  }
  return { total_usd: 0, calls: 0, tokens_in: 0, tokens_out: 0 };
}

function limits(env: MindEnv): { sessionLimit: number; totalLimit: number } {
  const totalLimit = Math.min(HARD_TOTAL, env.totalLimit && env.totalLimit > 0 ? env.totalLimit : HARD_TOTAL);
  const sessionLimit = Math.min(totalLimit, env.sessionLimit && env.sessionLimit > 0 ? env.sessionLimit : 0.1);
  return { sessionLimit, totalLimit };
}

export function spendReport(env: MindEnv): Spend {
  const { sessionLimit, totalLimit } = limits(env);
  const total = readLedger(env.spendFile).total_usd;
  const state = !env.apiKey ? "no_key" : rejected ? "rejected" : session >= sessionLimit || total >= totalLimit ? "limit" : "ready";
  return { session, total, sessionLimit, totalLimit, calls: sessionCalls, state };
}

export interface MindReply {
  status: number;
  json: Record<string, unknown>;
}

export async function handleMind(body: unknown, env: MindEnv): Promise<MindReply> {
  const { sessionLimit, totalLimit } = limits(env);
  const refuse = (reason: string, status = 200): MindReply => ({ status, json: { ok: false, reason, spend: spendReport(env) } });
  if (!body || typeof body !== "object") return refuse("bad_request", 400);
  const b = body as { kind?: unknown; facts?: unknown };
  if (typeof b.kind !== "string" || !(b.kind in MAX_OUT)) return refuse("bad_request", 400);
  if (!b.facts || typeof b.facts !== "object" || JSON.stringify(b.facts).length > MAX_BODY) return refuse("bad_request", 400);
  if (!env.apiKey) return refuse("no_key");
  if (rejected) return refuse("rejected");

  const kind = b.kind as Kind;
  const user = buildPrompt(kind, b.facts as Record<string, unknown>);
  // Price the worst case before calling, so a call can never carry the total over the line.
  const worst = (estimateTokens(SYSTEM + user) * PRICE.inMiss + MAX_OUT[kind] * PRICE.out) / 1e6;
  const ledger = readLedger(env.spendFile);
  if (session + worst > sessionLimit || ledger.total_usd + worst > totalLimit) return refuse("limit");

  const now = Date.now();
  recent = recent.filter((t) => now - t < 60_000);
  if (running >= MAX_AT_ONCE || now - lastCall < MIN_GAP_MS || recent.length >= MAX_PER_MINUTE) return refuse("busy");
  running++;
  lastCall = now;
  recent.push(now);
  // Reserve the worst case while the call is in flight; settle to the real figure after.
  session += worst;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  let cost = worst;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 1.1,
        max_tokens: MAX_OUT[kind],
        stream: false,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      rejected = true;
      cost = 0;
      env.log?.(`mind: the key was rejected (${res.status}); using the plain voice from here on`);
      return refuse("rejected");
    }
    if (res.status === 402) {
      cost = 0;
      rejected = true;
      env.log?.("mind: the account has no balance left; using the plain voice from here on");
      return refuse("rejected");
    }
    if (!res.ok) {
      cost = 0;
      env.log?.(`mind: the model service answered ${res.status}`);
      return refuse("error");
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
    };
    const u = data.usage ?? {};
    const tin = u.prompt_tokens ?? estimateTokens(SYSTEM + user);
    const hit = u.prompt_cache_hit_tokens ?? 0;
    const miss = u.prompt_cache_miss_tokens ?? tin - hit;
    const tout = u.completion_tokens ?? MAX_OUT[kind];
    cost = (miss * PRICE.inMiss + hit * PRICE.inHit + tout * PRICE.out) / 1e6;
    const after = readLedger(env.spendFile);
    after.total_usd += cost;
    after.calls++;
    after.tokens_in += tin;
    after.tokens_out += tout;
    writeFileSync(env.spendFile, JSON.stringify(after, null, 2));
    sessionCalls++;
    env.log?.(`mind: ${kind} ${tin} in (${hit} cached) ${tout} out  $${cost.toFixed(5)}  total $${after.total_usd.toFixed(4)}`);
    let result: unknown = null;
    try {
      result = JSON.parse(data.choices?.[0]?.message?.content ?? "");
    } catch {
      return refuse("error");
    }
    if (!result || typeof result !== "object") return refuse("error");
    session += cost - worst;
    cost = worst; // already settled; keep the finally block from adjusting twice
    return { status: 200, json: { ok: true, kind, result, spend: spendReport(env) } };
  } catch {
    cost = 0;
    return refuse("error");
  } finally {
    clearTimeout(timer);
    running--;
    session += cost - worst;
  }
}
