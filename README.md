# Nentoke Records — website template

A small, self-contained website **template** for an independent record label.
The home page is a scrolling **catalogue** (discography) sitting under a fixed
"read head": whichever release is under the head develops as a screenprint-style
halftone on a canvas, and — once you arm the **CUE** monitor — previews its audio.

> **This is a template.** The label name, the four example releases, the cover
> art and the audio are **placeholder content** (reused from the author's own
> catalogue) so the template runs out of the box. Replace them with the label's
> own — see [Add a release](#add-a-release) and [Rebrand the label](#rebrand-the-label).

---

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5182
```

- **`npm run dev`** – dev server on port **5182** (set in `vite.config.js`).
- **`npm run build`** – production build to `dist/`, then a static SEO prerender
  (`scripts/prerender.mjs`) writes per-route `<head>` meta + `sitemap.xml` + `robots.txt`.
- **`npm run preview`** – serve the production build locally.
- **`npm run lint`** – [oxlint](https://oxc.rs).

Stack: **Vite + React 19 + react-router-dom**, plain **canvas 2D** for the
read-head visuals and a **Web Audio** engine for CUE. No TypeScript, no CMS,
no build-time image step — the catalogue is just JSON.

---

## How it works

```
index.html            fonts + base <meta> (rebrand here)
src/
  main.jsx            router: /  ·  /releases/:id  ·  /about
  data.js            reads the JSON below → programme() list for the archive + CUE
  content/
    label.json       the label: name, tagline, about copy, socials, roster
    releases.json    THE DISCOGRAPHY — one object per release (edit this)
  pages/
    Programme.jsx    the Archive: read-head, canvas dither, CUE controls
    ReleaseDetail.jsx  one release (/releases/:id)
    About.jsx        the label page
  components/Layout.jsx   nav + footer + theme toggle
  audio/cueEngine.js      the CUE Web-Audio engine (leave as-is)
  styles.css         design tokens (colours + fonts) + shared page styles
  programme.css      the Archive page styles
public/
  img/               treated cover images  (e.g. nen001-…​.jpg)
  audio/             audio previews         (e.g. break-technology-to-trance.mp3)
scripts/
  street_treat.py    the street-art cover treatment (see below)
  prerender.mjs      post-build SEO prerender
```

**Data flow.** `data.js` reads `releases.json`, sorts newest-first, and exposes
`programme()` — a flat list of "entries". Both the Archive (`Programme.jsx`) and
the CUE engine (`cueEngine.js`) iterate that list. Each entry carries a real
audio preview if the release has one, otherwise CUE **synthesises a signature**
from the cover + metadata. You never touch `data.js` to add releases.

---

## Add a release

Everything about a release lives in **`src/content/releases.json`**. Add an
object to the `releases` array:

```jsonc
{
  "id": "night-bus",                      // url slug → /releases/night-bus (must be unique)
  "catalogue": "NEN005",                  // catalogue number
  "title": "Night Bus",
  "artist": "Some Artist",
  "year": 2026,
  "format": "Vinyl LP",                   // free text: "Digital", "Vinyl 12\"", "CD"…
  "cover": "nen005-night-bus.jpg",        // filename in public/img (see treatment below)
  "audio": "night-bus.mp3",               // filename in public/audio — omit for no preview
  "blurb": "One line shown on the row and used as SEO description.",
  "description": "Longer copy for the release page.\n\nUse \\n\\n for paragraphs.",
  "tracklist": ["A1 — Night Bus", "B1 — Night Bus (Dub)"],   // optional
  "links": [{ "label": "Bandcamp", "url": "https://…" }]     // optional buy/stream links
}
```

Then drop the two files in place:

1. **Cover** → `public/img/nen005-night-bus.jpg`
2. **Audio preview** → `public/audio/night-bus.mp3` (an MP3 excerpt is plenty)

That's it — the release appears in the archive, drives the CUE player, and gets
its own `/releases/night-bus` page. Only `id`, `title`, `catalogue` and `year`
are really required; everything else is optional.

- **No cover?** Leave `cover` out — the detail page shows a placeholder and the
  archive develops the title only.
- **No audio?** Leave `audio` out — CUE synthesises a tone signature instead of
  streaming a file (the read-head labels it `SYN` vs `REC`).

### Treat the cover (street-art look)

Covers are run through `scripts/street_treat.py` — a screenprint treatment
(posterised duotone + two-colour halftone screens + spray grain). It turns any
photo into a punchy 2-colour sleeve. Requires Python 3 with `pillow` + `numpy`:

```bash
python3 scripts/street_treat.py source.jpg public/img/nen005-night-bus.jpg \
    --paper "#F2ECD9" --accent "#FF3B2E" --ink "#0D0D0F" --dot 7
```

- `--paper` background, `--accent` midtone spot colour, `--ink` shadow spot colour
  (all hex), `--dot` halftone pitch in px. Swap `--paper` to `#0D0D0F` (black) with
  a bright `--ink` for the negative "hazard" look.
- Skip the script and use any square image if you prefer — nothing requires the treatment.

---

## Rebrand the label

- **Name, tagline, about copy, socials, roster** → `src/content/label.json`.
  Everything in the nav, footer, About page and SEO reads from here.
- **`index.html`** → `<title>` and the base `<meta>` description / og tags.
- **`scripts/prerender.mjs`** → set `SITE` to the real domain before deploying.
- **`public/favicon.svg`** → the little "N" stamp.

## Theming & type

All colours and fonts are **CSS custom properties** at the top of
`src/styles.css` — retheme by editing those:

- `--accent` (spray red) and `--accent2` (acid yellow) are the two spot colours;
  they cascade everywhere, including the runtime canvas ink.
- A `[data-theme='light']` block defines the "screenprint negative" (ink on bone);
  the dot in the bottom corner toggles it.
- Fonts are loaded from Google Fonts in `index.html`:
  **Anton** (poster display) · **Bungee** (wordmark) · **DM Mono** (metadata) ·
  **Archivo** (body). Change the `<link>` and the `--disp / --stencil / --mono / --body`
  variables together.

## Deploy

`vercel.json` is set up for SPA hosting (all routes rewrite to `index.html`).
Run `npm run build` and deploy `dist/`. Remember to set `SITE` in
`scripts/prerender.mjs` first.
