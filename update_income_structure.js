const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function update() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];
  const rows = await mainSheet.getRows();
  const currentData = rows.map(row => ({
    '日期': row.get('日期'),
    '項目': row.get('項目'),
    '收支': '支出',
    '金額': row.get('金額'),
    '類別': row.get('類別'),
    '備註': row.get('備註')
  }));

  await mainSheet.clear();
  await mainSheet.setHeaderRow(['日期', '項目', '收支', '金額', '類別', '備註']);
  await mainSheet.addRows(currentData);
  console.log('已新增「收支」欄位，方便區分收入與支出！');
}
update().catch(console.error);
