const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function fix() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['分析報表'];
  await sheet.clear();
  
  // 重新建立絕對正確的結構
  await sheet.setHeaderRow(['分析項目', '金額', '', '', '開始日期', '結束日期']);
  
  await sheet.loadCells('A1:F10');
  // 強制填入文字，避免序列號問題
  sheet.getCellByA1('E2').value = '2026-02-01';
  sheet.getCellByA1('F2').value = '2026-02-28';
  
  // 暫時用最穩定的文字列出類別
  const cats = ['飲食/超市', '社交禮金', '交通', '其他'];
  for (let i = 0; i < cats.length; i++) {
    sheet.getCell(i + 1, 0).value = cats[i];
    sheet.getCell(i + 1, 1).value = 0; // 先歸零，由下次計算填入
  }
  
  await sheet.saveUpdatedCells();
  console.log('錯位修復完成。');
}
fix().catch(console.error);
