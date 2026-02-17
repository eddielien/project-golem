const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function calculate() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];
  const reportSheet = doc.sheetsByTitle['分析報表'];
  
  // 1. 取得篩選日期
  await reportSheet.loadCells('E2:F2');
  const startDate = new Date(reportSheet.getCellByA1('E2').value);
  const endDate = new Date(reportSheet.getCellByA1('F2').value);

  // 2. 抓取所有資料並在後端計算 (不靠 Excel 公式)
  const rows = await mainSheet.getRows();
  const stats = { '飲食/超市': 0, '社交禮金': 0, '交通': 0, '其他': 0 };
  
  rows.forEach(row => {
    const rowDate = new Date(row.get('日期'));
    const type = row.get('收支');
    const cat = row.get('類別');
    const amt = parseFloat(row.get('金額') || 0);
    
    if (type === '支出' && rowDate >= startDate && rowDate <= endDate) {
      if (stats.hasOwnProperty(cat)) stats[cat] += amt;
      else stats['其他'] += amt;
    }
  });

  // 3. 將計算好的「純數字」填入報表，不留任何公式
  await reportSheet.loadCells('A2:B5');
  const cats = Object.keys(stats);
  for (let i = 0; i < cats.length; i++) {
    reportSheet.getCell(i + 1, 0).value = cats[i];
    reportSheet.getCell(i + 1, 1).value = stats[cats[i]];
    reportSheet.getCell(i + 1, 0).formula = null; // 確保沒有公式殘留
  }

  await reportSheet.loadCells('G1:G1');
  reportSheet.getCellByA1('G1').value = '狀態：小叮噹代算完成 (無公式) 🧮';
  await reportSheet.saveUpdatedCells();
  console.log('手動計算完成，已寫入純數值。');
}
calculate().catch(console.error);
