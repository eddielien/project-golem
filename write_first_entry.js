const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function writeToSheet() {
  try {
    await doc.loadInfo();
    console.log('✅ 成功連入試算表：' + doc.title);
    const sheet = doc.sheetsByIndex[0];
    await sheet.setHeaderRow(['日期', '項目', '金額', '備註']);
    console.log('✅ 已自動建立標題欄位！');
  } catch (e) {
    console.error('❌ 操作失敗：', e.message);
  }
}
writeToSheet();
