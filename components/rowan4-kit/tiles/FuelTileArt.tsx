'use client'

import { useEffect, useRef } from 'react'
import styles from './FuelTileArt.module.css'

/*
 * Fuel tile background — "Nutrient Inflow". A breathing core sits
 * right-of-centre; nutrient particles stream inward and are absorbed. Every
 * 5-15s the core celebrates being fed with a minimal, orb-scale version of one
 * of the gem-library bursts, never the same kind twice in a row.
 *
 * Client component: it measures the tile to position the inflow particles
 * (so the stream stays centred on the core at any tile size) and schedules
 * the feed bursts. All timers are cleaned up on unmount.
 */

const KINDS = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit'] as const
type Kind = (typeof KINDS)[number]

export default function FuelTileArt() {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const field = root.querySelector<HTMLDivElement>(`.${styles.field}`)
    const core = root.querySelector<HTMLDivElement>(`.${styles.core}`)
    const burst = root.querySelector<HTMLDivElement>(`.${styles.burst}`)
    if (!field || !core || !burst) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: ReturnType<typeof setTimeout>[] = []
    const created: HTMLElement[] = []

    // — steady inflow particles — kept TIGHT around the core (right side) so
    //   they read as "feeding the core", not scattered particles that make the
    //   tile look transparent. Short travel, contained radius, fewer dots. —
    if (!reduce) {
      const w = root.clientWidth || 560
      const h = root.clientHeight || 200
      const cx = w * 0.68
      const cy = h * 0.52
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('span')
        p.className = styles.p
        const ang = Math.random() * Math.PI * 2
        // start close to the core (60-110px) instead of out near the tile edges
        const dist = 60 + Math.random() * 50
        const sx = cx + Math.cos(ang) * dist
        const sy = cy + Math.sin(ang) * dist
        p.style.left = sx + 'px'
        p.style.top = sy + 'px'
        p.style.setProperty('--tx', (cx - sx) * 0.96 + 'px')
        p.style.setProperty('--ty', (cy - sy) * 0.96 + 'px')
        const dur = 6.5 + Math.random() * 4 // slower drift — calmer, cozier
        p.style.setProperty('--dur', dur + 's')
        p.style.setProperty('--delay', -Math.random() * dur + 's')
        field.appendChild(p)
        created.push(p)
      }
    }

    // — one feed burst: spawn the burst's elements, pop the core —
    function fire(kind: Kind) {
      if (!burst || !core) return
      const add = (cls: string, n: number, setup?: (el: HTMLSpanElement, i: number, n: number) => void) => {
        for (let i = 0; i < n; i++) {
          const el = document.createElement('span')
          el.className = cls
          setup?.(el, i, n)
          burst.appendChild(el)
          const t = setTimeout(() => el.remove(), 2000)
          timers.push(t)
        }
      }
      const deg = (i: number, n: number) => `${(360 / n) * i}deg`
      if (kind === 'rings') {
        add(styles.bRing, 1)
        add(`${styles.bRing} ${styles.bRing2}`, 1)
        add(`${styles.bRing} ${styles.bRing3}`, 1)
      } else if (kind === 'particles') {
        add(styles.bDot, 12, (el, i, n) => el.style.setProperty('--angle', deg(i, n)))
      } else if (kind === 'sparkles') {
        add(styles.bSpk, 10, (el) => {
          const a = Math.random() * Math.PI * 2
          const r = 12 + Math.random() * 8
          el.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`
          el.style.animationDelay = Math.random() * 0.4 + 's'
        })
      } else if (kind === 'rays') {
        add(styles.bRay, 12, (el, i, n) => el.style.setProperty('--angle', deg(i, n)))
      } else if (kind === 'confetti') {
        add(styles.bConf, 14, (el, i, n) => {
          el.style.setProperty('--angle', `${(360 / n) * i + Math.random() * 16}deg`)
          el.style.setProperty('--dist', `${26 + Math.random() * 14}px`)
        })
      } else if (kind === 'orbit') {
        add(styles.bOrb, 8, (el, i, n) => el.style.setProperty('--angle', deg(i, n)))
      }
      core.classList.add(styles.fed)
      timers.push(setTimeout(() => core.classList.remove(styles.fed), 700))
    }

    // — schedule feeds every 5-15s, never the same kind twice —
    let lastKind: Kind | null = null
    function scheduleFeed() {
      const next = 5000 + Math.random() * 10000
      timers.push(
        setTimeout(() => {
          let k = KINDS[Math.floor(Math.random() * KINDS.length)]
          if (k === lastKind) k = KINDS[(KINDS.indexOf(k) + 1) % KINDS.length]
          lastKind = k
          fire(k)
          scheduleFeed()
        }, next),
      )
    }

    if (!reduce) {
      // a first burst shortly after mount, then the steady cadence
      timers.push(setTimeout(() => fire(KINDS[Math.floor(Math.random() * KINDS.length)]), 1500 + Math.random() * 1500))
      scheduleFeed()
    }

    return () => {
      timers.forEach(clearTimeout)
      created.forEach((el) => el.remove())
    }
  }, [])

  return (
    <div className={styles.root} ref={rootRef} aria-hidden>
      <div className={styles.base} />
      <div className={styles.glow} />
      <div className={styles.field} />
      <div className={styles.core}>
        <div className={styles.halo} />
        <div className={styles.orb} />
        <div className={styles.burst} />
      </div>
    </div>
  )
}
