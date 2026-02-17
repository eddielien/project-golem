const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function write() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['分析報表'] || doc.sheetsByIndex[1];
  await sheet.loadCells('A1:G2');
  
  // 強制寫入絕對座標
  sheet.getCellByA1('E1').value = '開始日期';
  sheet.getCellByA1('F1').value = '結束日期';
  sheet.getCellByA1('E2').value = '2026-02-01';
  sheet.getCellByA1('F2').value = '2026-02-28';
  sheet.getCellByA1('G1').value = '狀態：修復中';

  await sheet.saveUpdatedCells();
  console.log('單格強制寫入完成！');
}
write().catch(console.error);
