import type { Classification } from '../core/types'
/** Single source of truth for names, colours and icons (colours sampled from the Chess.com Game Review legend). */
export const CLS_NAME: Record<Classification, string> = { brilliant: 'Brilliant', great: 'Great', best: 'Best', excellent: 'Excellent', good: 'Good', book: 'Book', inaccuracy: 'Inaccuracy', mistake: 'Mistake', miss: 'Miss', blunder: 'Blunder' }
export const CLS_COLOR: Record<Classification, string> = { brilliant: '#26c2a3', great: '#5c8bb0', best: '#96bc4b', excellent: '#96bc4b', good: '#96af8b', book: '#a88865', inaccuracy: '#f7c631', mistake: '#e58f2a', miss: '#ff7769', blunder: '#ca3431' }
export const SUMMARY_ORDER: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']
const TEXT: Partial<Record<Classification, string>> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??' }
const P = { // Material Design icon paths (Apache-2.0)
  thumb: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  star: 'M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.5l7.1-.6z',
  book: 'M21 5c-1.1-.35-2.3-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z' }
export function ClassIcon({ cls, size = 20, title }: { cls: Classification; size?: number | string; title?: string }) {
  const t = TEXT[cls], d = cls === 'excellent' ? P.thumb : cls === 'best' ? P.star : cls === 'book' ? P.book : null
  return <span className="ci" role="img" aria-label={title ?? CLS_NAME[cls]} title={title ?? CLS_NAME[cls]} style={{ background: CLS_COLOR[cls], width: size, height: size, fontSize: typeof size === 'number' ? size * 0.55 : undefined }}>
    {t ?? (d ? <svg viewBox="0 0 24 24" width="62%" height="62%" fill="#fff"><path d={d} /></svg>
      : <svg viewBox="0 0 24 24" width="66%" height="66%" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l5 5L19.5 7" /></svg>)}
  </span>
}
