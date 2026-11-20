# Funil Vivo · It's Time

STD próprio da It's Time: a página entre o anúncio e o WhatsApp do Guilherme.
Vite + React + TypeScript + Tailwind + Framer Motion + Supabase. Motor de partículas em Canvas 2D puro.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173  ·  /lab = bancada do motor
npm run dev -- --host   # para abrir no celular na mesma rede
npm run build
npm test
```

## Onde fica cada coisa

| Caminho | O quê |
|---|---|
| `src/funil/config.ts` | Toda constante de negócio, com a origem comentada |
| `src/funil/tokens.ts` | Cores, fontes e easings (Tailwind + motor) |
| `src/funil/math.ts` | Matemática pura (testável) |
| `src/funil/engine/` | `FunnelEngine`: canvas, partículas, câmera, timeline do clímax |
| `src/lab/Lab.tsx` | `/lab`: sliders de debug e FPS sempre visível |

## Deploy (Vercel)

Importar o repositório na Vercel (preset Vite). As variáveis estão em `.env.example`.
`vercel.json` já reescreve `/lab` e as demais rotas para o `index.html`.
