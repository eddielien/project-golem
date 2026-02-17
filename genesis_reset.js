const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function reset() {
  await doc.loadInfo();
  
  // 1. 準備唯一的正確數據
  const correctData = [
    { '日期': '2026-02-14', '項目': 'Costco/全聯/午餐', '金額': '7511', '備註': '與老婆大人' },
    { '日期': '2026-02-14', '項目': '停車', '金額': '255', '備註': '' },
    { '日期': '2026-02-15', '項目': '雜項', '金額': '492', '備註': '' },
    { '日期': '2026-02-16', '項目': '紅包', '金額': '86000', '備註': '' },
    { '日期': '2026-02-16', '項目': '紅包', '金額': '86000', '備註': '另一包' },
    { '日期': '2026-02-16', '項目': '刮刮樂', '金額': '450', '備註': '' },
    { '日期': '2026-02-16', '項目': '飲料', '金額': '25', '備註': '' }
  ];

  // 2. 刪除舊分頁並重建
  const titles = ['記帳本', '分析報表'];
  for (const title of titles) {
    const sheet = doc.sheetsByTitle[title];
    if (sheet) await sheet.delete();
  }

  const mainSheet = await doc.addSheet({ title: '記帳本', headerValues: ['日期', '項目', '金額', '備註'] });
  await mainSheet.addRows(correctData);

  const reportSheet = await doc.addSheet({ title: '分析報表', headerValues: ['月份', '類別', '總金額'] });
  const stats = { '2026-02': { '社交禮金': 172000, '飲食/超市': 7511, '其他': 1222 } };
  for (const [m, cats] of Object.entries(stats)) {
    for (const [cat, val] of Object.entries(cats)) {
      await reportSheet.addRow({ '月份': m, '類別': cat, '總金額': val });
    }
  }
  console.log('創世重置完成，一切從零開始！');
}
reset().catch(console.error);
