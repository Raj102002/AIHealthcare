[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=24294988&assignment_repo_type=AssignmentRepo)

# ClearSignal

AI-assisted diagnostic support for Lyme disease, built for the **LymeX Innovation
Accelerator** (sponsor chain: HHS OASH → LymeX → NIH Office of Research on Women's
Health). Full project narrative, honest scope/limitations, and setup instructions live
in [`healthcare-ai/README.md`](healthcare-ai/README.md) — **start there** for anything
technical. This file is the top-level index every other required artifact is linked from.

| | |
|---|---|
| **Author** | Rajamanendra Surisetty — rsurisetty2025@fau.edu |
| **Sponsor** | LymeX Innovation Accelerator (HHS OASH / NIH ORWH) |
| **Deployed app** | [healwithaura.netlify.app/chat](https://healwithaura.netlify.app/chat) |
| **Application source** | [`healthcare-ai/`](healthcare-ai/) |

## Artifact Index

Everything required for the final showcase submission, in one place.

| Artifact | Where |
|---|---|
| **Deployed application** | [healwithaura.netlify.app/chat](https://healwithaura.netlify.app/chat) — live Netlify deployment |
| **Demo video (3–5 min)** | `[PENDING — record from healthcare-ai/docs/demo-video-script.md, then paste the YouTube/Vimeo link here]` |
| **Pitch deck** | [`artifacts/ClearSignal_Pitch_Deck.pptx`](artifacts/ClearSignal_Pitch_Deck.pptx) — 15 slides + speaker notes, problem → solution → architecture → results → roadmap |
| **One-page project summary** (Canvas intent, Aug 19) | [`artifacts/ClearSignal_Showcase_Intent.pptx`](artifacts/ClearSignal_Showcase_Intent.pptx) |
| **Showcase handout** (for attendees, print-ready single page) | [`artifacts/ClearSignal_Showcase_Handout.pptx`](artifacts/ClearSignal_Showcase_Handout.pptx) |
| **Project plan** | [`plan.md`](plan.md) — requirements mapping, timeline, honest status per work item |
| **Technical design** | [`design.md`](design.md) — architecture, data flow, DB schema, API structure, deployment (Mermaid diagrams throughout) |
| **Architecture diagrams** | [`design.md` §1 System Architecture](design.md#1-system-architecture), [§4 AI Component Diagram](design.md#4-ai-component-diagram), [§7 Deployment Architecture](design.md#7-deployment-architecture) |
| **API structure** | [`design.md` §6 API Architecture](design.md#6-api-architecture) |
| **Demo video shot-list / script** | [`healthcare-ai/docs/demo-video-script.md`](healthcare-ai/docs/demo-video-script.md) |
| **Deployment instructions** | [`healthcare-ai/docs/deployment.md`](healthcare-ai/docs/deployment.md) — local dev, Docker, Netlify, database setup |
| **Evaluation / testing docs** | [`healthcare-ai/evals/README.md`](healthcare-ai/evals/README.md) + [`healthcare-ai/evals/`](healthcare-ai/evals/) (gold set, retrieval eval, recorded run results) |
| **Security documentation** | [`healthcare-ai/docs/security-audit.md`](healthcare-ai/docs/security-audit.md) |
| **Privacy / data retention** | [`healthcare-ai/docs/privacy.md`](healthcare-ai/docs/privacy.md) |
| **Cost analysis** | [`plan.md` — Security & Costs](plan.md#security--costs) (projected monthly cost table, current usage: $0/month) |
| **Database optimization notes** | [`healthcare-ai/docs/database-optimization.md`](healthcare-ai/docs/database-optimization.md) |
| **Known limitations / future work** | [`plan.md` §4 Pending Work](plan.md#4-pending-work-not-yet-started) and [Honesty note](plan.md#honesty-note); pending-feature spec: [`healthcare-ai/docs/spec-pet-sentinel-treatment-window.md`](healthcare-ai/docs/spec-pet-sentinel-treatment-window.md) |

## What ClearSignal Does

Standard Lyme disease serology detects the antibody *response*, not the bacterium —
and that response takes 3–6 weeks to develop, so a patient with a real, active
infection most likely tests negative at first presentation. That negative result then
anchors every later clinician away from the correct diagnosis. ClearSignal produces
the evidence a chart is missing instead: a hybrid RAG chat grounded in CDC data, a
symptom/function journal that captures good days (not just flare-ups), timeline
anchors and exposure reconstruction, and an AI-generated one-page clinician handoff —
all under a deterministic red-flag safety layer that never diagnoses.

See [`healthcare-ai/README.md`](healthcare-ai/README.md) for the full feature-to-failure-mode
mapping, tech stack, RAG/voice setup instructions, and — importantly — the sections on
what's genuinely unverified and out of scope. That honesty is deliberate: [`plan.md`](plan.md)
and [`design.md`](design.md) mark unfinished work as **[PLANNED]** rather than presenting it
as done.

## Repository Layout

```
buildphase-Raj102002/
├── README.md                  ← you are here (artifact index)
├── plan.md                    ← requirements, timeline, honest status
├── design.md                  ← architecture, schema, API, diagrams
├── artifacts/                 ← pitch deck, one-page summary, showcase handout
└── healthcare-ai/             ← application source (Next.js)
    ├── README.md               ← full project README (author info, tech stack, setup)
    ├── app/, components/, lib/ ← application code
    ├── docs/                   ← deployment, security, privacy, demo script, feature specs
    └── evals/                  ← eval sets + recorded run results
```

## Local Setup

See [`healthcare-ai/README.md` — Getting Started](healthcare-ai/README.md#getting-started)
and [`healthcare-ai/docs/deployment.md`](healthcare-ai/docs/deployment.md) for local dev,
Docker, and Netlify deployment instructions.
