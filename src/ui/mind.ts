/**
 * The page's side of the words. It sends facts about creatures to the small
 * server route and puts what comes back into the world. It never sees a key.
 * When the route is missing, refuses, or has spent its allowance, everything
 * here falls back to the plain built-in voice and the world carries on.
 */
import {
  DAY, KITH, SPECIES, applyMeeting, applyVoice, coinName, giveName, kithFacts, nowFacts, plainMeeting, plainVoice, tellables,
  type Creature, type Meeting, type Talk, type TalkResult, type VoiceResult, type World,
} from "../engine";

export interface Spend {
  session: number;
  total: number;
  sessionLimit: number;
  totalLimit: number;
  calls: number;
  state: "ready" | "no_key" | "rejected" | "limit";
}

interface Job {
  kind: "voice" | "talk";
  id: number;
  meeting?: Meeting;
  /** Higher goes first. */
  pri: number;
}

const NOTES: Record<string, string> = {
  no_key: "No language model is connected, so this is the plain built-in voice.",
  rejected: "The language model turned the key away, so this is the plain built-in voice.",
  limit: "The allowance for words is spent, so this is the plain built-in voice.",
  offline: "No language model is connected, so this is the plain built-in voice.",
};

export class Mind {
  spend: Spend | null = null;
  /** True while the route is there and willing. */
  ready = false;
  /** Why the plain voice is in use, when it is. */
  note = "";
  /** Creature ids with a request in flight or queued. */
  readonly waiting = new Set<number>();
  onTalk: (t: Talk) => void = () => {};
  onChange: () => void = () => {};

  private queue: Job[] = [];
  private busy = false;
  private lastCall = 0;
  private lastAuto = 0;
  private lastTalk = 0;
  private asked = new Map<number, number>();
  private unnamedSince = new Map<number, number>();
  private tick = 0;

  constructor(private w: World) {
    w.talkMode = "external";
  }

  async init(): Promise<void> {
    try {
      const r = await fetch("api/mind", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; spend?: Spend };
      if (j.ok && j.spend) this.take(j.spend);
      else this.offline();
    } catch {
      this.offline();
    }
    this.onChange();
  }

  private offline(): void {
    this.ready = false;
    this.note = NOTES.offline;
  }

  private take(spend: Spend): void {
    this.spend = spend;
    this.ready = spend.state === "ready";
    this.note = this.ready ? "" : (NOTES[spend.state] ?? NOTES.offline);
  }

  /** Asks for a creature's inner voice. With `force`, even if little has happened since last time. */
  voice(c: Creature, force = false, pri = 10): void {
    if (c.sp !== KITH || !c.alive || this.waiting.has(c.id)) return;
    const askedAt = this.asked.get(c.id);
    if (!force && askedAt !== undefined && c.log.length - askedAt < 3 && c.thoughts.length) return;
    this.asked.set(c.id, c.log.length);
    if (!this.ready) {
      this.plain(c);
      return;
    }
    this.waiting.add(c.id);
    this.queue.push({ kind: "voice", id: c.id, pri });
    this.onChange();
  }

  private plain(c: Creature): void {
    if (!c.name) giveName(this.w, c, coinName(this.w, c.id));
    const th = plainVoice(this.w, c);
    if (c.thoughts[c.thoughts.length - 1]?.text !== th.text) {
      c.thoughts.push(th);
      if (c.thoughts.length > 6) c.thoughts.shift();
    }
    this.onChange();
  }

  /** Called every frame. */
  pump(now: number): void {
    const w = this.w;
    // Meetings: one at a time gets real words, the rest are settled plainly at once.
    while (w.meetings.length) {
      const m = w.meetings.shift() as Meeting;
      const quiet = !this.queue.some((j) => j.kind === "talk") && now - this.lastTalk > 7000;
      if (this.ready && quiet) {
        this.lastTalk = now;
        this.queue.push({ kind: "talk", id: m.a, meeting: m, pri: 5 });
      } else {
        const t = plainMeeting(w, m);
        if (t && t.ideas.length) this.onTalk(t);
      }
    }
    // Names: a kith that has come of age names itself. With a model, in its own words.
    if (++this.tick % 30 === 0) {
      for (const c of w.creatures) {
        if (c.sp !== KITH || c.name) continue;
        if ((w.t - c.born) / DAY < SPECIES[KITH].adultAt) continue;
        const since = this.unnamedSince.get(c.id);
        if (since === undefined) {
          this.unnamedSince.set(c.id, now);
          continue;
        }
        if (!this.ready || now - since > 40_000) giveName(w, c, coinName(w, c.id));
        else if (!this.waiting.has(c.id) && this.queue.length < 3 && now - this.lastAuto > 5000) {
          this.lastAuto = now;
          this.voice(c, true, 1);
        }
      }
    }
    if (this.busy || !this.queue.length || now - this.lastCall < 1500) return;
    this.queue.sort((a, b) => b.pri - a.pri);
    const job = this.queue.shift() as Job;
    this.lastCall = now;
    void this.run(job);
  }

  private async run(job: Job): Promise<void> {
    const w = this.w;
    this.busy = true;
    try {
      if (job.kind === "voice") {
        const c = w.byId.get(job.id);
        if (!c) return;
        const r = await this.post("voice", { now: nowFacts(w), one: kithFacts(w, c) });
        const live = w.byId.get(job.id);
        if (!live) return;
        if (!r || !applyVoice(w, live, r as VoiceResult)) this.plain(live);
      } else if (job.meeting) {
        const m = job.meeting;
        const a = w.byId.get(m.a), b = w.byId.get(m.b);
        if (!a || !b) return;
        const facts = {
          now: nowFacts(w),
          a: { ...kithFacts(w, a, 8), can_tell: tellables(w, a, b, "a").list },
          b: { ...kithFacts(w, b, 8), can_tell: tellables(w, b, a, "b").list },
        };
        const r = await this.post("talk", facts);
        const t = (r ? applyMeeting(w, m, r as TalkResult) : null) ?? plainMeeting(w, m);
        if (t) this.onTalk(t);
      }
    } finally {
      this.waiting.delete(job.id);
      this.busy = false;
      this.onChange();
    }
  }

  private async post(kind: string, facts: unknown): Promise<object | null> {
    try {
      const res = await fetch("api/mind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, facts }) });
      const j = (await res.json()) as { ok?: boolean; reason?: string; result?: unknown; spend?: Spend };
      if (j.spend) this.take(j.spend);
      if (j.ok) return j.result && typeof j.result === "object" ? j.result : null;
      if (j.reason && NOTES[j.reason]) {
        this.ready = false;
        this.note = NOTES[j.reason];
      }
      return null;
    } catch {
      this.offline();
      return null;
    }
  }
}
