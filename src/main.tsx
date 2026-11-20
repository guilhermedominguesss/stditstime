import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const Lab = lazy(() => import('./lab/Lab'))

const isLab = window.location.pathname.replace(/\/+$/, '') === '/lab'

function Placeholder() {
  return (
    <main className="h-dvh-safe flex flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-telemetry text-ink-muted">Funil Vivo · fase 1</p>
      <a href="/lab" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        Abrir o /lab do motor
      </a>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLab ? (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    ) : (
      <Placeholder />
    )}
  </StrictMode>,
)
