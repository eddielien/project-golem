const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function accessSpreadsheet() {
  try {
    await doc.loadInfo();
    console.log('✅ 成功連線到試算表：' + doc.title);
    const sheet = doc.sheetsByIndex[0];
    // 這裡預留寫入邏輯
  } catch (e) {
    console.error('❌ 連線失敗：', e.message);
  }
}
accessSpreadsheet();
