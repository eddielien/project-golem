const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function final() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];
  const reportSheet = doc.sheetsByTitle['分析報表'];
  const rows = await mainSheet.getRows();
  
  // 讀取目前的日期區間條件
  await reportSheet.loadCells('E2:F2');
  const start = new Date(reportSheet.getCellByA1('E2').value);
  const end = new Date(reportSheet.getCellByA1('F2').value);

  const results = { '飲食/超市': 0, '社交禮金': 0, '交通': 0, '其他': 0 };
  
  rows.forEach(r => {
    const d = new Date(r.get('日期'));
    const amt = parseFloat(r.get('金額') || 0);
    const cat = r.get('類別');
    const type = r.get('收支');
    if (type === '支出' && d >= start && d <= end) {
      if (results.hasOwnProperty(cat)) results[cat] += amt;
      else results['其他'] += amt;
    }
  });

  await reportSheet.loadCells('A2:B5');
  const cats = Object.keys(results);
  for (let i = 0; i < cats.length; i++) {
    reportSheet.getCell(i+1, 0).value = cats[i];
    reportSheet.getCell(i+1, 1).value = results[cats[i]];
  }
  await reportSheet.saveUpdatedCells();
  console.log('數據重算並填入完成。');
}
final().catch(console.error);
