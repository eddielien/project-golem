const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function fix() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];
  const rows = await mainSheet.getRows();
  
  // 尋找並刪除重複的那一包 86000
  let foundOne = false;
  for (const row of rows) {
    if (row.get('項目') === '紅包' && row.get('金額') === '86000') {
      if (!foundOne) {
        foundOne = true; // 保留第一包
      } else {
        await row.delete(); // 刪除多出來的那包
      }
    }
  }

  // 更新分析報表
  const reportSheet = doc.sheetsByTitle['分析報表'];
  await reportSheet.clearRows();
  await reportSheet.addRows([
    { '月份': '2026-02', '類別': '社交禮金', '總金額': 86000 },
    { '月份': '2026-02', '類別': '飲食/超市', '總金額': 7511 },
    { '月份': '2026-02', '類別': '其他', '總金額': 1222 }
  ]);
  console.log('紅包溢寫修正完成！');
}
fix().catch(console.error);
