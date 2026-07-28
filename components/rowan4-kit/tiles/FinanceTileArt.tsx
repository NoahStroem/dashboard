import styles from './FinanceTileArt.module.css'

/*
 * Finance tile background — "Candlesticks". A market candle chart over a faint
 * price axis + warm amber base; candles draw in left→right, the last one
 * blinks live. Pure CSS + a static candle list (no runtime JS needed beyond
 * rendering the elements). Rendered as a direct Finance-tile child.
 *
 * Each candle: bodyH = body height as a fraction of the column (× 0.6),
 * wickTop = wick height as a fraction, dir = up (mint) / down (soft red).
 */

type Candle = { bodyH: number; wickTop: number; dir: 'up' | 'down' }

const CANDLES: Candle[] = [
  { bodyH: 0.5,  wickTop: 0.7,  dir: 'up' },
  { bodyH: 0.55, wickTop: 0.4,  dir: 'down' },
  { bodyH: 0.4,  wickTop: 0.66, dir: 'up' },
  { bodyH: 0.62, wickTop: 0.5,  dir: 'down' },
  { bodyH: 0.5,  wickTop: 0.78, dir: 'up' },
  { bodyH: 0.7,  wickTop: 0.6,  dir: 'down' },
  { bodyH: 0.58, wickTop: 0.86, dir: 'up' },
  { bodyH: 0.78, wickTop: 0.7,  dir: 'up' },
  { bodyH: 0.66, wickTop: 0.95, dir: 'up' },
]

export default function FinanceTileArt() {
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.base} />
      <div className={styles.axis} />
      <div className={styles.candles}>
        {CANDLES.map((c, i) => {
          const isLast = i === CANDLES.length - 1
          const cls = [styles.c, c.dir === 'up' ? styles.up : styles.down, isLast ? styles.last : '']
            .filter(Boolean)
            .join(' ')
          return (
            <div key={i} className={cls} style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
              <span className={styles.wick} style={{ height: `${c.wickTop * 100}%` }} />
              <span className={styles.body} style={{ height: `${c.bodyH * 60}%` }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
