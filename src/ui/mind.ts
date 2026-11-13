/**
 * The page's side of the words. It sends facts about creatures to the small
 * server route and puts what comes back into the world. It never sees a key.
 * When the route is missing, refuses, or has spent its allowance, everything
 * here falls back to the plain built-in voice and the world carries on.
 */
import {
  DAY, KITH, SPECIES, applyAnswer, applyAttempt, applyMeeting, applyReact, applyVoice, attemptFacts, strangerFacts, coinName, giveName, kithFacts, nowFacts, plainMeeting, plainVoice, tellables,
  type AnswerResult, type Attempt, type AttemptResult, type Creature, type ReactResult, type Idea, type Meeting, type Talk, type TalkResult, type VoiceResult, type World,
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
  kind: "voice" | "talk" | "make" | "react";
  id: number;
  meeting?: Meeting;
  attempt?: Attempt;
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
  /** Called when a kith makes something for the first time. */
  onMade: (who: number, idea: Idea) => void = () => {};
  onChange: () => void = () => {};

  private queue: Job[] = [];
  private busy = false;
  private lastCall = 0;
  private lastAuto = 0;
  private lastTalk = 0;
  private lastMake = 0;
  private lastReact = 0;
  /** Called when a kith says something aloud to the visitor's body. */
  onSpoken: (who: number, text: string) => void = () => {};
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
    if (c.sp !== KITH || !c.alive || c.avatar || this.waiting.has(c.id)) return;
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
    // First sight of the stranger: each one decides for itself what to do about it.
    while (w.sightings.length) {
      const s = w.sightings.shift() as { who: number };
      const c = w.byId.get(s.who);
      if (!c) continue;
      if (this.ready && now - this.lastReact > 2500 && this.queue.filter((j) => j.kind === "react").length < 3) {
        this.lastReact = now;
        this.queue.push({ kind: "react", id: c.id, pri: 9 });
      } else {
        const said = applyReact(w, c, null);
        if (said) this.onSpoken(c.id, said);
      }
    }
    // Makings: the model decides what this one makes and what it calls it; otherwise chance does.
    while (w.attempts.length) {
      const a = w.attempts.shift() as Attempt;
      if (this.ready && now - this.lastMake > 5000 && !this.queue.some((j) => j.kind === "make")) {
        this.lastMake = now;
        this.queue.push({ kind: "make", id: a.who, attempt: a, pri: 7 });
      } else {
        const idea = applyAttempt(w, a, null);
        if (idea) this.onMade(a.who, idea);
      }
    }
    // Names: a kith that has come of age names itself. With a model, in its own words.
    if (++this.tick % 30 === 0) {
      for (const c of w.creatures) {
        if (c.sp !== KITH || c.name || c.avatar) continue;
        if ((w.t - c.born) / DAY < SPECIES[KITH].adultAt) continue;
        const since = this.unnamedSince.get(c.id);
        if (since === undefined) {
          this.unnamedSince.set(c.id, now);
          continue;
        }
        // No words came in good time: it takes a name made of plain sounds.
        if (!this.ready || now - since > 40_000 || (w.t - c.born) / DAY > SPECIES[KITH].adultAt + 1.5) giveName(w, c, coinName(w, c.id));
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
        const r = await this.post("voice", { now: nowFacts(w, c), one: kithFacts(w, c), names_taken: this.taken() });
        const live = w.byId.get(job.id);
        if (!live) return;
        if (!r || !applyVoice(w, live, r as VoiceResult)) this.plain(live);
      } else if (job.kind === "react") {
        const c = w.byId.get(job.id);
        const stranger = c ? strangerFacts(w, c) : null;
        if (!c) return;
        const r = stranger ? await this.post("react", { now: nowFacts(w, c), one: kithFacts(w, c, 10), stranger, names_taken: this.taken() }) : null;
        const live = w.byId.get(job.id);
        if (!live) return;
        const said = applyReact(w, live, r as ReactResult | null);
        if (said) this.onSpoken(live.id, said);
      } else if (job.kind === "make" && job.attempt) {
        const facts = attemptFacts(w, job.attempt);
        if (!facts) return;
        const c = w.byId.get(job.attempt.who);
        const r = c ? await this.post("make", { now: nowFacts(w, c), ...facts, names_taken: this.taken() }) : null;
        const idea = applyAttempt(w, job.attempt, r as AttemptResult | null);
        if (idea) this.onMade(job.attempt.who, idea);
      } else if (job.meeting) {
        const m = job.meeting;
        const a = w.byId.get(m.a), b = w.byId.get(m.b);
        if (!a || !b) return;
        const facts = {
          now: nowFacts(w, a),
          names_taken: this.taken(),
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

  /** The visitor says something to a kith; resolves with what it answers. */
  async answer(c: Creature, said: string): Promise<string> {
    const w = this.w;
    const stranger = strangerFacts(w, c);
    let r: object | null = null;
    const facts = stranger ? { now: nowFacts(w, c), one: kithFacts(w, c, 10), stranger, said: said.slice(0, 240) } : null;
    if (this.ready && facts) {
      r = await this.post("answer", facts);
      // The route keeps a short gap between calls: if it was busy, wait a moment and ask once more.
      if (!r && this.ready) {
        await new Promise((done) => setTimeout(done, 1600));
        r = await this.post("answer", facts);
      }
    }
    const live = w.byId.get(c.id);
    if (!live) return "";
    const reply = applyAnswer(w, live, said, r as AnswerResult | null);
    this.onChange();
    return reply;
  }

  /** Names already in use, so a new one is never a repeat. */
  private taken(): string[] {
    const out: string[] = [];
    for (const c of this.w.creatures) if (c.name && out.length < 70) out.push(c.name);
    for (const p of this.w.placeNames) if (p) out.push(p);
    for (const i of this.w.ideas) if (i.kind === "craft" && i.text) out.push(i.text);
    return out;
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
