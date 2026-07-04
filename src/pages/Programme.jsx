import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { programme, LABEL } from '../data.js'
import { cue, cueArm, cueDisarm, cuePlay, cueStop } from '../audio/cueEngine.js'
import '../programme.css'

/* =====================================================================
 * THE ARCHIVE — the whole catalogue as one list under a fixed read head.
 *
 * The head never moves; the catalogue scrolls under it. Whichever release
 * sits on the head is the "current" one: its title (in poster type) and its
 * cover develop on the canvas as ordered Bayer dither — the visible is a
 * reading of scroll position, never decoration.
 *
 * Audio: one CUE toggle arms a Web-Audio monitor. Where a release has a real
 * preview it streams that; where it doesn't, the engine synthesises a
 * signature from the cover/metadata. Silent until armed.
 *
 * This file owns the read-head experience. It's intentionally self-contained;
 * the CUE engine itself lives in ../audio/cueEngine.js.
 * ===================================================================== */

/* ---------------- dither rasters ---------------- */
// 4×4 ordered (Bayer) threshold matrix, normalised to 0..1.
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16))

// Render a release title into an offscreen canvas as white pixels, wrapped to
// fit ≤3 lines. Poster type (Anton), set in caps for the paste-up look. The
// pixels are later sampled by drawDither().
const titleCache = new Map()
function rasterTitle(text, fontsReady) {
  text = (text || '').toUpperCase()
  const k = text + (fontsReady ? '/f' : '/x')
  if (titleCache.has(k)) return titleCache.get(k)
  const W = 560, pad = 8
  const oc = document.createElement('canvas')
  const g = oc.getContext('2d', { willReadFrequently: true })
  // shrink the face until the title fits 3 lines AND no single line overflows
  let size = 96
  let lines = []
  let maxw = 0
  for (; size >= 34; size -= 6) {
    g.font = `${size}px "Anton", sans-serif`
    const words = text.split(' ')
    lines = []
    let line = ''
    for (const w of words) {
      const t = line ? line + ' ' + w : w
      if (g.measureText(t).width > W - pad * 2 && line) { lines.push(line); line = w }
      else line = t
    }
    if (line) lines.push(line)
    maxw = Math.max(...lines.map((l) => g.measureText(l).width))
    if (lines.length <= 3 && maxw <= W - pad * 2) break
  }
  const lh = size * 1.04
  oc.width = Math.max(W, Math.ceil(maxw) + pad * 2) // never clip, even for extreme words
  oc.height = Math.max(1, Math.round(lines.length * lh + pad * 2))
  g.font = `${size}px "Anton", sans-serif`
  g.fillStyle = '#fff'
  g.textBaseline = 'top'
  lines.forEach((l, i) => g.fillText(l, pad, pad + i * lh))
  const img = g.getImageData(0, 0, oc.width, oc.height)
  const rec = { img, ar: oc.width / oc.height }
  titleCache.set(k, rec)
  return rec
}
// Sample a loaded cover image into an offscreen ImageData for dithering.
function rasterImage(imgEl) {
  const s = 220
  const ar = imgEl.width / imgEl.height
  const w = ar > 1 ? s : Math.max(2, Math.round(s * ar))
  const h = ar > 1 ? Math.max(2, Math.round(s / ar)) : s
  const oc = document.createElement('canvas')
  oc.width = w; oc.height = h
  const g = oc.getContext('2d', { willReadFrequently: true })
  g.drawImage(imgEl, 0, 0, w, h)
  return { img: g.getImageData(0, 0, w, h), ar: w / h }
}
/* Draw an ImageData as ordered-dither cells; develop = 0..1 reveal amount.
 * dotty: halftone mode — dot area follows luminance, so midtones survive.
 * ink: the dot colour. invert: flip luminance so photos print positive. */
function drawDither(ctx, raster, x0, y0, tw, th, develop, cell, alpha, jitter, dotty = false, ink = '#F2ECD9', invert = false) {
  const { img } = raster
  const cols = Math.max(2, Math.floor(tw / cell))
  const rows = Math.max(2, Math.floor(th / cell))
  const d = img.data
  ctx.fillStyle = ink
  for (let cy = 0; cy < rows; cy++) {
    const v = cy / rows
    const sy = Math.min(img.height - 1, Math.floor(v * img.height))
    for (let cx = 0; cx < cols; cx++) {
      const u = cx / cols
      const sx = Math.min(img.width - 1, Math.floor(u * img.width))
      const i = (sy * img.width + sx) * 4
      const a4 = d[i + 3] / 255
      let raw = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
      if (invert) raw = 1 - raw
      const lum = Math.pow(raw * a4, 0.9)
      if (lum * develop > BAYER[cy & 3][cx & 3] * (dotty ? 0.72 : 1)) {
        const jx = jitter ? (BAYER[cx & 3][cy & 3] - 0.5) * jitter : 0
        if (dotty) {
          const r = Math.max(0.8, (cell - 0.5) * (0.4 + 0.72 * lum))
          ctx.globalAlpha = alpha * Math.min(1, 0.3 + 0.9 * lum)
          ctx.fillRect(x0 + cx * cell + (cell - r) / 2 + jx, y0 + cy * cell + (cell - r) / 2, r, r)
        } else {
          ctx.globalAlpha = alpha * Math.min(1, 0.35 + lum)
          ctx.fillRect(x0 + cx * cell + jx, y0 + cy * cell, cell - 1, cell - 1)
        }
      }
    }
  }
  ctx.globalAlpha = 1
}

export default function Programme() {
  // The catalogue as a flat list, newest first. This is both the render order
  // and the focus/cue/keyboard order — there's only one list now.
  const list = useMemo(() => programme(), [])
  const years = useMemo(() => {
    const ys = list.map((e) => e.sortYear).filter(Boolean)
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : [null, null]
  }, [list])

  const [armed, setArmed] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const navigate = useNavigate()
  const rowRefs = useRef([])
  rowRefs.current.length = list.length
  const cvRef = useRef(null)
  const listRef = useRef(null)
  const markerRef = useRef(null)
  const phRef = useRef(null)
  const noteRef = useRef(null)
  const st = useRef({
    current: -1, vel: 0, lastY: 0, lastInput: -1e9,
    imgKey: undefined, t: 0, mode: 'idle', raster: null, imgRaster: null,
    images: new Map(), reduced: false, fontsReady: false,
  }).current

  /* ---- cue: arm/disarm the monitor and play whatever's under the head ---- */
  const toggleCue = () => {
    if (armed) { cueDisarm(); setArmed(false) }
    else {
      cueArm(); setArmed(true)
      const e = list[Math.max(0, st.current)]
      if (e) cuePlay(e, st.imgRaster?.img || null)
    }
  }

  /* ---- land mid-read: first row under the head at frame 1 ---- */
  useLayoutEffect(() => {
    const ol = listRef.current
    if (!ol) return
    const headY = window.innerHeight * 0.38
    const place = () => {
      const first = rowRefs.current[0]
      if (!first) return
      ol.style.paddingTop = '0px'
      const r = first.getBoundingClientRect()
      // pad so row 0's centre sits exactly on the head when scrollY = 0
      const need = headY - (first.offsetTop + ol.offsetTop) - r.height / 2
      ol.style.paddingTop = `${Math.max(0, need)}px`
      // tail: the end-note + footer already fill space below the last row —
      // only pad the difference, so the archive ends into the footer, not a void
      ol.style.paddingBottom = '0px'
      const below = document.documentElement.scrollHeight - (ol.offsetTop + ol.offsetHeight)
      const minPad = window.innerWidth <= 880 ? 90 : 0
      ol.style.paddingBottom = `${Math.max(minPad, window.innerHeight - headY - r.height / 2 - below)}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  /* ---- main loop: focus tracking + the develop/dither canvas ---- */
  useEffect(() => {
    st.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.fonts?.ready.then(() => { st.fontsReady = true; titleCache.clear() })
    const cv = cvRef.current
    const ctx = cv.getContext('2d')
    let raf
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(cv.clientWidth * dpr)
      cv.height = Math.round(cv.clientHeight * dpr)
      st.mobile = window.innerWidth <= 880
    }
    resize()
    window.addEventListener('resize', resize)

    const markInput = () => { st.lastInput = performance.now() }
    window.addEventListener('wheel', markInput, { passive: true })
    window.addEventListener('touchstart', markInput, { passive: true })
    window.addEventListener('pointerdown', markInput)
    window.addEventListener('keydown', markInput)

    const loadImage = (src) => {
      if (st.images.has(src)) return st.images.get(src)
      const img = new Image()
      const rec = { img, ready: false, raster: null }
      img.onload = () => { rec.ready = true }
      img.src = src
      st.images.set(src, rec)
      return rec
    }

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const H = window.innerHeight
      const headY = H * 0.38
      const rows = rowRefs.current

      /* velocity — feeds dither coarseness; audible as wow when armed */
      const y = window.scrollY
      const v = y - st.lastY
      st.lastY = y
      st.vel += (v - st.vel) * 0.12
      if (cue.slot && cue.armed) {
        cue.slot.srcNode.playbackRate.value = 1 + Math.max(-0.05, Math.min(0.05, st.vel * 0.0011))
      }

      /* focus pass — reads first, then writes; no scale, weight + ink only */
      let best = -1
      let bestD = Infinity
      const rects = []
      for (let i = 0; i < rows.length; i++) {
        const el = rows[i]
        if (!el) { rects.push(null); continue }
        const r = el.getBoundingClientRect()
        rects.push(r)
        const d = Math.abs(r.top + r.height / 2 - headY)
        if (d < bestD) { bestD = d; best = i }
      }
      for (let i = 0; i < rows.length; i++) {
        const el = rows[i]
        const r = rects[i]
        if (!el || !r) continue
        if (r.bottom < -160 || r.top > H + 160) continue
        const dn = (r.top + r.height / 2 - headY) / 260
        const f = Math.exp(-dn * dn)
        const t = el.querySelector('.pr-t')
        const sub = el.querySelector('.pr-sub')
        if (t) t.style.opacity = String(0.4 + 0.6 * f)
        if (sub) sub.style.opacity = String(Math.max(0, f - 0.3) * 1.45)
        el.classList.toggle('is-current', i === best)
      }

      /* position strip marker */
      const max = document.documentElement.scrollHeight - H
      if (markerRef.current && max > 0) {
        markerRef.current.style.top = `${(y / max) * 96 + 2}%`
      }

      /* the record ends: fade the head apparatus as the archive runs off it */
      let lastRect = null
      for (let i = rects.length - 1; i >= 0; i--) { if (rects[i]) { lastRect = rects[i]; break } }
      const overshoot = lastRect ? headY - (lastRect.top + lastRect.height / 2) : 0
      const fade = overshoot <= 0 ? 1 : Math.max(0, 1 - overshoot / 280)
      cv.style.opacity = String(fade)
      if (phRef.current) phRef.current.style.opacity = String(fade)
      if (noteRef.current) noteRef.current.style.opacity = String(fade)

      /* current changed → restart the develop animation, prefetch neighbours */
      if (best !== st.current && best >= 0) {
        st.current = best
        setCurrentIdx(best)
        st.mode = 'out'
        for (const j of [best + 1, best + 2, best - 1]) {
          const n = list[j]
          if (n?.image) loadImage(n.image)
        }
      }

      /* auto-creep — runs from second 0, pauses on input.
         accumulate fractional pixels: sub-pixel scrollBy rounds to zero. */
      if (!st.reduced && now - st.lastInput > 3500 && document.visibilityState === 'visible') {
        if (y < max - 4) {
          st.creepAcc = (st.creepAcc || 0) + 0.11
          if (st.creepAcc >= 1) {
            const step = Math.floor(st.creepAcc)
            st.creepAcc -= step
            window.scrollBy(0, step)
          }
        }
      }

      /* develop state machine: out → (swap raster) → in → idle */
      if (st.mode === 'out') {
        st.t -= 0.11
        if (st.t <= 0) {
          st.t = 0
          const e = list[st.current]
          if (e) {
            st.raster = rasterTitle(e.title, st.fontsReady)
            st.imgRaster = null
            st.imgKey = e.image
            if (e.image) {
              const rec = loadImage(e.image)
              if (rec.ready) {
                if (!rec.raster) rec.raster = rasterImage(rec.img)
                st.imgRaster = rec.raster
              }
            }
            if (cue.armed) cuePlay(e, st.imgRaster?.img || null)
            st.mode = 'in'
          } else st.mode = 'idle'
        }
      } else if (st.mode === 'in') {
        // image raster may arrive a few frames late
        if (!st.imgRaster && st.imgKey) {
          const rec = st.images.get(st.imgKey)
          if (rec?.ready) {
            if (!rec.raster) rec.raster = rasterImage(rec.img)
            st.imgRaster = rec.raster
          }
        }
        st.t += st.reduced ? 1 : 0.03
        if (st.t >= 1) { st.t = 1; st.mode = 'idle' }
      } else if (st.current < 0 && rows.length) {
        st.mode = 'out' // first frame
      }

      /* ---- canvas: dithered title + cover fragment beside the list ---- */
      const W = cv.width, Hc = cv.height
      ctx.clearRect(0, 0, W, Hc)
      const coarse = Math.min(2.4, Math.abs(st.vel) * 0.05)
      const light = document.documentElement.dataset.theme === 'light'
      const inkCol = light ? '#141210' : '#F2ECD9'
      if (st.mobile) {
        /* mobile: the canvas is a small dock square — artwork only */
        if (st.raster && st.t > 0.02 && st.imgRaster) {
          const dev = 1 - Math.pow(1 - st.t, 3)
          const pad2 = 3 * dpr
          let iw = W - pad2 * 2
          let ih = iw / st.imgRaster.ar
          if (ih > Hc - pad2 * 2) { ih = Hc - pad2 * 2; iw = ih * st.imgRaster.ar }
          const cellM = (2.3 + coarse * 1.4) * dpr
          drawDither(ctx, st.imgRaster, (W - iw) / 2, (Hc - ih) / 2, iw, ih, dev, cellM, 0.9, coarse * 2, true, inkCol, light)
        }
      } else if (st.raster && st.t > 0.02) {
        const dev = 1 - Math.pow(1 - st.t, 3)
        const pad = W * 0.05
        // title fits between the nav and the head line — never clipped
        const navClear = 76 * dpr
        const bottomLimit = headY * dpr - 16 * dpr
        const availH = Math.max(40 * dpr, bottomLimit - navClear)
        let tw = W - pad * 2
        let th = tw / st.raster.ar
        if (th > availH) { th = availH; tw = th * st.raster.ar }
        const cell = (4 + coarse * 2.4) * dpr
        drawDither(ctx, st.raster, pad, bottomLimit - th, tw, th, dev, cell, 0.92, coarse * 3, false, inkCol, false)
        if (st.imgRaster) {
          let iw = Math.min((W - pad * 2) * 0.82, W * 0.8)
          let ih = iw / st.imgRaster.ar
          let availB = Hc - headY * dpr - 60 * dpr
          // the artwork yields to the footer as it rises into view
          if (!st.footerEl) st.footerEl = document.querySelector('.footer')
          const foot = st.footerEl?.getBoundingClientRect()
          if (foot && foot.top < H) {
            availB = Math.min(availB, (foot.top - 36) * dpr - (headY + 26) * dpr)
          }
          if (ih > availB) { ih = Math.max(0, availB); iw = ih * st.imgRaster.ar }
          if (ih > 36 * dpr) {
            // finer halftone cells; offscreen-cached so the density stays cheap
            const cell2 = (2.8 + coarse * 2) * dpr
            const ckey = `${st.imgKey}@${Math.round(dev * 40)}@${Math.round(coarse * 5)}@${Math.round(iw)}@${light ? 'L' : 'D'}`
            if (st.imgCanvasKey !== ckey) {
              if (!st.imgCanvas) st.imgCanvas = document.createElement('canvas')
              st.imgCanvas.width = Math.max(2, Math.ceil(iw))
              st.imgCanvas.height = Math.max(2, Math.ceil(ih))
              const g2 = st.imgCanvas.getContext('2d')
              drawDither(g2, st.imgRaster, 0, 0, iw, ih, dev * 0.92, cell2, 0.7, coarse * 4, true, inkCol, light)
              st.imgCanvasKey = ckey
            }
            ctx.drawImage(st.imgCanvas, pad, headY * dpr + 26 * dpr)
          }
        }
      }
    }
    raf = requestAnimationFrame(tick)

    /* keyboard transport: ↑/↓ or j/k step the head; Enter opens the release */
    const onKey = (ev) => {
      if (ev.target.closest?.('input,textarea')) return
      const down = ev.key === 'ArrowDown' || ev.key === 'j'
      const up = ev.key === 'ArrowUp' || ev.key === 'k'
      if (down || up) {
        ev.preventDefault()
        const next = Math.max(0, Math.min(list.length - 1, st.current + (down ? 1 : -1)))
        const el = rowRefs.current[next]
        if (el) {
          const r = el.getBoundingClientRect()
          window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight * 0.38, behavior: 'smooth' })
        }
      } else if (ev.key === 'Enter') {
        const e = list[st.current]
        if (e?.href) navigate(e.href)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('wheel', markInput)
      window.removeEventListener('touchstart', markInput)
      window.removeEventListener('pointerdown', markInput)
      window.removeEventListener('keydown', markInput)
      window.removeEventListener('keydown', onKey)
      st.current = -1
      cueStop(0.15)
    }
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  // disarm the monitor when leaving the archive
  useEffect(() => () => { cueDisarm() }, [])

  // the fixed dock needs scroll clearance under the footer — archive page only
  useEffect(() => {
    document.body.classList.add('has-dock')
    return () => document.body.classList.remove('has-dock')
  }, [])

  const cur = list[Math.min(currentIdx, list.length - 1)]
  const src = armed ? (cur?.audio ? 'REC' : 'SYN') : ''

  return (
    <div className="prog">
      <canvas ref={cvRef} className="progcv" aria-hidden="true" />

      <header className="proghead">
        <div className="prog-kick">{LABEL.name}</div>
        <h1 className="prog-h1">The Catalogue</h1>
        <p className="prog-intro">
          {list.length} releases{years[0] ? ` · ${years[0]}–${years[1]}` : ''}. Arm CUE, then scroll —
          each release develops and previews under the head.
        </p>
      </header>

      <p className="cuenote" ref={noteRef}>
        ○ CUE monitors the catalogue — previews at <span className="accent">●</span>,
        synthesised signatures elsewhere.
      </p>

      {/* read head */}
      <div className="playhead" aria-hidden="true" ref={phRef}>
        <span className="ph-tc" key={currentIdx}>
          <span className="ph-l1">
            <b>{String(Math.min(currentIdx + 1, list.length)).padStart(3, '0')}</b>/{String(list.length).padStart(3, '0')}
          </span>
          <span className="ph-l2">
            {cur?.catalogue || '——'}<i>·</i>{cur?.year || '——'}
            {src && <><i>·</i><em className="ph-src">{src}</em></>}
          </span>
        </span>
      </div>
      <button
        className={`cuebtn${armed ? ' on' : ''}`}
        aria-pressed={armed}
        title={armed ? 'Monitor on — click to mute' : 'Arm the cue monitor'}
        onClick={toggleCue}
      >
        <svg className="cueicn" width="14" height="11" viewBox="0 0 14 11" aria-hidden="true">
          <path d="M1 3.6h2.2L6.6.8v9.4L3.2 7.4H1z" fill="currentColor" />
          <path className="cw cw1" d="M8.8 3.2c1.1 1.1 1.1 3.5 0 4.6" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          <path className="cw cw2" d="M10.9 1.6c1.9 2 1.9 5.8 0 7.8" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </svg>
        CUE
      </button>

      {/* mobile dock — the monitor as a now-playing bar */}
      <div className="progdock" aria-hidden="true">
        <span className="dk-t">{cur?.title}{cur?.audio && <span className="pr-dot"> ●</span>}</span>
        <span className="dk-l">
          <b>{String(Math.min(currentIdx + 1, list.length)).padStart(3, '0')}</b>/{String(list.length).padStart(3, '0')}
          <i>·</i>{cur?.catalogue || '——'}
          <i>·</i>{cur?.year || '——'}
          {src && <><i>·</i><em className="ph-src">{src}</em></>}
        </span>
      </div>

      {/* archive position strip */}
      <div className="progstrip" aria-hidden="true">
        {list.map((e, i) => (
          <span key={e.id} style={{ top: `${(i / Math.max(1, list.length - 1)) * 96 + 2}%` }} />
        ))}
        <b ref={markerRef} />
      </div>

      <ol className="proglist" ref={listRef}>
        {list.map((e, i) => (
          <li key={e.id} ref={(el) => { rowRefs.current[i] = el }} className="prow" data-kind={e.kind}>
            <Link to={e.href} className="prowlink">
              <span className="pr-n">{String(i + 1).padStart(3, '0')}</span>
              <span className="pr-main">
                <span className="pr-t">
                  {e.title}
                  {e.audio && <span className="pr-dot"> ●</span>}
                </span>
                <span className="pr-subrow">
                  <span className="pr-sub">{e.artist}{e.format ? <em>&nbsp;&nbsp;—&nbsp;&nbsp;{e.format}</em> : null}</span>
                </span>
              </span>
              <span className="pr-y">{e.year || '—'}</span>
              <span className="pr-cat">{e.catalogue}</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="progend">
        <p>
          {years[0] ? `${years[0]}–${years[1]}. ` : ''}The catalogue continues.&nbsp;
          <a href="#top" onClick={(ev) => { ev.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            Return to the head ↑
          </a>
        </p>
      </div>
    </div>
  )
}
