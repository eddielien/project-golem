const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function finalTruth() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['🚀最終修復版報表'] || doc.sheetsByTitle['分析報表'];
  await sheet.loadCells('A1:G2');
  
  console.log('--- 機器人自我掃描報告 ---');
  console.log('分頁名稱:', sheet.title);
  console.log('G1 內容:', sheet.getCellByA1('G1').value);
  console.log('A2 公式:', sheet.getCellByA1('A2').formula);
  console.log('------------------------');
}
finalTruth().catch(console.error);
