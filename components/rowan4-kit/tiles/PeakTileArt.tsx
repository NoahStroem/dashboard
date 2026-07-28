import styles from './PeakTileArt.module.css'

/*
 * Peak tile background — "Expanding glow" pulse. A darker baseline dot grid
 * with a brighter copy revealed by a growing, decaying centre-weighted glow
 * (pulse lights nearby dots brightest, fades with distance + time), plus an
 * expanding ring and a breathing core.
 *
 * Self-contained, pure CSS. Rendered as a direct child of the Peak tile — its
 * opaque base covers the default .artDots so this becomes the Peak grid.
 */
export default function PeakTileArt() {
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.dots} />
      <div className={styles.bright} />
      <div className={styles.ring} />
      <div className={styles.core} />
    </div>
  )
}
