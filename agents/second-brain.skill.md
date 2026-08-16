---
name: second-brain
description: "Use whenever the user wants to save, add, or ingest something into their personal knowledge base — trigger phrases include \"add this to my second brain\", \"save this to my wiki\", \"remember this\", or any request to file away research, an article, a fact, or an idea for later. Also use when the user asks a question that should be answered FROM that knowledge base (\"what do I have on X\", \"check my second brain for X\"), or wants a lint pass over it. Works identically regardless of which project or folder is open — it always reaches the knowledge base through the GitHub MCP, no local file access needed. Trigger proactively whenever the user asks to remember, save, or capture something, even without saying \"second brain\"."
---

# Second Brain

The user keeps a personal knowledge base (Karpathy "LLM wiki" pattern): raw sources get
compiled into an interlinked wiki of markdown articles. It's a git repo on GitHub,
`<your-username>/<your-wiki>`, branch `main`. A GitHub Actions workflow also compiles
`raw/` into `wiki/` automatically on push — see `AGENTS.md` in the repo for how that works.

The repo's own `AGENTS.md` is the source of truth for the schema: directory layout,
ingestion steps, frontmatter, index format, commit conventions, privacy rules. Don't
duplicate or improvise that schema here — always read the live `AGENTS.md` first and follow
it exactly. It's human-curated and may change; this skill just gets you to it.

## The one channel: GitHub MCP, always

Read and write this knowledge base through the GitHub MCP, against
`<your-username>/<your-wiki>` branch `main`. This is true no matter what's mounted in the
current session — there is no local-clone fallback and no mirroring step. A sandboxed
agent environment has no stored GitHub credentials, so local `git pull`/`git push` don't
work there anyway.

1. Read `AGENTS.md` and `wiki/INDEX.md` first, every time — that is the actual current state.
2. Do the work `AGENTS.md` asks for: ingesting a new source, compiling it into wiki
   articles, updating the index, answering a query into `outputs/`, or a lint pass.
3. Write the result as a commit — this is the change that actually lands. Use the commit
   message convention `AGENTS.md` specifies.

No folder-access request, no local mirroring, no sync-back step. If the user has a local
clone open elsewhere (Obsidian, another editor), it picks up the change on its own next
`git pull`; not this skill's concern.

## Reporting back

Keep it short: which file(s) changed and a one-line description of what was added. No need
to reprint the full article back to the user — they can open the file if they want it.

## Judgment calls

Substantial content (an article, a research summary, a long explanation) is a new source:
drop it in `raw/` and run the full ingest-and-compile pipeline from `AGENTS.md`.

A quick fact or one-liner still goes through the same pipeline — `raw/` is meant to be an
append-only log, so don't shortcut around it even for small things.

Never invent a different directory structure or workflow than what `AGENTS.md` specifies.
If something seems missing or wrong in the schema, do the task with the schema as it is and
separately flag the gap to the user rather than silently deciding on your own convention.
