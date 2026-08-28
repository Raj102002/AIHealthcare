# ClearSignal — 3-Minute Rapid-Fire Script

Written to be read aloud, not paraphrased from bullets. Word count and
timing estimate are printed at the bottom — check them if you edit this.
Sources: `plan.md`, `design.md`, `lib/rerank.ts`, `lib/models.ts`,
`evals/results/run_1786293151073.json`.

---

Standard Lyme disease testing has a timing problem, not an information
problem. It detects the antibody *response*, not the bacterium — and that
response takes three to six weeks to develop. So a patient with a real,
active infection usually tests negative at first. That negative result then
follows them through every later visit, even though the test was early, not
wrong. Without a reliable test, diagnosis falls back on the sequence of
events — exposure, onset, progression — and that sequence lives in no chart.
This is the HHS OASH and LymeX Innovation Accelerator brief, almost word for
word: use federal open data to help these patients get diagnosed faster,
with citations and uncertainty, never a diagnosis from the model itself.

ClearSignal is my answer: a hybrid-RAG chat grounded in CDC data, a
negative-test contextualizer that explains what an early negative actually
means, a symptom and function journal that captures good days as well as
flare-ups, and an agentic "Ask Your Journal" assistant that computes real
severity trends from a patient's own logged data — a genuine multi-step Groq
tool-calling loop, not a scripted response. All of it sits behind a
deterministic red-flag layer that screens for chest pain, stroke signs, and
crisis language *before* any model call runs, and that layer never
diagnoses.

One technical takeaway. Retrieval here is hybrid — dense vector search plus
a hand-rolled BM25 index, fused by reciprocal rank fusion, then reranked by
an LLM call. My first reranker model looked fine on paper but reliably
scored wrong-disease content near the top of the scale — ten out of ten for
Lyme antibiotic information against a flu-treatment query — because it
shared vocabulary with the query. I didn't catch that by reading the prompt
more carefully. I caught it by running the eval harness against the real
corpus and watching the refusal rate on unanswerable questions sit at
twenty to forty percent when it should have been at a hundred. Swapping the
reranker model, same prompt, took that number to a hundred percent, with no
regression on the questions it should answer. The lesson: don't trust that
a prompt reads well — trust the number the eval harness gives you.

Live at healwithaura.netlify.app/chat. Thank you.

---

**Word count:** 375 words (verified by script). **Estimated time:** ~2:30–2:40
at a brisk, conversational 140–150 wpm reading pace — leaves a buffer under
the 3-minute mark. If you read slower than that, trim the "one technical
takeaway" paragraph first — it's the densest one.
