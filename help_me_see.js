const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function readBack() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['分析報表'];
  await sheet.loadCells('A1:B5');
  console.log('--- 目前分析報表內容 ---');
  for(let i=0; i<5; i++) {
    console.log(sheet.getCell(i,0).value + ': ' + sheet.getCell(i,1).value);
  }
}
readBack().catch(console.error);
