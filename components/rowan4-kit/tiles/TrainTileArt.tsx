import styles from './TrainTileArt.module.css'

/*
 * Train tile background — "Ascent" graph. One SVG holds the contour lines, the
 * solid glowing trend line, and the data dots — the dots are <circle>s at the
 * exact same coordinates as the trend line's vertices, so they are welded to
 * the line and can never drift or render half-off. The band's aspect-ratio
 * matches the viewBox, so the SVG scales uniformly (round dots) at any size.
 *
 * Plays its intro once (contours + dots fade in L→R, then the line draws
 * through them), settles, then only the line glow + aurora breathe.
 */

// trend line vertices — the dots reuse these EXACT coords
const PTS: Array<[number, number]> = [
  [10, 118], [56, 110], [102, 114], [148, 96], [196, 100],
  [244, 78], [292, 82], [340, 60], [390, 46],
]
const LINE_D = 'M' + PTS.map(([x, y]) => `${x},${y}`).join(' L')
// fade-in stagger (L→R). Dots wait until the contour lines have fully drawn
// in (start at 3.0s), then come in just before the stock line draws through —
// the approved "after lines finish" timing.
const DELAYS = [3.0, 3.16, 3.32, 3.48, 3.64, 3.8, 3.96, 4.12, 4.28]

export default function TrainTileArt() {
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.base} />
      <div className={styles.graph}>
        <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
          {/* contour top + bottom */}
          <path className={styles.contour} d="M-10,40 C100,35 180,32 230,27 S360,18 410,15" pathLength={100} />
          <path className={`${styles.contour} ${styles.contourB}`} d="M-10,140 C100,137 180,134 230,129 S360,121 410,118" pathLength={100} />
          {/* main trend line: one solid glowing mint stroke */}
          <path className={styles.trend} d={LINE_D} pathLength={100} />
          {/* dots: EXACT same coords as the trend vertices */}
          {PTS.map(([x, y], i) => {
            const peak = i === PTS.length - 1
            return (
              <circle
                key={i}
                className={peak ? `${styles.dot} ${styles.dotPeak}` : styles.dot}
                cx={x}
                cy={y}
                r={peak ? 4 : 3}
                style={{ animationDelay: `${DELAYS[i]}s` }}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}
