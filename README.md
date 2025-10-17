# Ultimate Field-Side Score Sheet (Brand-Agnostic)

A lightweight, mobile-first web application for recording Ultimate matches in real time.
The app runs entirely in the browser and posts structured match logs to Google Sheets via a minimal Google Apps Script backend.
Branding (logo, colors, typography) is fully configurable for any league, club, school, or tournament.

---

## 1) Features

* **Match setup**: select Team A/B and manage rosters; scorer/assist selection is optimized for quick input.
* **Dual timers**: primary game clock (e.g., `100:00`) and a secondary timer (e.g., `75s`) with start/pause/reset controls.
* **Event logging**: goals, assists, halftime, timeouts (with limits), and stoppages; edit/delete for corrections.
* **Submission**: one-click upload of all events to Google Sheets; visual progress and navigation-away protection.
* **Mixed formats**: optional ABBA indicator (M/F/None) for mixed-division workflows.
* **Responsive UI**: large targets and high contrast for phone and small tablet use on the sideline.

---

## 2) Architecture & Data Flow

**Frontend**: Static HTML/CSS/JavaScript single-page app (`index.html`, `styles.css`, `scripts.js`).
**Backend**: Google Apps Script web app (`doPost.ts` or `Code.gs`) that writes to Google Sheets.

Typical event row:

```
GameID, Timestamp, Event, Team, Scorer, Assist, Notes, ...
```

Submit flow:

1. Browser aggregates the event log and POSTs JSON to the Apps Script **Web App URL**.
2. Backend opens the target spreadsheet by **Sheet ID**, creates/locates a tab named `"<GameID>, <Date>"`, ensures headers exist (adds new fields as needed), then appends rows.
3. Backend returns a JSON success/failure response.

---

## 3) Prerequisites

* A Google account with access to Google Sheets and Apps Script.
* Any static hosting (e.g., GitHub Pages, Netlify) or a local static server for development.
* A modern mobile browser.

---

## 4) Setup

### 4.1 Backend (Apps Script)

1. Create or open the Google Sheet that will store logs; copy its **Sheet ID** from the URL.
2. Create a new Apps Script project (`script.new`) and add `doPost.ts` (or `Code.gs`).
3. Set your Sheet ID constant:

```ts
// doPost.ts
const SHEET_ID = 'YOUR_SHEET_ID_HERE';
```

4. Deploy the script as a **Web app**

   * Execute as: **Me**
   * Who has access: **Anyone with the link**
   * Copy the generated **Web App URL**.

### 4.2 Frontend

1. Host `index.html`, `styles.css`, and `scripts.js`.
2. In `scripts.js`, set the backend endpoint:

```js
// scripts.js
const WEB_APP_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

3. Open the hosted page on a phone/tablet and perform a test submission.

---

## 5) Usage

1. Open **Match Setup**, select teams, and confirm rosters.
2. Start the primary timer; use the secondary timer as needed.
3. Log goals with scorer/assist, halftime, timeouts, and stoppages.
4. Review/edit entries.
5. Click **Submit** to write the log to the Google Sheet (a new tab named `"<GameID>, <Date>"` will be created on first submit).

---

## 6) Data Model

Minimum columns are:

| Column      | Description                                               |
| ----------- | --------------------------------------------------------- |
| `GameID`    | Unique identifier for the match                           |
| `Timestamp` | Wall-clock or game-clock time for the event               |
| `Event`     | `goal`, `assist`, `timeout`, `halftime`, `stoppage`, etc. |
| `Team`      | Team associated with the event                            |
| `Scorer`    | Player name (if applicable)                               |
| `Assist`    | Player name (if applicable)                               |
| `Notes`     | Free-text, optional                                       |

> The backend automatically adds new columns if your payload contains additional keys (e.g., `spiritScore`, `observerNotes`, `abba`).

---

## 7) Theming & Configuration

* Replace the logo/icon assets and adjust CSS variables in `styles.css` to match your organization’s brand.
* Rosters can be captured via free-text, or you may extend the app to pull JSON/CSV/Sheets rosters.
* Time limits, default durations, and event types are configurable in `scripts.js`.

---

## 8) Project Structure

```
.
├─ index.html
├─ styles.css
├─ scripts.js
├─ assets/
│  ├─ logo.png
│  └─ icon.png
└─ backend/
   └─ doPost.ts   // or Code.gs
```

---

## 9) Development

* Serve locally with any static server, e.g.:

  * `python -m http.server 8000`
* Update `WEB_APP_URL` to point at your deployed Apps Script during testing.
* Keep dependencies minimal to ensure fast load and reliable sideline usage.

---

## 10) Security & Privacy

* The Web App should run **as you** and be accessible to **Anyone with the link** to allow field devices to submit results.
* No credentials are stored in the client. The backend only appends to the designated Sheet.
* If additional access controls are required, restrict the Apps Script and implement server-side validation.

---

## 11) Troubleshooting

* **Submissions fail**: confirm `WEB_APP_URL` and that the deployment is the latest version.
* **No new tab in Sheet**: verify `SHEET_ID` and script permissions.
* **CORS/browser errors**: ensure you’re calling the Apps Script “/exec” URL, not “/dev”.

---

## 12) Roadmap (non-binding)

* Offline queue with automatic retry
* Per-player statistics summary
* CSV export in addition to Google Sheets
* Admin lock and audit trail
* Multi-game/tournament workflows

---

## 13) Contributing

Issues and pull requests are welcome. Please keep the UI concise and touch-friendly, and avoid adding heavy dependencies.

---

## 14) License

**CC0 1.0 Universal (Public Domain Dedication).**

To the extent possible under law, the authors have dedicated this work to the public domain.
You may copy, modify, distribute, and use the work, including for commercial purposes, without asking permission.

A copy of the full text is available at: [https://creativecommons.org/publicdomain/zero/1.0/](https://creativecommons.org/publicdomain/zero/1.0/)
