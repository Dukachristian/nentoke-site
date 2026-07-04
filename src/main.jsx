import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './styles.css'
import Layout from './components/Layout.jsx'
import Programme from './pages/Programme.jsx'
import ReleaseDetail from './pages/ReleaseDetail.jsx'
import About from './pages/About.jsx'

// Ground the page before first paint (bone-on-black by default; the dot in the
// corner flips it to a black-on-bone "screenprint negative").
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'

// Three routes, that's the whole template:
//   /              → the Archive: the catalogue under the CUE read-head
//   /releases/:id  → one release
//   /about         → the label
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Programme /> },
      { path: '/releases/:id', element: <ReleaseDetail /> },
      { path: '/about', element: <About /> },
      // old list route folds back into the archive
      { path: '/releases', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
