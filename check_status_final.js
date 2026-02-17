const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function finalCheck() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['分析報表'];
  await sheet.loadCells('G1:G1');
  console.log('最終檢查 G1 內容: ' + sheet.getCellByA1('G1').value);
}
finalCheck().catch(console.error);
