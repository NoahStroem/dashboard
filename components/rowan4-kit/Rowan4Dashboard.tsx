'use client'

/**
 * Example dashboard wiring the whole kit together. Copy this and edit the
 * TILES array — swap hrefs, labels, and which animated <TileArt> each uses.
 *
 * Requires (all in this folder):
 *   - rowan4-kit.css         imported once in your root layout
 *   - Rowan4Backdrop.tsx
 *   - tiles/*TileArt.tsx      the six animated backgrounds
 *
 * The grid is a 6-cell bento (areas a–f). The default area mapping makes
 * tile #1 the 2x2 hero, #3 a tall 1x2, the rest 1x1.
 */

import { useRef } from 'react'
import Rowan4Backdrop from './Rowan4Backdrop'
import TrainTileArt from './tiles/TrainTileArt'
import FuelTileArt from './tiles/FuelTileArt'
import PeakTileArt from './tiles/PeakTileArt'
import MindTileArt from './tiles/MindTileArt'
import BrandTileArt from './tiles/BrandTileArt'
import FinanceTileArt from './tiles/FinanceTileArt'

type ArtKey = 'train' | 'fuel' | 'peak' | 'mind' | 'brand' | 'finance'

const ART: Record<ArtKey, () => React.JSX.Element> = {
  train: TrainTileArt,
  fuel: FuelTileArt,
  peak: PeakTileArt,
  mind: MindTileArt,
  brand: BrandTileArt,
  finance: FinanceTileArt,
}

// area = which grid cell (a–f). a = 2x2 hero, c = 1x2 tall, others = 1x1.
const TILES: Array<{ area: string; art: ArtKey; label: string; summary: string; href: string }> = [
  { area: 'a', art: 'train',   label: 'Train',   summary: 'Workouts, splits, sessions',        href: '#' },
  { area: 'b', art: 'fuel',    label: 'Fuel',    summary: 'Macros, weight, water, supplements', href: '#' },
  { area: 'c', art: 'peak',    label: 'Peak',    summary: 'Daily readiness',                   href: '#' },
  { area: 'd', art: 'mind',    label: 'Mind',    summary: 'Mentor, goals',                     href: '#' },
  { area: 'e', art: 'brand',   label: 'Brand',   summary: 'Archetype, clipping, socials',      href: '#' },
  { area: 'f', art: 'finance', label: 'Finance', summary: 'Net worth, subscriptions',          href: '#' },
]

export default function Rowan4Dashboard({ name = 'there' }: { name?: string }) {
  return (
    <main className="vk-page vk-grain">
      <Rowan4Backdrop />
      <div className="vk-shell">
        <header className="vk-header">
          <div className="vk-date">Your dashboard</div>
          <h1 className="vk-greeting">
            Welcome back, <span className="vk-greeting-name">{name}</span>
          </h1>
        </header>

        <div className="vk-grid">
          {TILES.map((t, i) => {
            const Art = ART[t.art]
            return (
              <Tile key={t.area} area={t.area} href={t.href} index={i + 1} label={t.label} summary={t.summary}>
                <Art />
              </Tile>
            )
          })}
        </div>
      </div>
    </main>
  )
}

/** One bento card with cursor-parallax on its art layer. */
function Tile({
  area, href, index, label, summary, children,
}: {
  area: string; href: string; index: number; label: string; summary: string; children: React.ReactNode
}) {
  const artRef = useRef<HTMLDivElement | null>(null)

  function onMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const art = artRef.current
    if (!art) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2)
    const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2)
    art.style.transform = `translate3d(${dx * 8}px, ${dy * 8}px, 0)`
  }
  function onLeave() {
    if (artRef.current) artRef.current.style.transform = 'translate3d(0,0,0)'
  }

  return (
    <a
      href={href}
      className={`vk-tile vk-area-${area}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="vk-tile-art" ref={artRef}>
        {children}
      </div>
      <span className="vk-tile-index">·{String(index).padStart(2, '0')}</span>
      <span className="vk-tile-label">{label}</span>
      <span className="vk-tile-summary">{summary}</span>
      <span className="vk-tile-arrow">→</span>
    </a>
  )
}
