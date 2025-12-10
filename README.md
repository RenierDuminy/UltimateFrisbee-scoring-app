# Ultimate Field-Side Score Sheet

A touch-first Ultimate scorekeeping console that runs 100 % in the browser. The static bundle (`index.html`, `styles.css`, `scripts.js`) drives all match controls locally—dual timers, roster sync, score/event logging, timeout management, ABBA tracking, and CSV export—while the optional Google Apps Script backend (`function doPost.ts`) streams those events into Google Sheets. State is auto-saved in `localStorage`, so reloading the tab or swapping devices can restore the match in seconds.

---

## How the app works

- **Match setup modal** – Choose Team A/B, populate rosters from a remote feed or manual entry, set match duration, halftime target/break, timeout allowances (total + per half), timeout length, and ABBA start (None/M/F). Settings persist between sessions.
- **Dual timers** – Main countdown (default 100 min) plus a configurable seconds timer (default 75 s). Tap to play/pause; hold for three seconds to reset. Timers update their columns’ colors to show running vs paused state.
- **Event logging** – Each goal captures scorer + assist, updates the scoreboard, and writes an ABBA value when enabled. Dedicated controls record match start, half time, timeouts (with edit reassignment), and game stoppages. Entries are editable/deletable via gear buttons.
- **Timeout + stoppage governance** – Automatic decrementing of per-team totals, optional per-half resets, halftime-triggered timeout refresh, halftime break timer, and a stoppage toggle that pauses both timers until cleared.
- **Auto persistence** – `localStorage` snapshots the entire `gameState` (scores, logs, timers, ABBA choice, stoppage flag, timeout counts, rosters) every two seconds and before unload. Returning within 24 hours prompts to restore the session.
- **Exports** – On submit, the client always downloads a CSV and, if `CONFIG.SUBMIT_URL` is set, posts the structured log JSON to Apps Script. The backend creates/reuses a tab named `"<Team A> vs <Team B>, <date>"`, keeps headers synchronized, and appends all custom fields.

---

## Setup

### 1. Backend (Google Apps Script)

1. Create or open the Google Sheet that will store match logs and copy its **Sheet ID**.
2. Visit `script.new`, paste `function doPost.ts`, and replace `SHEET_ID` with the ID from step 1.
3. Deploy as **Web app → New deployment**:
   - Execute as **Me**
   - Who has access: **Anyone with the link**
   - Save the resulting `/exec` URL.

The handler automatically:

- Sanitizes tab names (`"<GameID>, <Date>"`) to satisfy Sheets’ naming rules.
- Reuses an existing tab per game and inserts columns if new log fields appear.
- Appends event batches in a single `setValues` call for reliability.

### 2. Frontend

1. Open `scripts.js` and update the `CONFIG` object:
   - `API_URL` – optional remote roster source (CSV columns = team names, JSON shape `{ "Team": ["Player", ...] }`). Leave blank to skip fetching.
   - `SUBMIT_URL` – Apps Script web app URL. When empty the UI still creates CSV downloads but skips the HTTP POST.
   - Adjust other defaults (match duration, halftime trigger score, timeout counts, auto-save interval) as needed.
2. Host `index.html`, `styles.css`, `scripts.js`, `logo.png`, and `page_icon.png` on any static host (GitHub Pages, Netlify, S3, local `python -m http.server`, etc.).
3. Swap logos/colors by editing the assets and CSS variables in `styles.css`.

---

## Daily use

1. **Configure** – Tap *Match Setup*, choose teams, confirm rosters (auto-filled from the fetched data when available), set time controls, halftime, timeout durations/counts, and ABBA preference. Save to apply.
2. **Start match** – Hit *Start Match* to arm the score buttons and start the main timer. The “Additional time options” button unlocks (timeouts, halftime, stoppage) only once the match begins.
3. **Log points** – Use the team-specific “+ Add Score” buttons to select scorer/assist combos. The ABBA column fills automatically if enabled.
4. **Manage events** – Timeouts reduce the respective team’s totals and can be reassigned via the timeout editor pop-up. Halftime resets per-half timeout counts, launches the halftime break timer, and can be triggered manually or automatically when the configured score/clock thresholds are met. Game stoppage pauses timers until cleared.
5. **Edit or delete** – Every row has a gear icon. Score rows allow scorer/assist edits or deletion; timeout rows permit team reassignment; halftime rows allow removal.
6. **Export** – Press *Submit*. The app validates that both teams are defined and at least one log exists, then:
   - Downloads a CSV containing the base columns plus any extra fields (e.g., `Type`, `TeamLetter`, `HalftimeReason`, `scoreID`).
   - Sends the same data to Google Sheets when `SUBMIT_URL` is configured, showing success/error toasts and a loading indicator.
   - Resets scores, timers, timeout counters, stoppage state, and clears cached logs for the next game, while keeping rosters and configuration intact.

---

## Data shape

- **GameID** – `"<Team A> vs <Team B>"`, generated from the current dropdown selections.
- **Base columns** – `GameID`, `Time`, `Event`, `Team`, `Score`, `Assist`.
- **Automatic extras** – Any additional log keys (e.g., `Type`, `EventType`, `TeamLetter`, `HalftimeReason`, `abba`) are appended to the header the first time they appear. Both CSV and Sheets uploads include every column to keep downstream tooling consistent.
- **Sheet tabs** – Name format `"<GameID>, <Locale Date>"`, sanitized to <95 chars to satisfy Apps Script insert rules.

---

## Configuration & theming

- **Branding** – Update CSS variables in `styles.css` (`--color-brand`, `--color-bg-main`, etc.) and replace `logo.png`/`page_icon.png`.
- **Timers** – Change `CONFIG.DEFAULT_TIMER_MINUTES`, `CONFIG.HALFTIME_SCORE_TARGET`, and the timeout duration defaults to match your competition rules. Users can still override these per match in the setup modal.
- **Roster feeds** – `ApiManager.fetchTeams` autodetects CSV vs JSON. Responses are cached in `localStorage` for 24 hours to survive poor connectivity; clearing browser storage forces a refetch.
- **Advanced logging** – Extend `ScorekeeperApp.createLogObject` or `recordSpecialEvent` to add more metadata (spirit scores, observer notes, field numbers). The backend will create matching columns automatically on first submit.

---

## Development & troubleshooting

- Serve locally with any static file server (`python -m http.server 8000`) and open `http://localhost:8000` on desktop or mobile.
- DevTools → Application → Storage lets you inspect/clear `localStorage` keys (`scoreLogs`, `gameState`, timer state, roster cache).
- **Roster dropdowns empty** – Verify `CONFIG.API_URL` is reachable and returns valid CSV/JSON; if the prior fetch failed, the UI falls back to cached rosters and shows a console warning.
- **Google Sheets not updating** – Confirm `SUBMIT_URL` points to the `/exec` deployment, `function doPost.ts` has the correct `SHEET_ID`, and the deployment was refreshed after editing.
- **Only CSV downloads** – Expected when `SUBMIT_URL` is blank; the toast explicitly states that only local export occurred.
- **Timer refuses to start** – Active game stoppage or a reached score cap (15) blocks timer toggles and add-score buttons until resolved.

---

## License

**CC0 1.0 Universal (Public Domain Dedication)** – use, modify, and redistribute without restriction. Full text: [https://creativecommons.org/publicdomain/zero/1.0/](https://creativecommons.org/publicdomain/zero/1.0/)
