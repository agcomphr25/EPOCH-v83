import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export interface TrainingMatrixRow {
  employeeName: string;
  [trainingName: string]: string | undefined;
}

export async function listGoogleSheets() {
  const drive = await getGoogleDriveClient();
  
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name, modifiedTime, createdTime)',
    pageSize: 100,
    orderBy: 'modifiedTime desc'
  });

  return response.data.files || [];
}

export async function getSpreadsheetData(spreadsheetId: string, range?: string) {
  const sheets = await getUncachableGoogleSheetClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range || 'A:AZ',
  });

  return response.data.values || [];
}

export async function parseTrainingMatrixFromSheet(spreadsheetId: string, range?: string): Promise<TrainingMatrixRow[]> {
  const data = await getSpreadsheetData(spreadsheetId, range);
  
  if (data.length < 3) {
    throw new Error('Sheet does not have enough rows for training matrix format');
  }

  // Skip the first row (title), second row has training names
  const trainingHeaders = data[1].slice(1); // Skip first column (employee name column)
  const rows: TrainingMatrixRow[] = [];

  // Process employee rows (starting from row 3, index 2)
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || row[0].trim() === '') continue; // Skip empty employee names
    
    const employeeName = row[0].trim();
    const matrixRow: TrainingMatrixRow = { employeeName };
    
    // Map training completion dates
    for (let j = 0; j < trainingHeaders.length; j++) {
      const trainingName = trainingHeaders[j]?.trim();
      if (trainingName) {
        matrixRow[trainingName] = row[j + 1]?.trim() || '';
      }
    }
    
    rows.push(matrixRow);
  }

  return rows;
}
