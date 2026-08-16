# Connecting an agent

The point of this directory: **the schema lives in the repository, not in the tools.**

`AGENTS.md` at the repo root is the contract. Everything that touches this knowledge base
reads that file and follows it. Nothing keeps its own copy.

| Implementation | Where it lives | Role |
|---|---|---|
| `AGENTS.md` | repo root | the contract — single source of truth |
| `second-brain.skill.md` | your agent's skills directory | a thin pointer to the contract |
| `scripts/compile.mjs` | this repo, run by CI | loads `AGENTS.md` verbatim as its system prompt |

## Why it's arranged this way

Change the schema and every agent picks it up on its next read. No redeployment, no
re-registering a tool, no editing three files that drift apart. The skill below is four
paragraphs long, and most of it says "read `AGENTS.md` and follow it exactly."

The same contract runs attended and unattended. An agent doing a manual ingest with a
human watching, and the nightly cron job running with nobody watching, follow the same
document. There is no "automation version" of the rules to keep in sync.

## Setup

1. Connect a GitHub MCP server to your agent, scoped to **this repository only**.
2. Copy `second-brain.skill.md` into your agent's skills directory. For Claude Code and
   Cowork that is `~/.claude/skills/second-brain/SKILL.md`. For other agents, use whatever
   mechanism loads standing instructions — the content is plain markdown and portable.
3. Replace `<your-username>/<your-wiki>` in both that file and `AGENTS.md`.

That's it. There is no per-agent configuration beyond pointing it at the repo.

## Adding a different agent

Anything that can read a file from the repo and write a commit back can participate.
Editor assistants, CI jobs, a shell script with an API key. The only requirement is that
it reads `AGENTS.md` first and treats it as binding.
