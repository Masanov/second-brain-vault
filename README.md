![Second Brain — vault](assets/banner.png)

# Second Brain — vault

*Notes that file themselves. Drop raw material into `raw/`, get an interlinked wiki in `wiki/`.*

<!-- demo.gif -->

## The problem

Saving something interesting meant deciding where it goes first — a notes app, a document,
or a browser tab that stayed open for a month. And every LLM agent I later wanted to use it
with wanted its own setup: its own connector, its own instructions, its own idea of where my
notes lived.

Two ends of the same wall. This repository collapses both into one git repo: a single
destination for capture, and a single file that tells any agent how to behave.

## How it works

```
raw/  ──push──▶  GitHub Action  ──▶  wiki/
 ▲                    │                 │
 │              reads AGENTS.md         │
capture                                 ▼
                                  agents read it
```

`raw/` is append-only source material. `wiki/` is compiled, interlinked articles — one file
per concept, wiki-links between them, an index over the whole thing.

Pushing anything to `raw/` triggers `.github/workflows/compile.yml`, which runs a model over
the new files and writes articles into `wiki/`. A nightly cron catches anything a missed push
left behind.

**`AGENTS.md` is the schema** — directory layout, frontmatter, ingestion procedure, how to
answer a query, how to record contradictions. The compile job loads it verbatim as its system
prompt. An interactive agent reads the same file. Nothing keeps a second copy, so changing the
schema changes every consumer at once. See [`agents/`](agents/) for connecting your own.

## Quickstart

1. Click **Use this template** and create your repository.
2. Add `OPENROUTER_API_KEY` under Settings → Secrets and variables → Actions.
   Optionally set an `OPENROUTER_MODEL` variable; the default is `qwen/qwen3.7-plus`.
   Any model with tool-calling support works.
3. Drop a markdown file into `raw/` and push.

The Action compiles it and commits the result. `raw/` and `wiki/` ship with one worked
example — a single clipped article compiled into two linked wiki entries — so you can see the
shape before running anything. Delete both directories' contents and reset
`.state/compiled-log.json` to `[]` when you want a clean start.

The repository doubles as an Obsidian vault. Open the folder in Obsidian for the graph view.

## What this does not do

**Anything that can write to `raw/` can influence `wiki/`.** New sources are fed to a model
that has write access to the wiki. Text inside a source that looks like an instruction is a
prompt injection vector. `AGENTS.md` tells the model to treat source content as data, which is
mitigation, not a guarantee. Keep this in mind before wiring up automated capture from the open
web.

**The model is wrong sometimes.** This is why `raw/` is append-only and never edited: the
sources are the record, `wiki/` is a derived artifact you can delete and rebuild.

**The wiki only grows.** The schema forbids deleting information — superseded facts get marked
outdated with a date instead. Over years this needs manual pruning; there is no garbage
collection.

**Every compile run costs money.** For calibration, my own instance — 84 articles, roughly
one compile a day — runs at **about $2.70 a month** on `qwen3.7-plus`: a mean of $0.08 per
compile across 7 tool-use iterations. Prompt caching covers half the input tokens and takes
about a third off the bill.

Cost grows with the size of `wiki/INDEX.md`, because the index is read on every run and then
carried through every remaining iteration. Extrapolating from my numbers, a 1000-article wiki
lands near $13 a month. Keeping index entries to the one line the schema asks for matters
more than the model you pick.

**No tests.** The compile job is a tool-use loop against a model; its output is checked by
reading it.

## Who built this

I'm Aleksei. I work on product documentation and build small tools on the side — a voice
assistant on an ESP32, local LLM setups, a couple of language-learning apps. This is the one
I ended up using every day: it has been my own knowledge base since July 2026, and the
capture side of it lives in a companion repository.

- Write-up of how it came together — *link coming*
- More things I build — [github.com/Masanov](https://github.com/Masanov)

If you run something similar, I'd like to hear where your schema lives. Open an issue.

## Credits

The pattern is Andrej Karpathy's "LLM wiki": raw sources compiled into an interlinked
knowledge base, with the human as curator and the model as librarian.

## License

MIT
