import styles from './BrandTileArt.module.css'

/*
 * Brand tile background — "Identity bloom" (B3). Radial spokes + a centre V
 * brand-mark drawing on, with a soft rounded-square pulse expanding outward.
 * Pure CSS. Rendered as a direct Brand-tile child after the default art div.
 */
export default function BrandTileArt() {
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.base} />
      <div className={styles.spokes}>
        <svg viewBox="-100 -100 200 200">
          <g>
            <line x1="0" y1="0" x2="0" y2="-100" />
            <line x1="0" y1="0" x2="71" y2="-71" />
            <line x1="0" y1="0" x2="100" y2="0" />
            <line x1="0" y1="0" x2="71" y2="71" />
            <line x1="0" y1="0" x2="0" y2="100" />
            <line x1="0" y1="0" x2="-71" y2="71" />
            <line x1="0" y1="0" x2="-100" y2="0" />
            <line x1="0" y1="0" x2="-71" y2="-71" />
          </g>
        </svg>
      </div>
      <div className={styles.pulse} />
      <div className={styles.vmark}>
        <svg viewBox="-50 -50 100 100">
          <path d="M-28 -20 L0 28 L28 -20" pathLength={100} />
        </svg>
      </div>
    </div>
  )
}
