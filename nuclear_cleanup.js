const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function clearAndAnalyze() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];
  const rows = await mainSheet.getRows();
  
  // 1. 強力去重：讀取所有資料並過濾掉重複項
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows) {
    const data = { date: row.get('日期'), item: row.get('項目'), amount: row.get('金額'), note: row.get('備註') };
    const id = JSON.stringify(data);
    if (!seen.has(id)) {
      uniqueRows.push(data);
      seen.add(id);
    }
  }

  // 2. 重寫「記帳本」確保乾淨
  await mainSheet.clearRows();
  await mainSheet.addRows(uniqueRows.map(r => ({ '日期': r.date, '項目': r.item, '金額': r.amount, '備註': r.note })));

  // 3. 自動生成「分析報表」的總結數據（方便 Spreadsheet 自動繪圖預留）
  const reportSheet = doc.sheetsByTitle['分析報表'];
  await reportSheet.clearRows();
  const stats = {};
  uniqueRows.forEach(r => {
    const m = (r.date || '').substring(0, 7);
    if (!stats[m]) stats[m] = {};
    const cat = r.item.includes('紅包') ? '社交' : (r.item.includes('餐') ? '飲食' : '其他');
    stats[m][cat] = (stats[m][cat] || 0) + parseFloat(r.amount || 0);
  });

  for (const [m, cats] of Object.entries(stats)) {
    for (const [cat, val] of Object.entries(cats)) {
      await reportSheet.addRow({ '月份': m, '類別': cat, '總金額': val });
    }
  }
  console.log('原子級清理完成，數據已精簡！');
}
clearAndAnalyze().catch(console.error);
