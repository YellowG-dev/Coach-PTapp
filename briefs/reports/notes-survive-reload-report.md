# Report — notes-survive-reload

- **Result** — done. Applied in the chat session that wrote the brief, 13 Nov 2026. Not merged.
- **Changes** — per client repo (Henna, Joonatan, Ville, Juha), branch `fix/notes-survive-reload`:
  - `src/app.jsx` — scope A–F of the brief.
  - `test-notes.mjs` — new; mounts the real app in jsdom with a stored day.
  - `CLAUDE.md` — `test-notes.mjs` added to the gate list.
  - `src/core/program-<client>.js` — `APP_VERSION` 5.9.4-beta1 → 5.9.5-beta1.
  - `bundle.js` — rebuilt. `styles.css` unchanged.
  - Coach: brief and this report only.
- **Gates** — identical in all four repos: verify-program-delivery `95 passed, 0 failed`; test-history-versions `29 passed, 0 failed`; test-wearable-scope `10 passed, 0 failed`; test-notes `15 passed, 0 failed`; verify-train `ALL CHECKS PASSED`; build ok. Every other verify/test file also ends 0 failed, except the one under Open.
- **Before/after** — `test-notes.mjs` against the old `app.jsx`: `8 passed, 7 failed` (empty box after cold start, note deleted by focus + blur, nothing stored at pagehide, no autosave, no date).
- **Hashes** — `src/app.jsx` sha256 `2fd4138b57e459f81779c54b29c8b99af5f704156c4338de158b25ae52a4f260` in all four.
- **Evidence outside the repo** — on Juha's programme, an earlier note on `db-bench` renders as "📌 Nov 5: …" both with the prescribed exercise and with "Doing: Barbell bench press".
- **Open**
  - `verify-wearables.mjs` ends `17 passed, 2 failed` on `main` and on the branch alike — pre-existing, not a gate, untouched.
  - Not tried on a real phone. After deploy: type a note, refresh without tapping out, check it is there; tap in and out of the box, check it stays.
  - Deploy order: Henna → Joonatan → Ville → Juha. Coach PR is documents only.
