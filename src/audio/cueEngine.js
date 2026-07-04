/* ---------------- cue engine ----------------
 * One AudioContext for the whole site. The home programme drives it with
 * image rasters for the synth signatures; index pages drive it bare
 * (hash-derived partials). Armed state persists across navigation. */
export const cue = {
  ac: null, master: null, buffers: new Map(), loading: new Map(),
  slot: null, key: null, armed: false,
}

/* tiny pub/sub so index-page controls can reflect what's playing */
const listeners = new Set()
export function subscribeCue(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function notify() { for (const fn of listeners) fn() }
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function cueArm() {
  if (!cue.ac) {
    cue.ac = new (window.AudioContext || window.webkitAudioContext)()
    cue.master = cue.ac.createGain()
    cue.master.gain.value = 0.55
    cue.master.connect(cue.ac.destination)
  }
  if (cue.ac.state === 'suspended') cue.ac.resume()
  cue.armed = true
  notify()
}
export function cueDisarm() { cue.armed = false; cueStop(0.25) }
export function cueLoadFile(src) {
  if (cue.buffers.has(src)) return Promise.resolve(cue.buffers.get(src))
  if (cue.loading.has(src)) return cue.loading.get(src)
  const p = fetch(src)
    .then((r) => r.arrayBuffer())
    .then((ab) => cue.ac.decodeAudioData(ab))
    .then((buf) => { cue.buffers.set(src, buf); return buf })
  cue.loading.set(src, p)
  return p
}
export function cueStop(t = 0.35) {
  if (cue.slot) {
    const { gain, srcNode } = cue.slot
    const now = cue.ac.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + t)
    try { srcNode.stop(now + t + 0.05) } catch { /* stopped */ }
  }
  cue.slot = null
  cue.key = null
  notify()
}

/* synthesised signature: the entry's image (or metadata) rendered as sound.
 * luminance bands -> partial amplitudes; year -> register; kind -> spectrum. */
const synthCache = new Map()
export function buildSynthBuffer(entry, imgData) {
  if (synthCache.has(entry.id)) return synthCache.get(entry.id)
  const sr = cue.ac.sampleRate
  const secs = 24
  const N = sr * secs
  const buf = cue.ac.createBuffer(2, N, sr)
  const h = hash(entry.id + entry.title)
  const root = 62 * Math.pow(2, (entry.sortYear - 2014) / 14)
  const ratios = entry.kind === 'work'
    ? [1, 2.02, 3.11, 4.42, 5.87, 7.31]           // bell-ish, inharmonic
    : entry.kind === 'release'
      ? [1, 2, 2.99, 4.01, 5]                     // warm harmonic
      : [1, 1.5, 2.01]                            // talk: plain
  // partial amplitudes: image luminance bands if we have pixels, else id hash
  const amps = []
  if (imgData) {
    const { data, width, height } = imgData
    const bands = ratios.length
    for (let b = 0; b < bands; b++) {
      let s = 0, n = 0
      const y0 = Math.floor((b / bands) * height)
      const y1 = Math.floor(((b + 1) / bands) * height)
      for (let y = y0; y < y1; y += 2) {
        for (let x = 0; x < width; x += 3) {
          const i = (y * width + x) * 4
          s += data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11
          n++
        }
      }
      amps.push(Math.pow(s / (n * 255 || 1), 1.2))
    }
  } else {
    for (let b = 0; b < ratios.length; b++) amps.push(0.25 + (((h >> (b * 4)) & 15) / 15) * 0.75)
  }
  const norm = amps.reduce((a, b) => a + b, 0) || 1
  const detune = 1 + ((((h >> 20) & 255) / 255) - 0.5) * 0.003
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch)
    const d = ch ? detune : 1 / detune
    for (let p = 0; p < ratios.length; p++) {
      const f = root * ratios[p] * d
      if (f > sr * 0.45) continue
      const a = (amps[p] / norm) * 0.8
      // whole cycles over the buffer: the loop point is phase-continuous,
      // so no edge fade is needed and the drone reads as endless
      const w = (2 * Math.PI * Math.max(1, Math.round(f * secs))) / N
      const amRate = (2 * Math.PI * (2 + ((h >> (p * 3)) & 3))) / N
      const amPh = ((h >> (p * 5)) & 63) / 10
      for (let i = 0; i < N; i++) {
        out[i] += Math.sin(i * w) * a * (0.62 + 0.38 * Math.sin(i * amRate + amPh))
      }
    }
  }
  // long buffers are heavy (~9 MB each); keep only the most recent few
  if (synthCache.size > 6) synthCache.delete(synthCache.keys().next().value)
  synthCache.set(entry.id, buf)
  return buf
}
export function cuePlay(entry, imgData) {
  const key = entry ? entry.kind + entry.id : null
  if (key === cue.key) return
  cueStop()
  cue.key = key
  notify()
  if (!key || !cue.armed) return
  if (entry.cueSilent) return // tacet: this entry stays silent by choice
  const myKey = key
  const startVoice = (buf, level, start = 0, dur = null, isRecording = false) => {
    if (!cue.armed || cue.key !== myKey) return
    const srcNode = cue.ac.createBufferSource()
    srcNode.buffer = buf
    srcNode.loop = true
    const s = Math.min(start, Math.max(0, buf.duration - 2))
    srcNode.loopStart = s
    srcNode.loopEnd = dur ? Math.min(s + dur, buf.duration) : buf.duration
    const pan = cue.ac.createStereoPanner()
    // real recordings play centred, as mastered; only synthesised
    // signatures sit at their own point in the stereo field
    pan.pan.value = isRecording ? 0 : ((hash(entry.id) % 200) / 100 - 1) * 0.55
    const gain = cue.ac.createGain()
    gain.gain.value = 0
    srcNode.connect(pan).connect(gain).connect(cue.master)
    srcNode.start(0, s)
    const now = cue.ac.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(level, now + 0.35)
    cue.slot = { gain, srcNode }
  }
  if (entry.audio) {
    cueLoadFile(entry.audio.src).then((buf) => startVoice(buf, 1, entry.audio.start || 0, entry.audio.dur || null, true))
  } else {
    startVoice(buildSynthBuffer(entry, imgData), 0.32)
  }
}
