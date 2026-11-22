import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useState } from 'react'
import { InboxFlow } from '../inbox/InboxFlow'
import { PhoneFrame, ProofPlaceholder } from '../inbox/parts'

/** /lab6 — a Caixa de Entrada Viva aprovada, isolada (sem tracking e com prova placeholder). */
export default function Lab6() {
  const [proof, setProof] = useState(false)
  return (
    <MotionConfig reducedMotion="user">
      <PhoneFrame>
        <InboxFlow onProof={() => setProof(true)} />
        <AnimatePresence>{proof && <ProofPlaceholder onBack={() => setProof(false)} />}</AnimatePresence>
      </PhoneFrame>
    </MotionConfig>
  )
}
