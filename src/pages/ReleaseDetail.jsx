import { useParams, Link } from 'react-router-dom'
import { getRelease, imgUrl } from '../data.js'

// One release. Everything shown here comes straight from the object in
// releases.json — cover, tracklist, buy links and a native audio preview.
export default function ReleaseDetail() {
  const { id } = useParams()
  const r = getRelease(id)

  if (!r) {
    return (
      <div className="page">
        <Link to="/" className="back">← catalogue</Link>
        <h1 style={{ fontFamily: 'var(--disp)', fontSize: 40 }}>Release not found</h1>
      </div>
    )
  }

  return (
    <div className="page">
      <Link to="/" className="back">← catalogue</Link>
      <div className="wd">
        <div className="lead">
          <div className="kick">{r.catalogue}{r.year ? ` · ${r.year}` : ''}</div>
          <h1>{r.title}</h1>
          {r.artist && <div className="role">{r.artist}</div>}
          {r.description && <p className="desc" style={{ whiteSpace: 'pre-line' }}>{r.description}</p>}

          <div className="specs">
            {r.artist && <div><b>Artist</b>{r.artist}</div>}
            {r.year && <div><b>Year</b>{r.year}</div>}
            {r.format && <div><b>Format</b>{r.format}</div>}
            {r.catalogue && <div><b>Catalogue</b>{r.catalogue}</div>}
          </div>

          {r.tracklist?.length > 0 && (
            <div className="wd-list">
              <h4>Tracklist</h4>
              {r.tracklist.map((t) => <div key={t} className="wd-li">{t}</div>)}
            </div>
          )}

          {r.links?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              {r.links.map((l, i) => (
                <a key={i} className="outlink" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
              ))}
            </div>
          )}
        </div>

        <div className="gallery">
          {r.cover ? (
            <img src={imgUrl(r.cover)} alt={`${r.title} — cover`} loading="lazy" />
          ) : (
            <div className="card"><div className="imgwrap"><div className="noimg">no cover yet</div></div></div>
          )}
          {/* A plain, click-to-play preview — never autoplays. */}
          {r.audio && (
            <audio
              className="rd-audio"
              src={`/audio/${r.audio}`}
              controls
              preload="none"
            />
          )}
        </div>
      </div>
    </div>
  )
}
