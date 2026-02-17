const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

function categorize(item, remark) {
  const text = (item + remark).toLowerCase();
  if (text.includes('紅包')) return '社交禮金';
  if (text.includes('餐') || text.includes('喝') || text.includes('食')) return '飲食';
  if (text.includes('停車') || text.includes('車')) return '交通';
  if (text.includes('彩券') || text.includes('刮刮樂')) return '娛樂/投資(?)';
  return '其他';
}

async function run() {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['記帳本'] || doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  
  const categoryStats = {}; // 總類別統計 (圓餅圖用)
  const monthlyStack = {};  // 每月類別統計 (長條圖用)

  rows.forEach(row => {
    const date = row.get('日期') || '';
    const item = row.get('項目') || '';
    const remark = row.get('備註') || '';
    const amount = parseFloat(row.get('金額')) || 0;
    const month = date.substring(0, 7);
    const cat = categorize(item, remark);

    if (month) {
      categoryStats[cat] = (categoryStats[cat] || 0) + amount;
      if (!monthlyStack[month]) monthlyStack[month] = {};
      monthlyStack[month][cat] = (monthlyStack[month][cat] || 0) + amount;
    }
  });

  console.log('--- 類別圓餅圖數據 ---');
  console.log(JSON.stringify(categoryStats, null, 2));
  console.log('--- 每月類別堆疊數據 ---');
  console.log(JSON.stringify(monthlyStack, null, 2));
}

run().catch(console.error);
