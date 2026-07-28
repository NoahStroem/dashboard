'use client'

import { useEffect, useRef } from 'react'
import styles from './MindTileArt.module.css'

/*
 * Mind tile background — "Sonar radar". A small, self-contained radar disc that
 * is IDLE almost all the time. Every 25-45s (random, rare) it does ONE single
 * sweep spin, then goes quiet again. No blips/dots at all — just the calm scope
 * and the occasional sweep. Minimal.
 *
 * Client component: schedules the rare sweeps and re-triggers the one-shot
 * spin animation. All timers cleared on unmount; honours reduced-motion.
 */
export default function MindTileArt() {
  const radarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const radar = radarRef.current
    if (!radar) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sweep = radar.querySelector<HTMLDivElement>(`.${styles.sweep}`)
    const arm = radar.querySelector<HTMLDivElement>(`.${styles.arm}`)
    if (!sweep || !arm) return

    const timers: ReturnType<typeof setTimeout>[] = []

    function doSweep() {
      // one full spin — restart the animation by reflowing the class
      ;[sweep!, arm!].forEach((el) => {
        el.classList.remove(styles.spinning)
        void el.offsetWidth // reflow so the animation re-triggers
        el.classList.add(styles.spinning)
      })
      schedule()
    }

    function schedule() {
      const next = 25000 + Math.random() * 20000 // rare: 25-45s
      timers.push(setTimeout(doSweep, next))
    }

    // first sweep a few seconds after mount so it's visible once, then rare
    timers.push(setTimeout(doSweep, 3000 + Math.random() * 3000))

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.base} />
      <div className={styles.radar} ref={radarRef}>
        <svg viewBox="-100 -100 200 200">
          <g className={styles.rings}>
            <circle r="32" />
            <circle r="60" />
            <circle r="88" />
          </g>
          <g className={styles.cross}>
            <line x1="-100" y1="0" x2="100" y2="0" />
            <line x1="0" y1="-100" x2="0" y2="100" />
          </g>
        </svg>
        <div className={styles.sweep} />
        <div className={styles.arm} />
        <div className={styles.centerDot} />
      </div>
    </div>
  )
}
