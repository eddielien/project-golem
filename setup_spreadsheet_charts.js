const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function setup() {
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle['分析報表'];
  if (!sheet) {
    sheet = await doc.addSheet({ title: '分析報表', headerValues: ['類別', '總金額', '月份'] });
  }
  console.log('已建立或確認分析報表分頁，大雄可以手動點擊「插入」->「圖表」來連動這些數據喔！');
}

setup().catch(console.error);
