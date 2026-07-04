/* Post-build SEO prerender.
 * The site is a client-rendered SPA, so social scrapers (Twitter/FB/LinkedIn/
 * iMessage) and JS-less crawlers only see the static <head>. This writes a
 * per-route index.html whose head carries that route's own title/description/
 * og:image + JSON-LD, plus sitemap.xml and robots.txt. Reuses the app's real
 * programme() via jiti so meta never drifts from the site.
 *
 * ⚠️  Set SITE to the label's real domain before deploying. */
import { createJiti } from 'jiti'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://nentoke.example' // ← change to the real domain
const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')

const jiti = createJiti(import.meta.url)
const data = await jiti.import('../src/data.js')
const { programme, releases, LABEL } = data

const DEFAULT_IMG = releases[0]?.cover ? `/img/${releases[0].cover}` : '/favicon.svg'

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clean = (s = '') => String(s).replace(/\s+/g, ' ').trim()
const clip = (s, n = 200) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const abs = (p) => (p ? (p.startsWith('http') ? p : SITE + p) : SITE + DEFAULT_IMG)

const template = readFileSync(join(dist, 'index.html'), 'utf8')

/* swap the head meta of the built shell for this route's */
function render({ path, title, description, image, type = 'website', jsonld }) {
  const url = SITE + (path === '/' ? '' : path)
  const desc = clip(clean(description) || LABEL.blurb || '', 200)
  const img = abs(image)
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}" />`)
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:site_name" content="${esc(LABEL.name)}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : '',
  ].filter(Boolean).join('\n    ')
  html = html.replace('</head>', `    ${tags}\n  </head>`)
  const out = path === '/' ? join(dist, 'index.html') : join(dist, path, 'index.html')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  return url
}

// the label itself
const org = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: LABEL.name, url: SITE, description: clip(clean(LABEL.blurb), 300),
  sameAs: (LABEL.socials || []).map((s) => s.url),
}
const year4 = (y) => (/^\d{4}/.test(String(y || '')) ? String(y).slice(0, 4) : undefined)

const routes = [
  { path: '/', title: `${LABEL.name} — ${LABEL.tagline}`, description: LABEL.blurb, jsonld: org },
  { path: '/about', title: `About — ${LABEL.name}`, description: LABEL.blurb, type: 'profile' },
]

// one page per release, with MusicAlbum structured data
for (const e of programme()) {
  const description = e.blurb || clean([e.artist, e.catalogue].filter(Boolean).join(' · ')) || LABEL.blurb
  const dc = year4(e.year)
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'MusicAlbum',
    name: e.title, url: SITE + e.href, description: clip(clean(description), 300), image: abs(e.image),
    byArtist: { '@type': 'MusicGroup', name: e.artist },
    ...(dc ? { datePublished: dc } : {}),
    catalogNumber: e.catalogue, recordLabel: { '@type': 'Organization', name: LABEL.name },
  }
  routes.push({ path: e.href, title: `${e.title} — ${e.artist} — ${LABEL.name}`, description, image: e.image, type: 'music.album', jsonld })
}

const urls = routes.map(render)

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n')}\n</urlset>\n`
writeFileSync(join(dist, 'sitemap.xml'), sitemap)

writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)

console.log(`prerendered ${routes.length} routes → dist/  (+ sitemap.xml, robots.txt)`)
