function doPost(e) {
  try {
    // Parse the received data
    const data = JSON.parse(e.postData.contents);
    
    // Extract GameID and Date for the sheet title
    const gameID = data.GameID || 'Game';
    const date = data.Date || new Date().toLocaleDateString();
    const sheetTitle = `${gameID}, ${date}`;
    
    // Open the spreadsheet or create if it doesn't exist
    const ss = SpreadsheetApp.openById('LINK_TO_YOUR_SPREADSHEET'); // Replace with your Spreadsheet ID
    
    // Add a new sheet with the specified title
    let sheet;
    try {
      sheet = ss.insertSheet(sheetTitle);
    } catch (err) {
      // If the sheet already exists, append a number to the title
      sheet = ss.insertSheet(`${sheetTitle} (${new Date().getTime()})`);
    }
    
    const logs = Array.isArray(data.logs) ? data.logs : [];

    // Build headers based on expected structure plus any additional fields
    const baseColumns = ['GameID', 'Time', 'Event', 'Team', 'Score', 'Assist'];
    const extraColumns = [];
    logs.forEach((log) => {
      if (!log || typeof log !== 'object') return;
      Object.keys(log).forEach((key) => {
        if (baseColumns.indexOf(key) === -1 && extraColumns.indexOf(key) === -1) {
          extraColumns.push(key);
        }
      });
    });
    const headers = baseColumns.concat(extraColumns);
    sheet.appendRow(headers);

    // Append the data rows
    logs.forEach(log => {
      const row = headers.map((key) => {
        const value = log && typeof log === 'object' ? log[key] : '';
        return value === undefined || value === null ? '' : value;
      });
      sheet.appendRow(row);
    });
    
    // Return a success response
    return ContentService.createTextOutput(JSON.stringify({ status: 'Success' }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // Log the error for debugging
    Logger.log('Error processing request: ' + error.message);

    // Return an error response
    return ContentService.createTextOutput(JSON.stringify({ status: 'Error', message: error.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
