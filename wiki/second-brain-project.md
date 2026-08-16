---
title: This project
created: 2026-08-16
updated: 2026-08-16
sources: [raw/2026-08-16-why-i-built-this.md]
tags: [meta, tooling]
---

# This project

A knowledge base that compiles itself. Raw material goes into `raw/` untouched; a GitHub
Action runs a model over anything new and writes interlinked articles into `wiki/`. The
[[caffeine]] and [[sleep-pressure]] articles shipped with this template are a worked example
of the output.

Built by Aleksei ([github.com/Masanov](https://github.com/Masanov)) and in daily use since
July 2026.

## Why not a local folder

The first version was a local directory with Obsidian on top and git underneath for sync.
It broke whenever two processes touched the repository at once — a sync running during an
agent's commit produced `index.lock`, and everything stopped until it was cleared by hand.
More time went into reconciling local and remote than into writing notes.

The local copy was deleted. Every writer now goes through the GitHub API, and a clone is a
read-only convenience. The constraint is recorded in `AGENTS.md` so that no agent
reintroduces it.

## Why the schema lives in the repository

Each tool that touched the knowledge base wanted its own configuration and its own
assumption about where notes lived. Instead, all of them read `AGENTS.md` at the repository
root: the interactive agent, the editor assistant, the CI job. Changing the schema is a
single edit, with nothing to redeploy and no copy left to go stale.

## Operating notes

- Compilation costs roughly **$2.70/month** at about one run per day over 84 articles.
- `INDEX.md` is the dominant cost: it is read on every run and carried through every
  iteration of the tool-use loop. At 47 KB it had grown to roughly five times the size the
  schema prescribes — the file meant to save context had become the largest thing read.
  Outstanding, noted 2026-08-16.

## Companion

Capture is handled by a separate repository: a browser extension and a small function that
turn a page, a selection or a YouTube transcript into markdown and commit it to `raw/`.
