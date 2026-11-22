import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './index.css'

/** Protótipos (bancada). O app de verdade é a rota "/". */
const LABS: Record<string, ReturnType<typeof lazy>> = {
  '/lab': lazy(() => import('./lab/Lab')),
  '/lab2': lazy(() => import('./lab2/Lab2')),
  '/lab3': lazy(() => import('./lab3/Lab3')),
  '/lab4': lazy(() => import('./lab4/Lab4')),
  '/lab5': lazy(() => import('./lab5/Lab5')),
  '/lab6': lazy(() => import('./lab6/Lab6')),
}

const path = window.location.pathname.replace(/\/+$/, '') || '/'

function Labs() {
  return (
    <main className="h-dvh-safe flex flex-col items-center justify-center gap-5 px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-telemetry text-ink-muted">Funil Vivo · protótipos</p>
      {Object.keys(LABS).map((p) => (
        <a key={p} href={p} className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">{p}</a>
      ))}
      <a href="/" className="font-mono text-sm uppercase tracking-telemetry text-signal underline underline-offset-4">/ · app</a>
    </main>
  )
}

function Page() {
  if (path === '/labs') return <Labs />
  const Lab = LABS[path]
  if (Lab) {
    return (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    )
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
