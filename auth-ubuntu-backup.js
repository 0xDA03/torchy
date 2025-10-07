const fs = require('fs').promises;
const path = require('path');
const {google} = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/gmail.modify'];
const SERVICE_ACCOUNT_KEY_PATH = path.join(process.cwd(), 'credentials-ubuntu.json'); 

async function authorize() {
  // Load service account credentials from JSON key file
  const content = await fs.readFile(SERVICE_ACCOUNT_KEY_PATH);
  const credentials = JSON.parse(content);

  // Build authentication client directly from service account credentials
  const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      SCOPES
  );

  // Authorize our client
  await auth.authorize();

  return auth;
}

module.exports = { authorize };
