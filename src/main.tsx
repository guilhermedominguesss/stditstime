import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const Lab = lazy(() => import('./lab/Lab'))
const Lab2 = lazy(() => import('./lab2/Lab2'))
const Lab3 = lazy(() => import('./lab3/Lab3'))
const Lab4 = lazy(() => import('./lab4/Lab4'))
const Lab5 = lazy(() => import('./lab5/Lab5'))
const ROUTES: Record<string, ReturnType<typeof lazy>> = { '/lab': Lab, '/lab2': Lab2, '/lab3': Lab3, '/lab4': Lab4, '/lab5': Lab5 }

const path = window.location.pathname.replace(/\/+$/, '')

function Placeholder() {
  return (
    <main className="h-dvh-safe flex flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-telemetry text-ink-muted">Funil Vivo · protótipos</p>
      <a href="/lab" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        /lab · motor de partículas
      </a>
      <a href="/lab2" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        /lab2 · caixa de entrada viva
      </a>
      <a href="/lab3" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        /lab3 · caixa de entrada por nicho
      </a>
      <a href="/lab4" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        /lab4 · base do app
      </a>
      <a href="/lab5" className="font-mono text-sm uppercase tracking-telemetry text-ink underline underline-offset-4">
        /lab5 · simulação e caixa real
      </a>
    </main>
  )
}

function Page() {
  const Screen = ROUTES[path]
  if (!Screen) return <Placeholder />
  return (
    <Suspense fallback={null}>
      <Screen />
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
