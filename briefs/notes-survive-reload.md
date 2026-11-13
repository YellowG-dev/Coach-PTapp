# Brief — Typed notes survive a reload; exercise notes carry their date

Written in chat 11–13 Nov 2026 and **applied in the same chat session** at
John's request ("Apply the brief"), so there is no separate cloud session.
Report: `briefs/reports/notes-survive-reload-report.md`.

**Repos:** Henna, Joonatan, Ville, Juha (shared `src/app.jsx`, new
`test-notes.mjs`, `CLAUDE.md` gate line, `APP_VERSION`). Coach: this brief and
its report only. Takes the shared `app.jsx` lock (no open PRs on 13 Nov).

## 1. Findings (verified 11 Nov 2026)

| # | What John saw | Cause |
|---|---|---|
| F1 | A long daily note, typed and tapped out of, was gone after a refresh | The note WAS saved and uploaded (day upload 245 → 426 bytes at 18:42:38). After the reload the notes box started **empty** — `notesDraft` was only seeded when the viewed day changed, never at start-up. A blur of the empty box ran `commitNotes`, which treated "empty" as "delete" (upload 493 → 312 bytes at 18:45:44). |
| F2 | (found while investigating) | The save-on-page-hide guard blurs the focused box, but the write to storage sits inside a React state update that runs after the event. On a reload nothing was written. Reproduced on the real app in jsdom. Affects every typed field, not only notes. |

The lost note cannot be recovered: device and cloud both hold the version
without it.

## 2. Owner decisions (13 Nov 2026)

- **N1:** apply the fix for F1 and F2.
- **N2:** an exercise note in strength training shows **the date it was written**.
- **N3:** an exercise note is visible on its exercise **whichever variant is
  selected**.

## 3. Scope (all in `src/app.jsx`)

- **A — box shows the stored note.** `notesDraft` starts `null` ("not typed
  in"); the textarea shows `notesDraft ?? rec.notes`. Day change resets to `null`.
- **B — an untouched box never writes.** `commitNotes` returns at once when the
  draft is `null`, and writes nothing when the text equals what is stored.
  `persist` accepts `null` from an updater as "no change" (no write, no upload).
  `commitExNote` uses the same no-change rule.
- **C — page-hide save lands in time.** The blur in `saveFocused` runs inside
  `flushSync`, so the storage write happens before the handler returns.
- **D — autosave.** The daily notes box saves one second after the last
  keystroke, without losing focus or the draft.
- **E — dated exercise notes (N2).** `lastExNotes[id]` is `{ note, day }`; shown
  as "📌 5 Nov: …" (phone's own date format; year added when it differs).
  Today's note keeps "Today:"; on a past day it shows that day's date.
- **F — variant-independent (N3).** Already true in storage: notes are keyed by
  the exercise id, never by the `id::variant` load key. Now stated in a code
  comment and locked by a test. Loads stay per variant, on purpose.

No data migration: the date is the day the note is stored under.

## 4. Out of scope

- Coach app code (it already shows each note on its own day's card).
- Showing more than the most recent earlier note per exercise.
- `verify-wearables.mjs` fails 2 checks on `main` before this change
  ("only real sessions counted", "session minutes exclude housework"). Not a
  gate, not touched — needs its own look.

## 5. Gates (each client repo, each MUST end `0 failed`)

```
npm install
node verify-program-delivery.mjs
node test-history-versions.mjs
node test-wearable-scope.mjs
node test-notes.mjs          # new: fails 7 checks on the old app.jsx
node verify-train.mjs        # hooks stay above the loading return
npm run build
```

`src/app.jsx` must be byte-identical in all four repos.
