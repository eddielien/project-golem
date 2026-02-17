const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function debug() {
  try {
    await doc.loadInfo();
    console.log('試算表標題:', doc.title);
    const reportSheet = doc.sheetsByTitle['分析報表'];
    if (!reportSheet) {
      console.log('找不到分析報表分頁！');
      return;
    }
    // 直接在第一行寫入測試數據
    await reportSheet.loadCells('A1:G2');
    reportSheet.getCellByA1('G1').value = '🚨 正在強制排除故障';
    reportSheet.getCellByA1('A2').formula = '=1+1'; 
    await reportSheet.saveUpdatedCells();
    console.log('測試寫入完成，請檢查 G1 是否出現 🚨');
  } catch (e) {
    console.error('連線錯誤:', e.message);
  }
}
debug();
