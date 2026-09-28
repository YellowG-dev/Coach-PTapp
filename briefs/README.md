# Briefs

Work orders for Claude Code cloud sessions. One brief = one session.

Briefs are written in chat (where the design is decided and the database can be
reached) and committed here before the session starts. A cloud session reads
its brief, does exactly that, and stops.

## How a session runs a brief

1. Read the brief top to bottom before touching anything.
2. Clone every repo listed under **Repos**. Read each client repo's `CLAUDE.md`;
   its hard rules outrank anything in a brief.
3. Do the work in **Scope**. Nothing in **Out of scope**, and no file that is
   not listed, unless the brief says so.
4. Run every command under **Gates**. Each must end `0 failed`.
5. Branch name is given in the brief. Commit per repo, push, open one PR per
   repo. Do **not** merge — John merges and deploys.
6. Write the report (below) and push it with the Coach PR.

## Stop rules (every brief)

- A gate fails twice for the same cause → stop, write the report, do not keep
  trying variations.
- The brief contradicts the code (a file, function or line is not where the
  brief says) → stop and report. Briefs are written from a snapshot; the code
  wins, and a human decides.
- A decision the brief does not cover → stop and report the question. Do not
  pick one.
- Never touch Supabase. Cloud sessions have no database access by design.
- No subagents or parallel fan-out unless the brief asks for them.

## Report

`briefs/reports/<brief-name>-report.md`, short:

- **Result** — done / partly done / stopped, in one line.
- **Changes** — per repo: files changed, one line each on why.
- **Gates** — the last line of each gate's output, per repo.
- **Hashes** — for every file that must be byte-identical across repos.
- **Open** — anything unresolved, questions, surprises.

## Deploy order (for John)

Henna → Joonatan → Ville → Juha → Coach.
