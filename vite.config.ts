import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: { target: 'es2020', cssCodeSplit: true },
  test: { environment: 'node' },
} as never)
