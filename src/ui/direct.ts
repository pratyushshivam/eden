/**
 * Words without a server. On a static host there is no route to keep a key,
 * so a visitor may connect a DeepSeek key of their own. It is kept only in
 * this browser's storage and sent only to DeepSeek. The same prompts are
 * used, and the same kind of spending guard, kept in this browser.
 */
import { ENDPOINT, MAX_OUT, MODEL, PRICE, SYSTEM, buildPrompt, estimateTokens, type Kind } from "../../server/prompts.ts";
import type { Spend } from "./mind";

const KEY = "eden.key";
const SPENT = "eden.spent";
/** The most a connected key will be allowed to spend from this browser. */
const CAP = 0.5;
let session = 0;
let calls = 0;
let last = 0;
let rejected = false;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const hasKey = (): boolean => !!read(KEY);

export function setKey(key: string | null): void {
  rejected = false;
  try {
    if (key && key.trim().length > 10) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: it cannot be kept.
  }
}

export function directSpend(): Spend {
  const total = Number(read(SPENT)) || 0;
  return { session, total, sessionLimit: CAP, totalLimit: CAP, calls, state: !hasKey() ? "no_key" : rejected ? "rejected" : total >= CAP ? "limit" : "ready" };
}

export async function directMind(kind: string, facts: unknown): Promise<{ ok: boolean; reason?: string; result?: unknown; spend: Spend }> {
  const key = read(KEY);
  const fail = (reason: string): { ok: boolean; reason: string; spend: Spend } => ({ ok: false, reason, spend: directSpend() });
  if (!key) return fail("no_key");
  if (rejected) return fail("rejected");
  if (!(kind in MAX_OUT) || !facts || typeof facts !== "object") return fail("bad_request");
  const k = kind as Kind;
  const user = buildPrompt(k, facts as Record<string, unknown>);
  const worst = (estimateTokens(SYSTEM + user) * PRICE.inMiss + MAX_OUT[k] * PRICE.out) / 1e6;
  const total = Number(read(SPENT)) || 0;
  if (total + worst > CAP) return fail("limit");
  const now = Date.now();
  if (now - last < 1200) return fail("busy");
  last = now;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 1.1,
        max_tokens: MAX_OUT[k],
        stream: false,
      }),
    });
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      rejected = true;
      return fail("rejected");
    }
    if (!res.ok) return fail("error");
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
    };
    const u = data.usage ?? {};
    const tin = u.prompt_tokens ?? estimateTokens(SYSTEM + user);
    const hit = u.prompt_cache_hit_tokens ?? 0;
    const cost = ((u.prompt_cache_miss_tokens ?? tin - hit) * PRICE.inMiss + hit * PRICE.inHit + (u.completion_tokens ?? MAX_OUT[k]) * PRICE.out) / 1e6;
    session += cost;
    calls++;
    try {
      localStorage.setItem(SPENT, String(total + cost));
    } catch {
      // Uncounted is unsafe: stop here.
      rejected = true;
    }
    const result: unknown = JSON.parse(data.choices?.[0]?.message?.content ?? "null");
    if (!result || typeof result !== "object") return fail("error");
    return { ok: true, result, spend: directSpend() };
  } catch {
    return fail("error");
  }
}
