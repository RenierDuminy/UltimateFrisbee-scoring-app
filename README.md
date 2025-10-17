# IDL-scoring

ChatGPT o1 genereated on 25/01/2025

Below is a comprehensive review of the HTML, CSS, and JavaScript in the provided code. It will help anyone looking at it for the first time understand how it works, how data is stored, and how to make common modifications. Each section has been broken down into smaller pieces for clarity.

---

## 1. Overall Purpose

This page is a **score sheet** for an Ultimate Frisbee game. It allows you to:

1. Select two teams (Team A and Team B).
2. Automatically list the players on each team.
3. Log scores (who scored, who assisted) for each team.
4. Display the cumulative score as points are added.
5. Store the score data in session storage within the browser.
6. Optionally submit the accumulated data to a Google Sheets endpoint for record-keeping.

---

## 2. HTML Structure

### `<!DOCTYPE html>` and `<html>` Tag
- Defines the document type and starts the HTML.

### `<head>` Section
- Contains the metadata (`<meta>` tags) and the internal CSS (`<style>` tag).
- The `title` of the page is set to "Score Sheet".

### `<body>` Section
This is where all visible elements and interactive features are placed:
1. **Container (`.form-container`)**  
   - A single container that wraps most of the form content, including the team selection, scoring table, and submission button.
   
2. **Logo and Title (`.logo-title-container`)**  
   - Displays an image (`.logo`) and a heading (`<h2>Stellenbosch Ultimate Frisbee - IDL 3.0</h2>`).
   
3. **Form (`<form id="scoreForm">`)**  
   - Not actually submitting via the standard HTML submit, but rather controlled by JavaScript.

   Inside this form:
   - **Description Table**: For selecting Team A, Team B, and displaying the current time.  
   - **Scoring Table**: Shows columns for score/assist from both teams, plus a running total.  
   - **Add Score Buttons**: Two buttons, one for Team A and another for Team B, that open a popup to add a new score entry.  
   - **Team List Section**: Two textareas showing the players for Team A and Team B.  
   - **Submit Section**: A “Submit” button that, via JavaScript, sends data to a Google Sheets web app. Includes a loading animation next to it (`id="loadingAnimation"`).

4. **Success Message (`#successMessage`)**  
   - Hidden by default (`display: none;`). Appears once data has been successfully sent to Google Sheets.

5. **Logged Data Container (`#loggedDataContainer`)**  
   - Also hidden by default. When shown, it can display a table of the data that was just logged.  
   - This can be useful for debugging or verifying that everything was recorded correctly.

6. **Popup and Overlay**  
   - A hidden overlay (`<div class="overlay" id="overlay">`) that darkens the background when adding a new score.  
   - The popup itself (`<div class="popup" id="scorePopup">`) with a dropdown for selecting the scorer and assist player.

7. **`<script>` Tag**  
   - The entire JavaScript logic for handling team data, adding scores, storing logs, and submission is here.

---

## 3. CSS Styles (Within `<style>` in the `<head>`)

1. **Page Layout**  
   - `body` has a neutral background (`#707070`) with some padding.  
   - `.form-container` is the main white box in the center, with padding, border, and drop-shadow.

2. **Logo and Title**  
   - `.logo-title-container` uses `display: flex; align-items: center; justify-content: center;` to horizontally center the logo and the title.  
   - `.logo` is given a fixed height (80px).

3. **Tables**  
   - `table { width: 100%; border-collapse: collapse; }` ensures the table uses the full width and has no double borders.  
   - `th, td` are styled with a border and padding.  
   - Table headings (`th`) have a background color (`#e1d4c8`) and text color (`#6b2c3e`).

4. **Form Controls**  
   - `select` elements have a background color, border, and padding.  
   - `textarea` elements have similar styling and are set to `overflow-y: hidden; resize: none;` to keep them from being manually resized.  
   - Buttons (`input[type="button"], .add-score`) have a purple background that darkens on hover, and are styled to look clickable.

5. **Popup and Overlay**  
   - `.overlay` is a full-screen transparent overlay.  
   - `.popup` is an absolutely positioned box centered on the screen.  
   - Both `.overlay` and `.popup` are hidden by default (`display: none;`).

6. **Responsive**  
   - The `@media (max-width: 600px)` block re-stacks elements for smaller screens, ensuring a mobile-friendly layout.

---

## 4. JavaScript Explanation (Within `<script>` in the `<body>`)

### Variables and DOM Content Loaded
```js
let teamAScore = 0;
let teamBScore = 0;
let teamsData = [];
let loadingInterval;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById('time').value = new Date().toLocaleString();
  fetchTeams();
});
```
- **`teamAScore` and `teamBScore`** track the cumulative score.  
- **`teamsData`** will hold the team/player information once fetched.  
- **`loadingInterval`** is used for the “Loading…” animation.

- **`DOMContentLoaded`** event fires once the HTML is fully parsed. Inside its callback, we set the current time in the `#time` field and call `fetchTeams()` to load or fetch team data.

### Fetching Team Data
```js
async function fetchTeams() {
  const storedTeams = sessionStorage.getItem('teams');
  if (storedTeams) {
    // Use cached data
    const teams = JSON.parse(storedTeams);
    teamsData = teams;
    populateTeamOptions(teams);
  } else {
    // Fetch from the server if not in sessionStorage
    try {
      const response = await fetch('https://script.google.com/macros/s/AKfycbzcg2i_dSDPwpgs5aHZz6glU4K0z2K6A3CfNxrinzDDff9rYQ6uSA35Btp2hUebFU4/exec');
      const teams = await response.json();
      teamsData = teams;
      sessionStorage.setItem('teams', JSON.stringify(teams));
      populateTeamOptions(teams);
    } catch (error) {
      console.error('Error fetching team names:', error);
    }
  }
}
```
- Checks if team data is already in `sessionStorage`.  
- If not, it **fetches** from a given Google Apps Script URL, **parses** the JSON, and **stores** it in `sessionStorage` so it doesn't have to be fetched every time.

> **Modifying**: Change the URL if you have a different data source. Make sure to handle errors carefully.

### Populating the Team Selection
```js
function populateTeamOptions(teams) {
  const teamASelect = document.getElementById('teamA');
  const teamBSelect = document.getElementById('teamB');
  const uniqueTeams = [...new Set(teams.map(item => item.teamA))];

  const fragmentA = document.createDocumentFragment();
  const fragmentB = document.createDocumentFragment();

  uniqueTeams.forEach(team => {
    const optionA = document.createElement('option');
    optionA.value = team;
    optionA.textContent = team;
    fragmentA.appendChild(optionA);

    const optionB = document.createElement('option');
    optionB.value = team;
    optionB.textContent = team;
    fragmentB.appendChild(optionB);
  });

  teamASelect.appendChild(fragmentA);
  teamBSelect.appendChild(fragmentB);

  teamASelect.addEventListener('change', () => updatePlayerList('teamA'));
  teamBSelect.addEventListener('change', () => updatePlayerList('teamB'));
}
```
- Finds unique team names by mapping each record’s `teamA` property and using a `Set`.  
- Creates `<option>` elements for each unique team, appending to the dropdowns for Team A and Team B.

> **Modifying**: If your data format changes (e.g., the property holding the team name is not `teamA`), you will need to update the code accordingly.

### Updating the Player List
```js
function updatePlayerList(team) {
  const selectedTeam = document.getElementById(team).value;
  const playerListElement = document.getElementById(`${team}List`);

  // Filter players belonging to the selected team
  const players = teamsData.filter(item => item.teamA === selectedTeam)
                           .map(item => item.teamB)
                           .sort();

  playerListElement.value = players.join('\n');

  // Auto-resize the textarea
  playerListElement.style.height = 'auto';
  playerListElement.style.height = (playerListElement.scrollHeight) + 'px';
}
```
- When you pick a team from the dropdown, `updatePlayerList` finds the corresponding players from `teamsData` (where `teamA` is the selected team).  
- It then puts each player’s name in the Team A or Team B textarea.  
- The `.sort()` call arranges the player names alphabetically.  
- Resizes the `<textarea>` to fit the content automatically.

> **Modifying**: If the player data is stored differently, you need to adapt the filter logic (`item => item.teamA === selectedTeam`).

### Opening the Score Popup
```js
function openPopup(team) {
  document.getElementById('overlay').style.display = 'block';
  document.getElementById('scorePopup').style.display = 'block';

  const scorerDropdown = document.getElementById('scorer');
  const assistDropdown = document.getElementById('assist');

  scorerDropdown.innerHTML = '<option value="">Select Scorer</option>';
  assistDropdown.innerHTML = '<option value="">Select Assist</option>';

  // Get players for the chosen team
  const playersText = document.getElementById(team === 'A' ? 'teamAList' : 'teamBList').value;
  const players = playersText ? playersText.split('\n') : [];

  // Populate dropdowns
  const fragmentScorer = document.createDocumentFragment();
  const fragmentAssist = document.createDocumentFragment();

  players.forEach(player => {
    const optionScorer = document.createElement('option');
    optionScorer.value = player;
    optionScorer.textContent = player;
    fragmentScorer.appendChild(optionScorer);

    const optionAssist = document.createElement('option');
    optionAssist.value = player;
    optionAssist.textContent = player;
    fragmentAssist.appendChild(optionAssist);
  });

  scorerDropdown.appendChild(fragmentScorer);
  assistDropdown.appendChild(fragmentAssist);

  // Store which team we’re adding the score for in the popup’s dataset
  document.getElementById('scorePopup').dataset.team = team;
}
```
- Shows the popup by setting its `display` from `none` to `block`.  
- Resets the dropdowns (Scorer/Assist) and then populates them with players from the chosen team’s textarea.  
- The `team` parameter is stored in the popup’s dataset, so the code knows if the popup was opened for Team A or Team B.

> **Modifying**: You can add additional fields to the popup if needed, e.g., type of score, point in the game, etc.

### Adding a Score
```js
function addScore() {
  const team = document.getElementById('scorePopup').dataset.team;
  const scorer = document.getElementById('scorer').value;
  const assist = document.getElementById('assist').value;

  if (scorer && assist) {
    const scoringTableBody = document.getElementById('scoringTableBody');
    const row = document.createElement('tr');

    if (team === 'A') {
      row.innerHTML = `
        <td>${scorer}</td>
        <td>${assist}</td>
        <td class="total"></td>
        <td></td>
        <td></td>
      `;
    } else {
      row.innerHTML = `
        <td></td>
        <td></td>
        <td class="total"></td>
        <td>${scorer}</td>
        <td>${assist}</td>
      `;
    }
    scoringTableBody.appendChild(row);

    // Update cumulative score
    updateScore(team);

    // Update total cell (like "1:0", "2:1", etc.)
    const totalCell = row.querySelector('.total');
    totalCell.textContent = `${teamAScore}:${teamBScore}`;

    // Log data in sessionStorage
    logScoreData(team, scorer, assist);

    // Close the popup
    closePopup();
  } else {
    alert('Please select both scorer and assist.');
  }
}
```
- Reads the stored `team` (“A” or “B”) from the popup’s dataset.  
- If valid scorer and assist are chosen, creates a new row in the scoring table. For Team A, the Score A and Assist A columns get values; for Team B, the Score B and Assist B columns get values.  
- Calls `updateScore(team)` to increment the appropriate team’s tally.  
- Calls `logScoreData(team, scorer, assist)` to store each scoring event in the browser’s session storage.  
- Finally, closes the popup.

### Logging Score Data
```js
function logScoreData(teamLetter, scorer, assist) {
  let scoreLogs = JSON.parse(sessionStorage.getItem('scoreLogs')) || [];

  const teamAName = document.getElementById('teamA').value;
  const teamBName = document.getElementById('teamB').value;

  if (!teamAName || !teamBName) {
    alert('Please select both Team A and Team B before adding scores.');
    return;
  }

  const gameID = `${teamAName} vs ${teamBName}`;
  const timeOfLogging = new Date().toLocaleString();
  const teamName = teamLetter === 'A' ? teamAName : teamBName;

  const logEntry = {
    GameID: gameID,
    Time: timeOfLogging,
    Team: teamName,
    Score: scorer,
    Assist: assist
  };

  scoreLogs.push(logEntry);
  sessionStorage.setItem('scoreLogs', JSON.stringify(scoreLogs));
}
```
- Checks if Team A and B are selected.  
- Creates a `gameID` as `TeamAName vs TeamBName`.  
- Creates a `logEntry` object containing the who/when/what of the score event.  
- Appends this entry to an array called `scoreLogs` and saves it in sessionStorage under `"scoreLogs"`.

> **Modifying**: If you want to store more details (like score type, timestamps, etc.), add more fields to `logEntry`.

### Updating the Cumulative Score
```js
function updateScore(team) {
  if (team === 'A') {
    teamAScore += 1;
  } else if (team === 'B') {
    teamBScore += 1;
  }
}
```
- Simply increments the correct variable by 1 whenever a goal is scored.

### Closing the Popup
```js
function closePopup() {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('scorePopup').style.display = 'none';
}
```
- Hides the popup and the overlay.

### Loading Animation
```js
function startLoadingAnimation() {
  const loadingAnimation = document.getElementById('loadingAnimation');
  const dots = document.getElementById('dots');
  let dotCount = 0;

  loadingAnimation.style.display = 'block';
  loadingInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dots.textContent = '.'.repeat(dotCount);
  }, 500);
}

function stopLoadingAnimation() {
  const loadingAnimation = document.getElementById('loadingAnimation');
  const dots = document.getElementById('dots');
  clearInterval(loadingInterval);
  dots.textContent = '';
  loadingAnimation.style.display = 'none';
}
```
- Animates an ellipsis (“Loading.”, “Loading..”, “Loading...”, etc.) while data is being sent to Google Sheets.  
- Call `startLoadingAnimation()` before making the request and `stopLoadingAnimation()` once it’s done or fails.

### Submitting Score to Google Sheets
```js
async function submitScore() {
  const scoreLogs = JSON.parse(sessionStorage.getItem('scoreLogs')) || [];

  if (scoreLogs.length === 0) {
    alert('No scores have been logged.');
    return;
  }

  const teamAName = document.getElementById('teamA').value;
  const teamBName = document.getElementById('teamB').value;
  const gameID = `${teamAName} vs ${teamBName}`;
  const date = new Date().toLocaleDateString();

  const dataToSend = {
    GameID: gameID,
    Date: date,
    logs: scoreLogs
  };

  try {
    startLoadingAnimation();

    const response = await fetch('YOUR_WEB_APP_URL', {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dataToSend)
    });

    stopLoadingAnimation();

    document.getElementById('successMessage').textContent = 'Data has been successfully exported to Google Sheets!';
    document.getElementById('successMessage').style.display = 'block';

    // Clear the logs
    sessionStorage.removeItem('scoreLogs');
    // Optionally reset or reload the page

  } catch (error) {
    stopLoadingAnimation();
    alert('Error exporting data: ' + error.message);
  }
}
```
- Gathers all logs from sessionStorage (`scoreLogs`).  
- Builds an object (`dataToSend`) including a `GameID`, the current date, and the array of logs.  
- Sends a POST request to a Google Apps Script endpoint (set as `'YOUR_WEB_APP_URL'`).  
- The request uses `mode: 'no-cors'`, so you cannot read the response directly, but this avoids CORS restrictions.  
- On success, it shows the success message and clears the stored logs.  
- On error, it alerts you.

> **Modifying**:  
> - Replace `'YOUR_WEB_APP_URL'` with your actual Google Apps Script or server endpoint.  
> - Consider using `mode: 'cors'` if your endpoint is configured to allow cross-origin requests, so you can handle response data.  
> - Add any additional data you need in `dataToSend`.

---

## 5. How to Modify the Code

1. **Change the Data Source (Team List)**
   - Update the URL in `fetchTeams()` if your data comes from somewhere else.
   - Update how `teamsData` is parsed if the JSON structure is different.

2. **Change the Google Sheets Endpoint**
   - In `submitScore()`, replace `'YOUR_WEB_APP_URL'` with your own endpoint.  
   - Adjust the `headers` or `mode` if needed.

3. **Add More Fields to the Score**
   - In the popup, add additional inputs (e.g., a radio button for “point type”) and incorporate them in `addScore()` and `logScoreData()`.

4. **Handle CORS Properly**
   - If you want to handle the server’s response, you’ll need to configure your Google Apps Script to allow cross-origin requests and remove `'no-cors'`. Then handle the `response` from `fetch()` accordingly.

5. **Session Storage vs. Local Storage**
   - Currently, data is stored in session storage (`sessionStorage`). That means data is lost when the browser tab is closed.  
   - If you prefer to persist data even after the tab or browser is closed, use `localStorage`.

6. **Styling / Theming**
   - All the CSS is inside one `<style>` block in the `<head>`. You can move it to an external `.css` file.  
   - Adjust colors, fonts, or layout by modifying the relevant `.class` or HTML element CSS rules.

---

## 6. Key Takeaways

- **Session Storage** is used to temporarily store team/player data and the scoring logs.  
- **Fetching Data**: The code first tries session storage for team data and, if empty, fetches from a remote server.  
- **Popups** are used for score entry to prevent clutter on the main interface.  
- **Submit Logic**: The final score logs are posted to an external endpoint in JSON format.  
- **Design**: The code includes a straightforward responsive design that stacks elements on smaller screens.

This architecture makes it **flexible** to adapt to different data sources, Google Sheets endpoints, or entirely different scoring workflows. By following the function names and references, you can trace data from the moment a user selects a team, through adding scores, storing them locally, and finally submitting them to your server or Sheets script.