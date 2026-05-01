<div align="center">
  <img src="./assets/garden/c2-watercolor-peony.png" width="160" alt="watercolor peony" />

  # The Drifting Atelier

  *an attic of art from every age — pinned, taped, scattered, drift-able*

  **By Saqlain (@Razee4315)**

  [live demo](#) · [report a bug](https://github.com/Razee4315/drifting-atelier/issues) · [the asset pack](#assets)
</div>

---

## What's This?

Most art websites are grids. Boxes inside boxes. Polite. Predictable. This is not that.

The Drifting Atelier is an **infinite paper canvas** where art from every era of human history floats together. Cave handprints next to Polaroids. A child's crayon dragon next to a Renaissance hand study. Pressed flowers, ukiyo-e prints, surrealist apples, art deco posters, scribbled napkin doodles. **143 pieces, all AI-generated, all on transparent backgrounds, all draggable.**

You can pan, zoom, grab any piece, throw it, double-click it for a handwritten note, and the whole thing remembers what you did and brings it back next visit.

---

## How I Got the Idea

I wanted a website that wasn't a website. Not a portfolio, not a gallery, not a Bento grid. Something that felt like walking into a room.

The vibe target: an **artist's attic studio** where the walls and floor are covered in paper, and someone has been pinning art there for two thousand years and never thrown anything away. You can move things. The sun comes through a window. A ladybug walks across.

Then I had to figure out how to actually build it.

## The Image Generation Was a Nightmare

Real talk: **generating 143 cohesive AI images is not a piece of cake.**

Each piece needed:
- Transparent background (a non-trivial number of generations failed at this)
- The right "feel" for its era (ukiyo-e ≠ art deco ≠ child's crayon — and the model has opinions)
- A consistent paper-and-pencil studio aesthetic across nine wildly different style zones
- The right size and aspect ratio so the layout doesn't look like a wreck

I re-rolled some pieces 5+ times. Spent hours per category just curating. Wrote out detailed prompts for every single image up front so the pack would feel like one body of work and not a pile of stock illustrations.

The asset pack alone took as long as the website.

## What's Inside

**9 zones**, each with its own mood:

| Zone | Vibe |
|---|---|
| The Hearth | center, like an artist's desk |
| The Cave | ancient, ochre, prehistoric |
| The Garden | botanical, herbarium, slow |
| The Nursery | crayon, finger paint, age 6 |
| The Salon | Renaissance, Baroque, oil-painted |
| The Float | surrealist, dreamy, Magritte-ish |
| The Press | posters, woodblocks, Bauhaus |
| The Static | Polaroids, mixtapes, late-20th-century |
| Loose Ends | sticky notes, receipts, marginalia, scattered everywhere |

## Things I Built Into It

- **Infinite pan + zoom canvas** (Pixi.js v8, WebGL)
- **Every piece is draggable, throwable** with proper inertia and friction
- **Hover lifts pieces** and tilts them subtly toward your cursor
- **Double-click any piece** for a handwritten artist note about it
- **Hand-drawn pencil cursor** that leaves a faint graphite trail
- **Scatter-mode picker** on first visit — choose how the studio greets you (drift / by era / tight / wild)
- **Your arrangement is saved** — move things, refresh, they stay where you put them
- **Real ambient music** (CC0 from Pixabay, two tracks that crossfade so it never loops)
- **Procedural paper rustles** while panning, soft chimes when you throw a piece hard
- **Sun beam slowly rotates** across the canvas like real time passing
- **A ladybug walks across the screen** every couple of minutes
- **Hidden mega-image** revealed at extreme zoom-out (try it — keep zooming out)
- **Tape, pins, paperclips** randomly attached to ~70% of pieces
- **Pinch-zoom on mobile**, two-finger and one-finger gestures all work
- **Shift+R** clears your arrangement and starts fresh

## Running It Locally

```bash
git clone https://github.com/Razee4315/drifting-atelier.git
cd drifting-atelier
npm install
npm run dev
```

Then open http://localhost:5173/.

## Tech

- **[Pixi.js v8](https://pixijs.com/)** — WebGL renderer, handles 143+ sprites at 60fps
- **[Vite](https://vite.dev/)** — dev server + build
- **Web Audio API** — for paper rustles and chime SFX
- **HTML5 Audio** — for the ambient music tracks
- **localStorage** — saves your arrangement
- **Vanilla JS** — no React, no framework, ~290kb gzipped

No backend. Static deploy. Works on any host.

## Asset Credits

All 143 PNG images were generated via AI tools (mid-2025 era models) and individually curated. The two ambient music tracks are CC0 from [Pixabay](https://pixabay.com/music/). Fonts (Cormorant Garamond, Caveat, Special Elite) are from Google Fonts.

If you want the asset pack on its own, holler — I'll split it into a separate repo with prompts.json so you can extend it.

## License

Code: **MIT**. Use it however you want.

Asset pack & audio: see [LICENSE](./LICENSE) for the full breakdown.

---

*Built one paper scrap at a time. Wander freely.*
