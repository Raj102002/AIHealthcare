This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## RAG + voice setup

`/chat` is a single RAG-grounded assistant: it retrieves from a Lyme disease knowledge
base (CDC surveillance statistics + educational content) when relevant, and falls
through to general wellness guidance otherwise. Voice input/output are optional and
layer on top of the same chat pipeline.

1. Copy `.env.local.example` to `.env.local` and fill in `GROQ_API_KEY` and the
   Back4App keys as before.
2. Create a free [Upstash Vector](https://console.upstash.com/vector) index with a
   built-in embedding model attached (e.g. `mixedbread-ai/mxbai-embed-large-v1`), and
   add its REST URL/token to `.env.local` as `UPSTASH_VECTOR_REST_URL` /
   `UPSTASH_VECTOR_REST_TOKEN`.
3. Run `npm run ingest` to chunk `corpus/*.md` + `data/*_long.csv`, embed them via
   Upstash, and write `data/corpus.json` (the local BM25 keyword index) and
   `data/ingest-manifest.json` (idempotency tracking — safe to re-run any time the
   corpus changes; unchanged chunks are skipped). This runs offline, never at request
   time.
4. Run `npm run eval` to check retrieval quality against `evals/rag.jsonl` (hit rate
   on answerable questions, refusal rate on the unanswerable set).

Retrieval is hybrid: dense (Upstash) + BM25 keyword search, fused with Reciprocal Rank
Fusion, reranked with a Groq LLM call, and thresholded — if nothing clears the
relevance bar, no context is passed to the model and it says so rather than guessing.
Follow-up questions are rewritten against the last few turns before retrieval runs.

Voice mode (mic button in `/chat`) records via `MediaRecorder`, auto-stops on
silence or a 60s cap, transcribes through `/api/transcribe` (Groq
`whisper-large-v3-turbo`), and always shows the transcript in the composer for
review before sending — nothing is auto-sent. Spoken responses go through
`/api/speak` (Groq `playai-tts`), falling back to the browser's `SpeechSynthesis`
API if that call fails.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
