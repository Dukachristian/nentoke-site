import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { LABEL } from '../data.js'

/* The theme dot in the bottom corner flips the whole site between
 * bone-on-black and its black-on-bone "screenprint negative". */
function ThemeDot() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'dark')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
    setTheme(next)
  }
  return (
    <button
      className="themedot"
      aria-label={theme === 'dark' ? 'Switch to black on bone' : 'Switch to bone on black'}
      title={theme === 'dark' ? 'screenprint negative' : 'screenprint positive'}
      onClick={toggle}
    />
  )
}

export default function Layout() {
  const loc = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <>
      <nav className="nav">
        <Link to="/" className="brand">{LABEL.name}</Link>
        <div className="navlinks">
          <NavLink to="/">Catalogue</NavLink>
          <NavLink to="/about">About</NavLink>
        </div>
      </nav>

      <main>
        <Outlet />
      </main>

      <Footer />

      <ThemeDot />

      {/* subtle print grain over everything */}
      <svg className="grain" aria-hidden="true">
        <filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" /></filter>
        <rect width="100%" height="100%" filter="url(#gr)" />
      </svg>
    </>
  )
}

function Footer() {
  const socials = LABEL.socials || []
  return (
    <footer className="footer">
      <div>
        <div className="big">{LABEL.name}</div>
        <div style={{ marginTop: 14, color: 'var(--mut)' }}>{LABEL.strapline || LABEL.tagline}</div>
        <div style={{ marginTop: 18, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)' }}>
          Demos &amp; bookings
        </div>
        {LABEL.email && (
          <a href={`mailto:${LABEL.email}`} style={{ marginTop: 6, color: 'var(--accent)' }}>
            {LABEL.email}
          </a>
        )}
      </div>
      <div>
        <h4>Index</h4>
        <Link to="/">Catalogue</Link>
        <Link to="/about">About</Link>
      </div>
      <div>
        <h4>Elsewhere</h4>
        {socials.map((s) => (
          <a key={s.label} href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>
        ))}
      </div>
    </footer>
  )
}
