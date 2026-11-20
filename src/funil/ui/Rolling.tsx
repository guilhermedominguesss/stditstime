import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT_EXPO } from '../tokens'

/** Número que rola como odômetro ao mudar (troca de dígito de baixo para cima). */
export function Rolling({ value, format = String }: { value: number; format?: (n: number) => string }) {
  return (
    <span className="relative inline-flex overflow-hidden tabular" style={{ height: '1.2em' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '100%' }}
          animate={{ y: '0%', transition: { duration: 0.35, ease: EASE_OUT_EXPO } }}
          exit={{ y: '-100%', transition: { duration: 0.2 } }}
          className="leading-[1.2em]"
        >
          {format(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
