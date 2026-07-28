# Rowan4 Kit

The exact look + animation of the Vitality dashboard, packaged to drop into any
Next.js / React app. Pure vanilla CSS — no Tailwind, no animation libraries.

```
rowan4-kit/
  rowan4-kit.css          tokens, grain, bento grid, tile + entrance, backdrop styles
  Rowan4Backdrop.tsx      aurora + mountains + drifting particles
  Rowan4Dashboard.tsx     example page wiring it all together (edit the TILES array)
  tiles/                  the 6 animated tile backgrounds (self-contained)
    TrainTileArt, FuelTileArt, PeakTileArt, MindTileArt, BrandTileArt, FinanceTileArt
```

## Install (3 steps)

**1. The `rowan4-kit/` folder** already lives here at `components/rowan4-kit/`.

**2. Import the stylesheet once** in your root `app/layout.tsx`:
```ts
import './components/rowan4-kit/rowan4-kit.css'
```

**3. Render the dashboard** (or copy `Rowan4Dashboard.tsx` into your own page):
```tsx
import Rowan4Dashboard from '@/components/rowan4-kit/Rowan4Dashboard'

export default function Page() {
  return <Rowan4Dashboard name="Rowan" />
}
```

That's it. You get the black canvas, mint accents, film grain, drifting-particle
backdrop, the cascading tile entrance, cursor-parallax, and all six animated
tile arts.

## Fonts (optional but recommended)

The editorial italic headlines want a serif. In your root layout:
```ts
import { Instrument_Serif } from 'next/font/google'
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400',
  style: ['normal', 'italic'], variable: '--vk-font-serif' })
// add serif.variable to your <html className=...>
```
Without it the kit falls back to Times New Roman / Georgia — still italic, just less refined.

## Customizing

- **Recolor everything:** change `--vk-mint` (and `--mint`) in `rowan4-kit.css`. One line reskins the whole thing.
- **Tweak the feel:** `--vk-ease-premium: cubic-bezier(0.16,1,0.3,1)` is the signature easing. It's on every state change.
- **Swap tiles:** edit the `TILES` array in `Rowan4Dashboard.tsx` — change labels, hrefs, and which `art` each cell uses.
- **Relayout the bento:** edit `grid-template-areas` under `.vk-grid` (cells are named `a`–`f`).
- **No animated art on a tile?** Use a static gradient class instead: `vk-art-aurora`, `vk-art-dots`, `vk-art-grid`, `vk-art-duotone`.

## Notes

- All kit classes are `vk-` prefixed, so they won't collide with your existing styles.
- The `tiles/*.module.css` files use CSS Modules (locally scoped) — no prefix needed.
- Everything respects `prefers-reduced-motion`.
