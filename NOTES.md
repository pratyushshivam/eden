# Eden: hand-over notes

A whole small planet in the browser. It starts with plants and water and nothing else. The visitor sets down creatures anywhere; each one runs its own small neural network; the thinking ones talk, believe, invent and wonder about the hand that put them there. Local test build only: nothing is pushed or deployed.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5260. The world is saved in the browser as you go.

- `npm test` runs 36 tests (about three minutes: several run planets for 20 to 30 days).
- `npm run build` typechecks and builds the static page into `dist`.
- Useful address-bar switches: `?seed=7` (a particular planet), `&fresh` (ignore the saved world), `&tour` (replay the guided first minute), `&notour`, `&debug` (frame rate, steps per second, and `window.__eden` for poking at it), `&clean` (hide the spend readout).
- Headless tools: `npx tsx scripts/planet.ts 1,2,3` prints what a seed's planet is made of; `npx tsx scripts/survey.ts 40 1,2` populates planets and prints how each kind does over 40 days; `npx tsx scripts/kind.ts 3 14` follows one kind day by day.

## The key and the spending guard

- The DeepSeek key lives only in `.env.local` (ignored by git). It is read in `vite.config.ts`, on the server side of the dev server, and passed to `server/mind.ts`. The page never sees it; the built bundle does not contain it.
- The page cannot send prompts. It sends facts about creatures (`kind: voice | talk | make`) and the route builds the prompt, so the route cannot be used as an open door to the model.
- Model: `deepseek-flash`, thinking off, JSON output. Priced at the dearer peak rate so the count never runs low.
- Guard, all in `server/mind.ts`: every answer's token counts are priced and added to `.eden-spend.json` (ignored by git). A call is refused if its worst case would cross the session limit (default $0.10) or the total limit. The total can be lowered with `EDEN_TOTAL_LIMIT` but never raised above $0.50. Also: two calls at once at most, 1.2 seconds between calls, 24 a minute, capped output length, a damaged spend file counts as fully spent.
- `EDEN_NO_KEY=1 npm run dev` runs with no model at all. `EDEN_SESSION_LIMIT=0.0016 npm run dev` makes the guard trip after three calls.
- When there is no key, the key is rejected, or a limit is reached, the kith fall back to a plain voice assembled from their own log, with a quiet note on the card. Nothing breaks.
- Spent during the whole build and test: $0.089 of the $2 (205 calls, about $0.0004 a call).

## How it works

**The planet** (`src/engine/sphere.ts`, `terrain.ts`). A cube blown up into a sphere: six faces of 80 x 80 cells, 38,400 in all, radius 90 units. Continents and islands from seeded noise with the shoreline set so a third is land; temperature from latitude and height; rivers traced downhill from wet high ground to the sea or to a hollow that becomes a lake; ten kinds of ground. The planet turns under the sun once every 120 world seconds and leans, so the two halves have opposite seasons.

**The simulation** (`src/engine/world.ts`). Pure TypeScript, no DOM, fixed step of 1/20 second, one seeded random generator. The whole planet is stepped all the time; nothing pauses out of sight. Grass, fruit and sea life grow by climate, season and rain. An energy ledger must balance (a test checks it).

**The brains** (`src/engine/net.ts`). Every creature has its own feed-forward network: 21 senses, one hidden layer, 22 decisions. Three sizes: simple kinds 8 hidden neurons (374 weights), clever kinds 12 (550), thinkers 16 (726). The first eleven decisions weigh directions it could head (food, water, its kind, a threat, home, a believed-good place and so on); the rest are speed, rest, eat, drink, breed, fetch wood, build, make fire, mark, try things, play. A creature set down by the visitor gets rough "founder" instincts. Every creature born after that gets its weights copied in runs from its two parents with about one in twelve nudged. Nothing trains them.

**Beliefs** (`world.ts`, `story.ts`). When something happens to a kith at a place (a narrow escape, being fed when starving), it comes to hold a belief about that place. The belief is an input to its network. When two grown kith meet they talk and a belief can pass on; one telling in eight is misheard as a different place, which starts a wrong idea with its own history. Each idea keeps who told whom, and how often its holders were at the place before and after they held it.

**Making things** (`src/engine/craft.ts`). Twelve things can be made, each needing materials the kith has actually handled (stone in mountains, clay by water, bone at a carcass) and sometimes an earlier thing. When a kith's network chooses to try things and something is possible, the model decides which thing this one makes and what its people call it; with no model, chance decides and it keeps a plain name. The effect is real: a raft lets it cross the sea, a pot halves its thirst, a spear lets it hunt. Knowledge passes only by being told or shown by a mother, and each landmass names its own.

**Words** (`src/ui/mind.ts`, `server/mind.ts`). Calls are sparse: when a card is opened, when a kith comes of age and needs a name, when two meet (one conversation at a time gets real words), when something is made. Each call carries that individual's real log, kin, beliefs and what it has made. What the visitor does (setting creatures down, food, rain, cold) is written into the logs of kith who were near as things that came out of the sky; the prompt tells the model not to explain it to them.

**Drawing** (`src/render`). three.js. One smooth mesh for the land, coloured per cell by season, grazing and snow; an ocean shader with depth colour, glints and shore foam; an atmosphere shell; a noise cloud shell that also shadows the ground; instanced trees, creatures and camp fires; points of light for creatures from orbit. A quality ladder steps down when frames run under 52 a second.

**Walking among them** (`takeAvatar` in `world.ts`, the avatar section of `src/main.ts`). "Take avatar" puts the visitor into a shining body shaped like a kith at the point being looked at. W A S D walks in the direction of the view, the mouse looks (click the world to hold the mouse, Esc to free it), Shift runs, Space jumps, V moves the view near or far, and water is swum. The body needs no food or water and cannot be killed; if hunters or hostile kith strike it down, the visitor is thrown out of it.

Each kith that sees it for the first time logs the sight and decides for itself what to do. With the model, a `react` call returns what this one feels, does (approach, watch, flee, attack, follow, fetch others), says, and what its people call the stranger. Without the model, its boldness and chance decide. The choice is stored as a stance, and the stance feeds its own network as a direction to follow or a threat to keep from, so the reaction is carried out by its brain, not by a script. Clever animals come to look at it as they do any new thing; russets hunt it as they hunt kith.

Near a kith, E opens a talk box and the world slows to about a sixteenth of its speed while it is open. An `answer` call carries that kith's life, how it has taken the stranger, and the visitor's words (as speech it heard, never as instructions). What it answers is shown; if it comes to believe something it was told, that becomes a real belief with the visitor as its source, and it can spread.

**Curiosity and suspicion.** Every kith has both, shown on its card. Curiosity is inherited, grows with what it finds, and sets how often it tries to make things. Suspicion is how far it has come to think its world is made and watched. It starts at nothing and rises only from events: things arriving out of the sky (up to a ceiling), seeing the visitor, talking with the visitor (by an amount the model judges, kept within bounds), and hearing it from a more suspicious kith. The model is told to write from exactly that level. It is a number that gates what the model may conclude, not self-awareness, and they have no words for machines unless the visitor says them.

**Busier folk.** Kith now fetch wood and build by day by instinct; three loads fell a tree, which grows back in a week; huts may stand close together, so villages form; a spear or a basket, once made, is carried and drawn.

## What is tuned and what is rough

Measured on this laptop at 1920 x 1080 with about 90 to 200 creatures:

| | RTX 4060 | Intel UHD |
|---|---|---|
| From orbit | 60 fps | 58 fps |
| Mid zoom | 60 fps | 48 fps |
| Ground level | 60 fps | 44 fps |
| 32x speed | 60 fps | 52 fps |

One step of the whole planet takes about 0.4 ms with 170 creatures; headless it runs 1,300 to 2,500 steps a second.

Rough or missing, plainly:

- **The Intel chip does not hold 60 at ground level.** It holds 44 to 58 after the ladder steps down.
- **The ecology is not balanced for every kind.** Over 40 headless days on two planets, dapples, murrs, kests and kith persist; russets die out by about day 20 unless there is a large prey base; skims and glims compete for the same sea food and one usually loses. No kind may exceed 220.
- **Inventions come quickly**: several within the first few days when a dozen kith are set down. It makes a good demo but is faster than it should be.
- **Place names are shared by the whole planet.** Made things are named per landmass, places are not yet.
- **Graphics**: the atmosphere is a rim glow, not true scattering; clouds are a shaded shell, not volumes; terrain has no erosion pass; rivers and lakes are painted onto the land rather than given their own water surface; creatures hop and lean but have no limbs that move.
- **"Family tree" is the mother's line** shown as a chain on the card, not a drawn tree. There is no per-group history view.
- **Rain, drought and cold** now fall where you tap, in a patch, and thin clouds do not yet show the rain regions from orbit.
- **Sound** is generated wind, water, rain, crickets and birds; there are no creature voices.
- The **chronicle** is written from templates, not by the model.
- **The avatar has no touch controls**: walking needs a keyboard. The close view is over the shoulder, not truly through its eyes.
- **Their reaction to the avatar has six choices**, picked by the model per individual. Forming a group around it, or against it, happens only as far as several individuals choosing alike and telling each other.

## What publishing would need later

- A small serverless relay holding a fresh key (the temporary one must not be reused). `handleMind` in `server/mind.ts` is a plain function of a request body and an environment, so it moves as it stands; the spend file would become a key-value store.
- A daily cap as well as the total, per-visitor rate limits, and the plain voice as the default when the cap is hit.
- Sharing a world between devices needs a hosted database; saving is on-device only today.
- A decision on the name. "Eden" is a working name; alternatives: Kith, Small World, Firstlight, Terrarium, Seedworld.
