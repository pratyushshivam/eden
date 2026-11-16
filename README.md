<a href="https://pratyushshivam.github.io/eden/"><img src="assets/shots/03-planet-by-day.jpg" width="100%" alt="Eden. A small blue and green planet seen from orbit against a field of stars: continents with forests, deserts and snow-capped mountains, shallow turquoise seas along the coasts, white cloud drifting over the oceans, and a thin blue line of air at its edge."></a>

<p align="center">
  <a href="https://pratyushshivam.github.io/eden/"><img alt="Open the planet in your browser" src="https://img.shields.io/badge/open%20the%20planet-in%20your%20browser-d4491a?style=for-the-badge&labelColor=15140f"></a>
  <a href="https://github.com/pratyushshivam/eden/actions/workflows/ci.yml"><img alt="Tests" src="https://img.shields.io/github/actions/workflow/status/pratyushshivam/eden/ci.yml?branch=main&style=for-the-badge&label=tests&labelColor=15140f&color=3c7a52"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-2a5c8f?style=for-the-badge&labelColor=15140f"></a>
  <img alt="Every creature has its own neural network" src="https://img.shields.io/badge/every%20creature-its%20own%20neural%20network-c9930f?style=for-the-badge&labelColor=15140f">
</p>

<p align="center">
  <a href="https://pratyushshivam.github.io/eden/"><b>Open it</b></a> ·
  <a href="#the-first-minute">The first minute</a> ·
  <a href="#the-planet">The planet</a> ·
  <a href="#the-minds">The minds</a> ·
  <a href="#words-beliefs-and-inventions">Words and beliefs</a> ·
  <a href="#walk-among-them">Walk among them</a> ·
  <a href="#the-numbers">The numbers</a> ·
  <a href="#what-is-real-and-what-is-not">What is real</a> ·
  <a href="#run-it">Run it</a> ·
  <a href="https://www.pratyushshivam.com/projects/eden/">The full write-up</a> ·
  <a href="https://www.pratyushshivam.com/">pratyushshivam.com</a>
</p>

# Eden

**A whole small planet in a browser tab. It starts with water, plants and nothing else. Every creature that will ever live on it, you set down. Every one of them thinks for itself.**

There is no script. Each creature carries its own small neural network, and that network decides where it goes, when it eats, whom it follows and what it runs from. When two creatures have a child, the child's brain is built from theirs. Nobody trains anything. The ones that work out how to live leave more children, and that is the only teacher there is.

One kind, the kith, goes further. They hold beliefs, pass them to each other (sometimes wrongly), make things nobody showed them how to make, and give those things names. Their words are written by a language model, from what each one has actually lived through.

And you can go down there. You can take a body of your own, walk among them shining, and find out what each of them makes of you.

**Open it:** [pratyushshivam.github.io/eden](https://pratyushshivam.github.io/eden/)

<a href="https://pratyushshivam.github.io/eden/"><img src="assets/clips/02-orbit-to-ground.gif" width="100%" alt="A recording. The planet turns slowly in space. The view falls towards one continent, through the cloud, past the curve of the horizon, and comes to rest above a wooded shore where small cloaked figures are walking between huts and a fire."></a>

<p align="center"><i>One zoom, from orbit to the ground. The whole planet is simulated all the time, whether you are looking or not.</i></p>

---

## Contents

- [The first minute](#the-first-minute)
- [The planet](#the-planet)
- [Life on it](#life-on-it)
- [The minds](#the-minds)
- [Words, beliefs and inventions](#words-beliefs-and-inventions)
- [Walk among them](#walk-among-them)
- [Curiosity and suspicion](#curiosity-and-suspicion)
- [Your hand](#your-hand)
- [The numbers](#the-numbers)
- [How it is built](#how-it-is-built)
- [What is real and what is not](#what-is-real-and-what-is-not)
- [Their words on the live page](#their-words-on-the-live-page)
- [Run it](#run-it)
- [Gallery](#gallery)

---

## The first minute

You arrive in orbit over an empty world. The page shows you the range in thirty seconds, without making you read: it falls to a wood by the water, sets down the first eight kith, follows one, and shows you what that one is thinking. Then it pulls back out and hands the planet to you.

<table>
<tr>
<td width="50%"><img src="assets/shots/01-empty-planet.jpg" alt="The planet from orbit before anything lives on it."></td>
<td width="50%"><img src="assets/shots/02-choose-a-mind.jpg" alt="The picker. Three columns: simple mind, clever mind, thinker mind. Each shows a small diagram of its network, how many neurons and weights it has, and the kinds of creature in that tier."></td>
</tr>
<tr>
<td><i>It starts empty. Seas, forests, deserts, ice.</i></td>
<td><i>You choose a kind by the size of its mind, then tap anywhere.</i></td>
</tr>
</table>

<img src="assets/clips/17-set-them-down.gif" width="100%" alt="A recording. The picker opens, a murr is chosen, and six taps on a green hillside set down six small long-armed creatures, which at once begin to move about on their own.">

The full guided minute, recorded: [`assets/first-minute.mp4`](assets/first-minute.mp4).

---

## The planet

Not a flat map. A sphere of 38,400 cells with a radius of 90 units, grown from a single number. The same number always grows the same world.

- **Continents and islands** from layered noise, with the shoreline set so that about a third of the surface is land.
- **Climate** from latitude and height: ice at the poles, a dry belt, jungle near the middle, cold steppe, mountains.
- **Rivers** traced downhill from wet high ground until they reach the sea or fill a hollow and become a lake.
- **A day and a year.** The planet turns under its sun once every two minutes, and it leans, so the north and the south have opposite seasons.
- **Weather** that drifts across it. Grass, fruit and sea life grow by warmth, season and rain, and are eaten down by whatever lives there.

<table>
<tr>
<td width="50%"><img src="assets/shots/04-the-terminator.jpg" alt="The planet seen with the line between day and night running down its face."></td>
<td width="50%"><img src="assets/shots/07-north-pole.jpg" alt="The planet seen from above its north pole, a white cap of ice ringed by sea and green land."></td>
</tr>
<tr>
<td><img src="assets/shots/09-continent-edge.jpg" alt="Half way down: the curve of the planet, a continent with grey mountains, dark forest and pale grassland, and cloud shadows on the ground."></td>
<td><img src="assets/shots/10-coast-from-above.jpg" alt="A coastline from above: turquoise shallows, a line of white foam, forest coming down to the shore."></td>
</tr>
<tr>
<td><img src="assets/shots/11-desert.jpg" alt="A desert: sand-coloured hills, scattered rocks and a few tall green spires."></td>
<td><img src="assets/shots/12-mountains.jpg" alt="Mountains: grey rock with snow on the heights, boulders, and the sea beyond."></td>
</tr>
<tr>
<td><img src="assets/shots/14-jungle.jpg" alt="Jungle: dense palms and broad trees on a hill above the water."></td>
<td><img src="assets/shots/33-pulling-away.jpg" alt="Pulling away from the ground: the land dropping back into the curve of the planet."></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/01-orbit.gif" width="100%" alt="A recording of the planet turning in space, cloud drifting over the seas."></td>
<td width="50%"><img src="assets/clips/10-a-day-in-seconds.gif" width="100%" alt="A recording at high speed from the ground: the sun crosses the sky, shadows swing round, night falls and fires show, and day comes again."></td>
</tr>
<tr>
<td><i>From orbit.</i></td>
<td><i>A day in seconds, from the ground.</i></td>
</tr>
</table>

### Night

The far side of the planet is dark, and what the kith have lit shows from space.

<table>
<tr>
<td width="50%"><img src="assets/shots/05-night-side-fires.jpg" alt="The night side of the planet from orbit. One patch of land glows warm orange where camp fires are burning."></td>
<td width="50%"><img src="assets/shots/06-night-side-closer.jpg" alt="Closer to the night side: fire light on hills and trees, the thin glow of air at the planet's edge."></td>
</tr>
<tr>
<td><img src="assets/shots/18-kith-by-the-fire-at-night.jpg" alt="On the ground at night: kith gathered at a fire among trees, the light orange on the trunks and on their cloaks."></td>
<td><img src="assets/shots/19-campfires-from-the-hill.jpg" alt="A village at night seen from a hill: several fires, huts, and dark forest around."></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/08-campfire-night.gif" width="100%" alt="A recording of kith around a fire at night, the flames flickering."></td>
<td width="50%"><img src="assets/clips/09-ground-to-orbit-at-night.gif" width="100%" alt="A recording: the view rises from a fire-lit camp at night, up through the dark, until the whole planet is in view with one small warm glow on its night side."></td>
</tr>
</table>

---

## Life on it

Seven kinds, all invented for this planet, in three tiers of mind. You decide which ones exist, where, and how many. Fruit and grass grow on their own; everything that eats them, you bring.

| Kind | Mind | What it is |
|---|---|---|
| **Dapple** | simple | Round grazers that keep together. |
| **Russet** | simple | Lean red hunters. They need prey, and they fear fire. |
| **Skim** | simple | White fliers that fish the shallows. |
| **Glim** | simple | Sea drifters that glow in the dark. |
| **Murr** | clever | Long-armed foragers. They remember where food was, play, and grieve. |
| **Kest** | clever | Dark fliers that watch, follow, and clean up the dead. |
| **Kith** | thinker | Small upright folk. They talk, believe, and make things. |

<table>
<tr>
<td width="50%"><img src="assets/shots/20-dapple-herd.jpg" alt="A herd of round cream-and-brown dapples on a hillside above the sea."></td>
<td width="50%"><img src="assets/shots/21-dapples-close.jpg" alt="Dapples seen close, one ringed in orange where it is being followed."></td>
</tr>
<tr>
<td><img src="assets/shots/23-murr-troop.jpg" alt="A troop of grey-blue murrs among palms by the water."></td>
<td><img src="assets/shots/24-murr-close.jpg" alt="Murrs seen close: heavy shoulders, long dark arms, small pale faces."></td>
</tr>
<tr>
<td><img src="assets/shots/25-glims-in-the-shallows.jpg" alt="Glims, small bell-shaped sea creatures, drifting in bright shallow water."></td>
<td><img src="assets/shots/27-skims-over-the-water.jpg" alt="A white skim in flight over the sea."></td>
</tr>
<tr>
<td><img src="assets/shots/28-kests.jpg" alt="A dark kest in the air above a snowy shore."></td>
<td><img src="assets/shots/29-russet-hunting.jpg" alt="A red russet running along a shoreline."></td>
</tr>
<tr>
<td><img src="assets/shots/15-kith-village-morning.jpg" alt="A kith village in the morning: cloaked figures, huts, a fire, a river."></td>
<td><img src="assets/shots/16-kith-close.jpg" alt="Kith seen close, in cloaks of different colours, beside a fire and a stone marker."></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/04-dapple-herd.gif" width="100%" alt="A recording of dapples grazing and moving as a herd."></td>
<td width="50%"><img src="assets/clips/05-murrs.gif" width="100%" alt="A recording of murrs foraging and chasing each other."></td>
</tr>
<tr>
<td><img src="assets/clips/03-kith-at-home.gif" width="100%" alt="A recording of kith at home: walking between huts, carrying wood, sitting at a fire."></td>
<td><img src="assets/clips/11-rain.gif" width="100%" alt="A recording of rain falling on a herd on a hillside."></td>
</tr>
</table>

What you will see them do, none of it written as a rule: herd, flee, hunt, find water, sleep at night, shelter, follow a parent, stop for a while where one of their own has died, play, and come to look at anything new you drop near them. When the kith are left alone for a few days they fell trees, carry the wood home, and their huts gather into villages.

<table>
<tr>
<td width="50%"><img src="assets/shots/17-kith-golden-hour.jpg" alt="A kith settlement in low warm light."></td>
<td width="50%"><img src="assets/shots/22-dapples-at-dusk.jpg" alt="Dapples on a ridge in low light, the sea behind."></td>
</tr>
<tr>
<td><img src="assets/shots/30-rain-on-the-herd.jpg" alt="Rain falling on a hillside where a herd is grazing."></td>
<td><img src="assets/shots/31-horizon-at-sunrise.jpg" alt="Near the ground soon after sunrise, the sky blue above the curve of the land."></td>
</tr>
</table>

---

## The minds

Every individual has its own feed-forward network. The same 21 senses go in: hunger, thirst, tiredness, fear, cold, the dark, food in sight, water near, its own kind near, something new, a place it believes is dangerous, and so on. The same 22 decisions come out. What differs between the tiers is what lies between.

| Tier | Hidden neurons | Weights | What it has beyond the network |
|---|---|---|---|
| **Simple** | 8 | 374 | Nothing. It remembers only where it last drank. |
| **Clever** | 12 | 550 | Memory of places that fed it or hurt it. Play, grief, curiosity. No words. |
| **Thinker** | 16 | 726 | Beliefs, talk, invention, and words written by a language model. |

The first eleven decisions are not actions. They are weights on directions: how much to head for food, for water, for its own kind, away from a threat, home, towards a place it believes is good. The creature moves along the sum. A brain of random numbers runs from food and walks at hunters. That is why brains had to be bred.

**How a brain is inherited.** A creature you set down arrives with rough instincts and a lot of noise. Every creature born after that gets its weights copied, in runs, from its mother and its father, with about one in twelve nudged at random. Open any creature and the page shows how far its brain has drifted from each parent's.

<table>
<tr>
<td width="50%"><img src="assets/shots/37-its-brain-live.jpg" alt="A creature's card open at its brain: three columns of dots joined by orange and grey lines, the strongest signals flowing at this moment, with a note of what it senses most and decides most, and bars showing how different its brain is from its mother's and its father's."></td>
<td width="50%"><img src="assets/shots/47-how-the-minds-work.jpg" alt="The Minds view: the three tiers of mind, each with a diagram of its network and its count of neurons and weights."></td>
</tr>
<tr>
<td><i>Any creature's network, live: senses, hidden layer, decisions.</i></td>
<td><i>The three tiers, explained on the page.</i></td>
</tr>
<tr>
<td><img src="assets/shots/48-getting-better-at-surviving.jpg" alt="A chart on the Minds view: mean age at death for each kind, day by day, the lines rising."></td>
<td><img src="assets/shots/42-a-simple-mind.jpg" alt="The card of a dapple: a simple mind, with its needs, its live network, its origin and its life so far."></td>
</tr>
<tr>
<td><i>Are they getting better at it? Mean age at death, by kind, by day.</i></td>
<td><i>A simple mind.</i></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/13-open-a-mind.gif" width="100%" alt="A recording: a kith is tapped, the view flies to it, and its card opens with its thought, its needs and its network."></td>
<td width="50%"><img src="assets/clips/14-live-brain.gif" width="100%" alt="A recording of a creature's network changing as it moves: dots brightening and fading, lines shifting."></td>
</tr>
</table>

**Clever animals have no words, so the page reads their network for them.** A murr's card shows two or three plain words taken straight from its strongest senses and decisions: *thirsty · hungry · wants water*. No language model is involved.

<img src="assets/shots/41-a-clever-animal-with-no-words.jpg" width="100%" alt="The card of a murr, a clever mind. Under 'What it feels, with no words' is a short line of plain words read from its network, with a note that no language model is involved.">

---

## Words, beliefs and inventions

Only the kith get words, and they are used sparingly: when you open one, when one comes of age and names itself, when two meet, when one makes something, when one first sees you. Each request carries that individual's real log, kin, beliefs and what it has made. The model is told to use nothing else.

These came out of real runs:

> *"Sava said we come down out of the sky, not from any belly, and I saw three of us come down at Vashi with my own eyes. So it is true. But Sava is gone now, gone to the thirst, and the sky that gave us does not give her back."*

> *"I was carrying fire up the slope in my hand and it burned too low, so I wrapped dry grass around a branch and it held the flame high over my head. Now I can walk at night and see the dark, and the red hunters see the flame and go wide of me."*

> *"Cold took the little one, didn't it. Before the leaves turned."*
> *"It did. Thirst, by the long water. I do not say its name because it has none."*
> *"Then give me one, so the dark has something to hold when it comes for me."*

<table>
<tr>
<td width="50%"><img src="assets/shots/35-a-mind-in-its-own-words.jpg" alt="A kith's card: its name, a paragraph in its own words about its life, and a note that it was written by a language model from this life."></td>
<td width="50%"><img src="assets/shots/44-conversations.jpg" alt="The Chronicle view at Conversations: exchanges between named kith, each with a line saying which belief was passed on."></td>
</tr>
<tr>
<td><img src="assets/shots/40-its-life-so-far.jpg" alt="A kith's life so far: a dated list of what has happened to it."></td>
<td><img src="assets/shots/43-chronicle.jpg" alt="The Chronicle: the planet's history, written from the events themselves."></td>
</tr>
</table>

### From an event, to a word, to a belief, to a changed life

This loop is the centre of the whole thing.

1. **Something happens** to one of the kith at a place: a narrow escape, a kill it saw, food found when it was starving.
2. **It comes to believe** something about that place. The belief is a new input to its own network.
3. **It tells another** when they meet. One telling in eight is misheard as a different place, and then a wrong idea is born and travels too.
4. **The hearers go elsewhere**, or go there. The page measures it: how often an idea's holders were at the place before they held it, and since.

<table>
<tr>
<td width="50%"><img src="assets/shots/45-an-idea-on-the-land.jpg" alt="The Ideas view with one belief open: who it began with, each telling of it from one kith to another, and a ring drawn on the land around the place it is about."></td>
<td width="50%"><img src="assets/shots/49-event-to-word-to-belief-to-behaviour.jpg" alt="The Minds view tracing one real idea in four numbered steps: the event, the belief, the tellings, and the measured change in where its believers go."></td>
</tr>
</table>

<img src="assets/clips/15-follow-an-idea.gif" width="100%" alt="A recording: the Ideas view opens, a belief is tapped, the view flies to the place it is about, a ring appears on the land, and arcs join the kith who told it to each other.">

A test in this repository runs the experiment cleanly: twenty-four kith around a place, half of them told it is dangerous, three days. The half who believe it spend less than three quarters as much time there as the rest.

### Making things

No kith is given a tool. Each handles what its life puts in its hands: stone in the mountains, clay by water, bone at a carcass, fire once someone has lit one. When its network chooses to try things, and what it has handled could really become something, the language model decides which thing *this* one makes, and what its people will call it. From then on the thing is real.

| Made thing | Needs | What it changes |
|---|---|---|
| A sharp stone | stone, bone | It can cut meat from the dead, and so eat it. |
| A digging stick | wood, stone | More food from the same ground. |
| A carrying basket | long grass, wood | It carries food, and can go half as long again without eating. |
| A spear | wood, stone, bone, and a sharp stone first | It can hunt. |
| A fired pot | clay, fire | It keeps water by it, and thirsts half as fast. |
| A hide cloak | hide, bone, and a sharp stone first | The cold bites much less. |
| A net | vine, shell | It can take food from the shallows. |
| A raft | wood, vine, and a basket first | **It can cross the sea.** |
| Sowing | fruit stones, wood, and a digging stick first | The bushes it eats from bear more. |
| Cooking | fire, fruit stones | Food eaten by a fire feeds it better. |
| A stone wall | stone, clay | Its shelters stand four times as long. |
| A carried fire | fire, wood, vine | It sees at night, and the hunters keep away. |

Knowledge passes only by being shown or told, and it dies with its last holder. Peoples on different lands name the same thing differently: in one run the fired pot was *hala* on one continent and *shem* on another.

<table>
<tr>
<td width="50%"><img src="assets/shots/46-things-they-invented.jpg" alt="The Ideas view at Made things: each thing the kith have invented, under the name they gave it, with who made it first, on which land, and how the knowledge travelled."></td>
<td width="50%"><img src="assets/shots/39-what-it-makes-and-believes.jpg" alt="A kith's card: the things it has learned to make and who showed it, what it has had in its hands, and what it believes."></td>
</tr>
</table>

---

## Walk among them

Press **Take avatar** and you are down there: one of the kith in shape, but shining with your own light, born of no one.

- **W A S D** to walk, the **mouse** to look, **Shift** to run, **Space** to jump, **V** to bring the view near or far. You swim through water and can cross a sea.
- **Everyone who sees you decides for itself what to do about you.** Its own network already treats you as the newest thing there is. On first sight the language model is asked what *this* one does, given its nature and its life: come closer, watch, flee, attack, attach itself to you, or run to fetch others. That choice then drives its own brain. Clever animals come to look. Russets hunt you as they hunt any kith.
- **They may name you.** In one run the first kith to see the stranger called it *Shoon*, and the name stuck.
- **Walk up to one and press E to talk.** The world slows almost to a stop while you type.
- **What you say is real to them.** Tell one that the forest is dangerous and it may believe you, avoid the forest, and tell the others.

<table>
<tr>
<td width="50%"><img src="assets/shots/52-in-a-body-of-your-own.jpg" alt="In a body of your own: a pale shining figure in the foreground, kith and huts ahead, hills and sky beyond."></td>
<td width="50%"><img src="assets/shots/53-press-e-to-talk.jpg" alt="Standing beside a kith. A small prompt reads: E, Talk to, and its name."></td>
</tr>
<tr>
<td><img src="assets/shots/54-talking-with-one-of-them.jpg" alt="The talk box open: what you said, what the kith answered, and a line saying the world slows while you type."></td>
<td><img src="assets/shots/55-telling-it-the-truth.jpg" alt="The talk box after telling a kith that its world is kept inside something that belongs to you, and its answer."></td>
</tr>
<tr>
<td><img src="assets/shots/56-the-shining-stranger.jpg" alt="The shining stranger seen from outside, glowing among the trees by day."></td>
<td><img src="assets/shots/57-the-shining-stranger-at-night.jpg" alt="The shining stranger at night, lighting the ground and the trees around it, a kith watching."></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/19-take-a-body.gif" width="100%" alt="A recording: the Take avatar button is pressed, the view drops behind a shining figure, and it walks, turns and jumps."></td>
<td width="50%"><img src="assets/clips/20-they-see-you.gif" width="100%" alt="A recording of the shining figure standing near kith as they react to it."></td>
</tr>
<tr>
<td><img src="assets/clips/21-talk-to-them.gif" width="100%" alt="A recording: walking up to a kith, pressing E, typing a sentence while the world slows, and its answer appearing."></td>
<td><img src="assets/clips/22-swim-and-roam.gif" width="100%" alt="A recording of the shining figure running across the land."></td>
</tr>
</table>

A real exchange, from the first time this was tried:

> **You:** *I am the one who set you down here. This whole world is small, and it is kept inside a thing that belongs to me.*
>
> **It:** *You said the whole world is kept inside a thing that belongs to you. What thing? Where is it? I want to see it.*
>
> What it thought and did not say: *If the world sits inside a thing, what sits outside it, and can I walk there?*

It then held a new belief, in its own words: *"The world is small and held inside something of Shoon's."*

---

## Curiosity and suspicion

Every kith's card carries two measures.

**Curiosity** is inherited, grows with what it finds, and sets how often it tries to make things.

**Suspicion** is how far it has come to think that its world is made, and watched. It starts at nothing. It rises only from what happens:

- something arriving out of the sky with no cause (itself, food, a beast, sudden rain), up to a ceiling;
- seeing you walking among them;
- talking with you, by an amount the model judges from what was said, kept within bounds;
- hearing it from one who suspects more, and from its mother as it grows up.

The model is told to write from exactly that level and no further. At nothing, a kith does not think about such things. Near the top it reasons, in its own words, towards a made world held inside something that belongs to the watcher. It has no word for a machine unless you go down and say one.

<img src="assets/shots/36-curiosity-suspicion-and-needs.jpg" width="100%" alt="A kith's card showing two bars, Curiosity and Suspicion, each with a number, and a line describing what its present level of suspicion means and how it has taken the stranger.">

---

## Your hand

- **Spin, zoom, look.** Drag to spin the planet. Pinch or scroll to go from orbit to the ground. Right-drag, or turn two fingers, to look around.
- **Set down** any kind, anywhere, at any time.
- **Rain, drought, cold, food.** Choose one, then tap the place. The kith nearby remember it as something that came out of the sky.
- **Happening now.** Births, deaths, hunts, first meetings, inventions: a strip on the left and rings on the globe. Tap one and you are taken there.
- **Follow anyone.** Tap a creature for its card: thought, needs, live brain, origin, family line back to the one you set down, the path it has walked drawn on the ground, what it believes, what it can make, and its whole life.
- **Time.** Pause, 1×, 8×, 32×.
- **Photo mode** hides the page and saves a 3840-pixel still.
- **It is saved as you go**, in your browser, on your device. Close the tab and your planet is as you left it.

<table>
<tr>
<td width="50%"><img src="assets/shots/34-happening-now.jpg" alt="The planet from orbit with the Happening now strip at the left listing recent events, and rings on the globe where they took place."></td>
<td width="50%"><img src="assets/shots/38-origin-and-family.jpg" alt="A creature's card at Origin and Family: where and when it was born, to whom, its mother's line back to the one set down, how far it has come, its mate and children."></td>
</tr>
</table>

<table>
<tr>
<td width="50%"><img src="assets/clips/12-happening-now.gif" width="100%" alt="A recording of the planet at eight times speed, events appearing in the strip and rings pulsing on the globe."></td>
<td width="50%"><img src="assets/clips/18-food-from-the-sky.gif" width="100%" alt="A recording: food is dropped on a hillside and creatures come to it."></td>
</tr>
</table>

<table>
<tr>
<td width="33%"><img src="assets/shots/phone-1-planet.jpg" alt="The planet on a phone screen."></td>
<td width="33%"><img src="assets/shots/phone-2-card.jpg" alt="A creature's card on a phone screen, as a sheet rising from the bottom."></td>
<td width="33%"><img src="assets/shots/phone-3-picker.jpg" alt="The picker on a phone screen."></td>
</tr>
</table>

---

## The numbers

Measured on one laptop (16 logical cores, RTX 4060 and Intel UHD), at 1920 × 1080.

| | |
|---|---|
| Cells on the planet | 38,400 |
| Kinds of creature | 7, in 3 tiers of mind |
| Weights in one brain | 374, 550 or 726 |
| Creatures alive at once | up to 800, each running its own network |
| One step of the whole planet | about 0.4 ms with 170 creatures |
| Headless speed | 1,300 to 2,500 steps a second |
| Frame rate, RTX 4060 | 60 fps at every zoom, and at 32× speed |
| Frame rate, Intel UHD | 58 from orbit, 44 to 52 near the ground |
| Cost of one thought | about $0.0004 |
| Tests | 36 |

<img src="assets/shots/50-measured-numbers.jpg" width="100%" alt="The Minds view at Measured, on this device, right now: creatures alive, weights across all living brains, world steps per second, time to step the planet once, frames per second, born and died, ideas and things made, and the cost of one thought.">

The page shows these live, for whatever device it is running on.

---

## How it is built

```
src/engine     the world. Pure TypeScript, no DOM, fixed time step, one seeded random generator.
  sphere.ts    the planet as a grid: a cube blown up into a sphere
  terrain.ts   continents, climate, rivers, places worth a name
  net.ts       the network, inheritance, the instincts the first of a kind arrive with
  world.ts     senses, decisions, eating, breeding, hunting, beliefs, the visitor's body
  craft.ts     what can be made, from what
  story.ts     turning events into sentences, and taking the model's words back into the world
src/render     three.js. Land, ocean, air, cloud, space, instanced plants and creatures
src/ui         the page: panels, the word client, saving, sound
server         the one place the language model is called from, with its spending guard
tests          36 tests
```

**The simulation is deterministic.** The same seed and the same actions give the same history, and a test checks it. Another checks the energy books: everything alive was given or grown, minus what was burned or lost, to one part in a million. Another checks that a world restored from a save carries on exactly as the original would have.

**Brains that have been bred beat brains of noise.** A test evolves dapples for thirty days, puts their descendants' brains against random ones on fresh ground, and requires the bred ones to survive far longer.

**The drawing steps down by itself on slower machines**: smaller shadows, then cheaper water and cloud, then no shadows, then a slightly softer picture.

**The language model is fenced in.** The page cannot send it a prompt. It sends facts about creatures, and the prompt is built from those. What a visitor types to a kith is passed as speech that kith heard, never as an instruction. Every answer is priced from its token counts, and calls stop at a hard ceiling.

---

## What is real and what is not

Plainly, because it matters:

- **Learned by each creature's own network, on your device:** moving, eating, drinking, resting, fleeing, hunting, herding, breeding, following, playing, fetching wood, building, making fire, choosing to try things. Nothing trains these networks. They are inherited and selected.
- **Written by a language model:** the kith's words, their names, which thing a kith makes when several are possible, and how each one takes the stranger. The model is given that individual's real life and told to use nothing else.
- **Rules, not learned:** physics and bodies (how fast, how hungry, what can be eaten), how a belief forms from an event, what each made thing does. A kith cannot invent something outside the table above.
- **Suspicion is a number.** It rises from real events and it limits what the model may conclude. It is not self-awareness, and nothing here is conscious.
- **The ecology is not perfectly balanced.** Hunters die out without a large prey base. Skims and glims compete for the same sea food and one usually loses. No one kind may exceed 220.
- **The graphics have limits.** The air is a glow at the edge, not true scattering. Clouds are a shaded shell. Rivers are painted onto the land. Creatures hop and lean; their limbs do not move.
- **The avatar needs a keyboard.** There are no touch controls for walking yet.

---

## Their words on the live page

The live page is static: it has no server, so it has nowhere safe to keep a key. Out of the box the kith speak in a plain built-in voice assembled from their own logs, and everything else works.

To hear them in their own words there, open **About** and connect a DeepSeek key of your own. It is kept only in your browser, is sent only to DeepSeek, and will not spend more than $0.50 from that browser. A thought costs about four hundredths of a cent.

<img src="assets/shots/51-about-and-words.jpg" width="100%" alt="The About view, with a section called Their words where a key can be connected.">

Run locally, the key lives in a file on your machine and never reaches the page at all.

---

## Run it

```bash
git clone https://github.com/pratyushshivam/eden.git
cd eden
npm install
npm run dev
```

Open http://localhost:5260.

To give the kith words locally, copy `.env.example` to `.env.local` and put a DeepSeek key in it. The dev server reads it on its own side and the page never sees it.

```bash
npm test
npm run build
```

Useful switches in the address bar: `?seed=7` for a particular planet, `&fresh` to ignore the saved one, `&tour` to replay the first minute, `&debug` for frame rate and steps per second.

How everything works, what is tuned and what is rough: [`NOTES.md`](NOTES.md).

---

## Gallery

<table>
<tr>
<td width="50%"><img src="assets/photo-planet.jpg" alt="A photo-mode still of the planet from orbit."></td>
<td width="50%"><img src="assets/photo-ground.jpg" alt="A photo-mode still from near the ground: a murr wading in a turquoise bay under a wooded hill."></td>
</tr>
<tr>
<td><img src="assets/shots/32-horizon-at-noon.jpg" alt="Near the ground at noon: murrs on a hillside, the horizon curving away."></td>
<td><img src="assets/clips/16-minds-view.gif" width="100%" alt="A recording of the Minds view being read from top to bottom: the tiers, the chart, the traced idea."></td>
</tr>
</table>

---

Built by [Pratyush Shivam](https://www.pratyushshivam.com/). MIT licence. Typeface: Geist, by Vercel, under the SIL Open Font License.
