'use client'

import { useEffect, useRef } from 'react'

/**
 * Atmospheric backdrop — aurora wash + distant mountains + drifting mint
 * particles. Three fixed layers at z-index 0/1/2; put your content on top
 * with z-index 5+ (the .vk-shell class already does this).
 *
 * Styles live in rowan4-kit.css (.vk-atmosphere / .vk-mountains / .vk-particles).
 * Drop this once near the top of your dashboard page.
 */
export default function Rowan4Backdrop() {
  const particlesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = window.innerWidth < 640 ? 14 : 24
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = Math.random() * 100 + '%'
      s.style.top = 60 + Math.random() * 40 + '%'
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = size + 'px'
      const dur = 22 + Math.random() * 28
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', Math.random() * 30 - 15 + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => created.forEach((s) => s.remove())
  }, [])

  return (
    <>
      <div className="vk-atmosphere" aria-hidden />
      <div className="vk-mountains" aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="vk-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="vk-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#vk-mt-far)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#vk-mt-near)" />
        </svg>
      </div>
      <div className="vk-particles" ref={particlesRef} aria-hidden />
    </>
  )
}
