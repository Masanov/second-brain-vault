#!/usr/bin/env node
/**
 * compile.mjs — compiles new raw/ sources into wiki/ articles.
 *
 * Runs against a local checkout (GitHub Actions has already done `actions/checkout`,
 * so all reads/writes below are plain fs operations — no GitHub API needed for content).
 * The only network call is to OpenRouter's chat completions endpoint (tool-use loop).
 *
 * The model's system prompt is AGENTS.md, verbatim. There is no second copy of the
 * schema in this file: change AGENTS.md and this script follows.
 *
 * Env vars:
 *   OPENROUTER_API_KEY   required
 *   OPENROUTER_MODEL     optional, default "qwen/qwen3.7-plus"
 *   REPO_ROOT            optional, default process.cwd()
 *   SKIP_PUSH            optional, "1" = commit locally but do not `git push`
 *   DRY_RUN              optional, "1" = do not touch git at all (no add/commit/push),
 *                         just run the model loop and write files to disk
 *   MAX_ITERATIONS       optional, default 25 — safety cap on the tool-use loop
 *
 * Exit codes:
 *   0 — nothing to do, or compile succeeded
 *   1 — failure (OpenRouter error, loop exceeded MAX_ITERATIONS, git error, ...)
 *       On failure nothing is committed and .state/compiled-log.json is not touched,
 *       so the same raw files will be retried on the next trigger.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.env.REPO_ROOT || process.cwd();
const RAW_DIR = path.join(REPO_ROOT, "raw");
const WIKI_DIR = path.join(REPO_ROOT, "wiki");
const STATE_DIR = path.join(REPO_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "compiled-log.json");
const INDEX_FILE = path.join(WIKI_DIR, "INDEX.md");
const AGENTS_FILE = path.join(REPO_ROOT, "AGENTS.md");

const MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen3.7-plus";
const MAX_ITERATIONS = Number(process.env.MAX_ITERATIONS || 25);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function log(...args) {
  console.log(`[compile]`, ...args);
}

function fail(msg) {
  console.error(`[compile] FATAL:`, msg);
  process.exit(1);
}

if (!OPENROUTER_API_KEY) fail("OPENROUTER_API_KEY is not set");
if (!existsSync(AGENTS_FILE)) fail(`AGENTS.md not found at ${AGENTS_FILE}`);
if (!existsSync(RAW_DIR)) fail(`raw/ not found at ${RAW_DIR}`);
if (!existsSync(WIKI_DIR)) fail(`wiki/ not found at ${WIKI_DIR}`);

// ---------- path safety helpers ----------

/** Resolve `name` inside `dir`, rejecting any attempt to escape it. */
function safeResolve(dir, name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("path must be a non-empty string");
  }
  const resolved = path.resolve(dir, name);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
    throw new Error(`path "${name}" escapes its directory`);
  }
  return resolved;
}

function listMarkdownFiles(dir) {
  return readdirSync(dir)
    .filter((f) => !f.startsWith(".")) // skip dotfiles like .gitkeep
    .filter((f) => statSync(path.join(dir, f)).isFile())
    .sort();
}

// ---------- state (.state/compiled-log.json) ----------

function readCompiledLog() {
  if (!existsSync(STATE_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("compiled-log.json is not an array");
    return parsed;
  } catch (e) {
    fail(`could not parse ${STATE_FILE}: ${e.message}`);
  }
}

function writeCompiledLog(names) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const sorted = [...new Set(names)].sort();
  writeFileSync(STATE_FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

// ---------- figure out pending work ----------

const allRaw = listMarkdownFiles(RAW_DIR);
const compiledSoFar = readCompiledLog();
const compiledSet = new Set(compiledSoFar);
const pending = allRaw.filter((f) => !compiledSet.has(f));

if (pending.length === 0) {
  log("nothing to compile — all raw/ files already in .state/compiled-log.json");
  process.exit(0);
}

log(`pending (${pending.length}):`, pending);

// ---------- tools exposed to the model ----------

const tools = [
  {
    type: "function",
    function: {
      name: "list_raw",
      description:
        "List every file currently in raw/, each flagged with is_new (true if it has not been compiled into the wiki yet).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_raw",
      description: "Read the full content of one file under raw/.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: 'filename inside raw/, e.g. "2026-01-19-example-note.md"' } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_index",
      description: "Read the current content of wiki/INDEX.md.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_wiki",
      description: "List all article filenames currently in wiki/ (INDEX.md excluded — use read_index for that).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_wiki",
      description: "Read the content of one existing wiki article.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: 'filename inside wiki/, e.g. "example-topic.md"' } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_wiki",
      description:
        "Create or overwrite one wiki article under wiki/. Must follow the frontmatter and linking schema described in AGENTS.md. Use update_index (not this tool) to change wiki/INDEX.md.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: 'filename inside wiki/, e.g. "example-topic.md"' },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_index",
      description: "Overwrite wiki/INDEX.md with new full content.",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
      },
    },
  },
];

function executeTool(name, args) {
  switch (name) {
    case "list_raw":
      return allRaw.map((f) => ({ path: f, is_new: !compiledSet.has(f) }));

    case "read_raw": {
      const p = safeResolve(RAW_DIR, args.path);
      if (!existsSync(p)) throw new Error(`raw/${args.path} does not exist`);
      return { content: readFileSync(p, "utf8") };
    }

    case "read_index": {
      if (!existsSync(INDEX_FILE)) return { content: "" };
      return { content: readFileSync(INDEX_FILE, "utf8") };
    }

    case "list_wiki":
      return listMarkdownFiles(WIKI_DIR).filter((f) => f !== "INDEX.md");

    case "read_wiki": {
      const p = safeResolve(WIKI_DIR, args.path);
      if (!existsSync(p)) throw new Error(`wiki/${args.path} does not exist`);
      return { content: readFileSync(p, "utf8") };
    }

    case "write_wiki": {
      if (/^index\.md$/i.test(args.path)) {
        throw new Error("use update_index to change wiki/INDEX.md, not write_wiki");
      }
      const p = safeResolve(WIKI_DIR, args.path);
      writeFileSync(p, args.content, "utf8");
      return { ok: true, path: args.path };
    }

    case "update_index":
      writeFileSync(INDEX_FILE, args.content, "utf8");
      return { ok: true };

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ---------- OpenRouter tool-use loop ----------

async function callOpenRouter(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/topics/second-brain",
      "X-Title": "second-brain-vault compile",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }
  return res.json();
}

async function runCompileLoop() {
  const agentsMd = readFileSync(AGENTS_FILE, "utf8");

  const systemPrompt = agentsMd;
  const userPrompt = [
    "Automated compile run. The following files in raw/ are new and have not been ingested yet:",
    ...pending.map((f) => `- ${f}`),
    "",
    "Follow the ingestion procedure in the schema above (system prompt) for each of these files:",
    "read them, decide which wiki/ articles to create or update, write them with proper frontmatter",
    "and wiki-links, and update wiki/INDEX.md. Process ALL of the files listed above before you finish.",
    "Do not touch raw/ — it is append-only. When you are completely done, reply with a short plain-text",
    "summary (no further tool calls) of what you created or changed.",
  ].join("\n");

  let messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    log(`iteration ${iteration}/${MAX_ITERATIONS} — calling ${MODEL}`);
    const completion = await callOpenRouter(messages);
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("OpenRouter returned no choices: " + JSON.stringify(completion));
    const message = choice.message;
    messages.push(message);

    const toolCalls = message.tool_calls || [];
    if (toolCalls.length === 0) {
      log("model finished. summary:", message.content);
      return message.content;
    }

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `could not parse arguments: ${e.message}` }),
        });
        continue;
      }

      log(`tool call: ${name}(${JSON.stringify(args)})`);
      let result;
      try {
        result = executeTool(name, args);
      } catch (e) {
        result = { error: e.message };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`exceeded MAX_ITERATIONS (${MAX_ITERATIONS}) without the model finishing`);
}

// ---------- git ----------

const MAX_PUSH_ATTEMPTS = 5;

function gitCommitAndMaybePush(message) {
  if (process.env.DRY_RUN === "1") {
    log("DRY_RUN=1 — skipping git add/commit/push entirely");
    return false;
  }
  execSync("git add -A", { cwd: REPO_ROOT, stdio: "inherit" });
  const status = execSync("git status --porcelain", { cwd: REPO_ROOT }).toString().trim();
  if (!status) {
    log("no changes to commit");
    return false;
  }
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: REPO_ROOT, stdio: "inherit" });
  if (process.env.SKIP_PUSH === "1") {
    log("SKIP_PUSH=1 — committed locally, not pushing");
    return true;
  }

  // Multiple workflow runs can be queued back-to-back (the concurrency group serializes
  // execution, but actions/checkout still pins to the commit SHA at trigger time, not
  // the branch tip at execution time). If an earlier queued run already pushed, our
  // push is a non-fast-forward and gets rejected. Fetch + rebase onto the new tip and
  // retry instead of failing the whole job.
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT }).toString().trim();
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    try {
      execSync("git push", { cwd: REPO_ROOT, stdio: "inherit" });
      return true;
    } catch (e) {
      if (attempt === MAX_PUSH_ATTEMPTS) throw e;
      log(`push rejected (attempt ${attempt}/${MAX_PUSH_ATTEMPTS}) — fetching + rebasing onto origin/${branch}, then retrying`);
      execSync(`git fetch origin ${branch}`, { cwd: REPO_ROOT, stdio: "inherit" });
      execSync(`git rebase origin/${branch}`, { cwd: REPO_ROOT, stdio: "inherit" });
    }
  }
  return true;
}

function commitMessageFor(files) {
  if (files.length === 1) return `ingest: ${files[0]}`;
  const head = files.slice(0, 3).join(", ");
  const more = files.length > 3 ? `, +${files.length - 3} more` : "";
  return `ingest: ${files.length} raw files (${head}${more})`;
}

// ---------- main ----------

try {
  await runCompileLoop();
  writeCompiledLog([...compiledSoFar, ...pending]);
  gitCommitAndMaybePush(commitMessageFor(pending));
  log("done.");
  process.exit(0);
} catch (e) {
  fail(e.stack || e.message);
}
