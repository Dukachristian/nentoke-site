// ─────────────────────────────────────────────────────────────────────────
// DATA — the single source of truth for the whole site.
//
// The label's catalogue is plain JSON:
//   • content/label.json    — the label itself (name, about, socials, artists)
//   • content/releases.json — the discography (one object per release)
//
// This file merges nothing complicated: it just reads those two files and
// reshapes the releases into the flat list that the Archive (Programme.jsx)
// and the CUE audio engine consume. To add a release you only edit
// releases.json — see README.md. Nothing here should need to change.
// ─────────────────────────────────────────────────────────────────────────

import label from './content/label.json'
import releasesData from './content/releases.json'

/** Label metadata — used by the nav, footer, About page and SEO prerender. */
export const LABEL = label

/** The raw discography, newest first. */
export const releases = [...releasesData.releases].sort(
  (a, b) => (yearNum(b.year) - yearNum(a.year)) || a.title.localeCompare(b.title),
)

/** Look up one release by its id (used by the /releases/:id detail page). */
export const getRelease = (id) => releases.find((r) => r.id === id)

/** Build a public URL for a treated cover image in /public/img. */
export const imgUrl = (f) => (f ? `/img/${f}` : null)

/** First 4-digit year found, as a number (for sorting). */
function yearNum(y) {
  const m = String(y ?? '').match(/\d{4}/)
  return m ? +m[0] : 0
}

// ─────────────────────────────────────────────────────────────────────────
// programme() — the discography as one flat list of "entries".
//
// The Archive read-head and the CUE engine both iterate this list, so every
// entry carries exactly the fields they need:
//   kind      always 'release' (kept so the CUE synth picks its warm timbre)
//   id/title  identity + the text that develops as dither under the read-head
//   artist    shown as the row's sub-line
//   catalogue the NEN catalogue number
//   year      display year
//   sortYear  numeric year, for the read-head ordering
//   image     treated cover, rendered as halftone beside the list
//   audio     { src } → the real preview the player streams; null ⇒ the CUE
//             engine synthesises a signature from the cover/metadata instead
//   href      internal link to the release's detail page
// ─────────────────────────────────────────────────────────────────────────
export function programme() {
  return releases.map((r) => ({
    kind: 'release',
    id: r.id,
    title: r.title,
    artist: r.artist,
    catalogue: r.catalogue,
    format: r.format || '',
    year: r.year || null,
    sortYear: yearNum(r.year),
    image: r.cover ? imgUrl(r.cover) : null,
    audio: r.audio ? { src: `/audio/${r.audio}` } : null,
    href: `/releases/${r.id}`,
    blurb: r.blurb || '',
  }))
}
