const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);
async function update() {
  await doc.loadInfo();
  const reportSheet = doc.sheetsByTitle['分析報表'];
  await reportSheet.clearRows();
  await reportSheet.addRows([
    { '類別': '社交禮金', '總金額': 172000, '月份': '2026-02' },
    { '類別': '飲食', '總金額': 15022, '月份': '2026-02' },
    { '類別': '交通', '總金額': 510, '月份': '2026-02' },
    { '類別': '娛樂/投資(?)', '總金額': 900, '月份': '2026-02' },
    { '類別': '其他', '總金額': 1034, '月份': '2026-02' }
  ]);
  console.log('2 月份數據已填入「分析報表」分頁。');
}
update().catch(console.error);
