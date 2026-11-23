import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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

/**
 * Preload das 3 fontes da intro (Inter Tight 500/600 e Instrument Serif itálico): baixam junto
 * com o CSS, então o primeiro paint já sai com a fonte certa na grande maioria dos casos
 * (o @fontsource usa font-display: swap, então o texto nunca fica invisível).
 */
function preloadIntroFonts(): Plugin {
  const wanted = [/inter-tight-latin-500-normal.*\.woff2$/, /inter-tight-latin-600-normal.*\.woff2$/, /instrument-serif-latin-400-italic.*\.woff2$/]
  return {
    name: 'fv-preload-intro-fonts',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => wanted.some((re) => re.test(f)))
      return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: '/' + f, crossorigin: '' }, injectTo: 'head-prepend' as const }))
    },
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
    plugins: [react(), preloadIntroFonts()],
    server: { host: true },
    build: { target: 'es2020', cssCodeSplit: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    test: { environment: 'node' },
  }
})
