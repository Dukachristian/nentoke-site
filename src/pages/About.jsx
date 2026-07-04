import { LABEL } from '../data.js'

// The label's own page: its story, its roster, and how to reach it.
// All copy comes from content/label.json — edit it there.
export default function About() {
  const about = LABEL.about || []
  const socials = LABEL.socials || []
  const artists = LABEL.artists || []
  return (
    <div className="page">
      <div className="phead">
        <div><div className="kick">info</div><h1>About</h1></div>
        <div className="meta">{LABEL.tagline}</div>
      </div>
      <div className="about">
        <div className="bio">
          {about.map((p, i) => <p key={i}>{p}</p>)}
          {LABEL.email && (
            <p style={{ marginTop: 30 }}>
              <a className="outlink" href={`mailto:${LABEL.email}`}>{LABEL.email} ↗</a>
            </p>
          )}
        </div>
        <div>
          {artists.length > 0 && (
            <div className="side">
              <h4>Roster</h4>
              {artists.map((a) => (
                <div key={a} className="pr">{a}</div>
              ))}
            </div>
          )}
          <div className="side">
            <h4>Elsewhere</h4>
            {socials.map((s) => (
              <div key={s.label} className="pr"><a href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
