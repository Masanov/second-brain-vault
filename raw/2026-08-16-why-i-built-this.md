---
title: Note to self — why this repository exists
created: 2026-08-16
type: note
---

Writing this down because I keep re-explaining it.

I started with a local folder. Obsidian on top for the graph view, git underneath for
sync. It worked until two things touched the repository at once — a sync running while an
agent was committing — and then `index.lock`, and everything stopped until I cleaned it up
by hand. I spent more time getting local and remote to agree than I ever spent writing
notes.

So I deleted the local copy. Everything writes through the GitHub API now, and the clone on
my laptop is a read-only convenience I could delete tomorrow without consequence. That
constraint is written into AGENTS.md so no agent quietly reintroduces it.

The other half was the agents themselves. Every tool I wanted to use — one assistant, then
another, then a CI job — wanted its own configuration, its own idea of where my notes lived.
Now they all read the same file at the repo root. Changing the schema means editing one
document; nothing gets redeployed and no tool goes stale.

Two numbers I want to remember. Compiling costs about $2.70 a month at roughly one run a
day across 84 articles. And the index — the file meant to save context — had grown to 47 KB,
about five times the size the schema asks for. The thing built to reduce reading had become
the largest thing being read.
