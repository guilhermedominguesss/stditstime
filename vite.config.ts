import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Supabase do front: aceita VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ou, como está
 * cadastrado na Vercel, SUPABASE_URL / SUPABASE_ANON_KEY (sem o prefixo).
 * Só ESTES dois nomes são expostos ao navegador (a chave anon é pública por desenho;
 * quem protege os dados é o RLS). Nenhuma outra variável sem VITE_ vai para o bundle.
 *
 * Trava de segurança: se a "anon key" não for de fato a role anon (ex.: alguém colou a
 * service role no lugar), o build FALHA. A service role nunca entra neste projeto.
 */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
  if (supabaseAnonKey && jwtRole(supabaseAnonKey) !== 'anon') {
    throw new Error('SUPABASE_ANON_KEY não é uma chave "anon". A service role/secret key não pode ir para o front.')
  }
  return {
    plugins: [react()],
    server: { host: true },
    build: { target: 'es2020', cssCodeSplit: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    test: { environment: 'node' },
  }
})
