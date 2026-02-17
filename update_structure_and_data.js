const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');
const serviceAccountAuth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function update() {
  await doc.loadInfo();
  const mainSheet = doc.sheetsByTitle['記帳本'];

  // 1. 準備包含完整「備註」與「類別」的正確數據
  const enrichedData = [
    { '日期': '2026-02-14', '項目': 'Costco/全聯/午餐', '金額': '7511', '類別': '飲食/超市', '備註': '與老婆大人' },
    { '日期': '2026-02-14', '項目': '停車', '金額': '255', '類別': '交通', '備註': 'Costco 停車' },
    { '日期': '2026-02-15', '項目': '雜項', '金額': '492', '類別': '其他', '備註': '家用品購買' },
    { '日期': '2026-02-16', '項目': '紅包', '金額': '86000', '類別': '社交禮金', '備註': '過年紅包' },
    { '日期': '2026-02-16', '項目': '刮刮樂', '金額': '450', '類別': '娛樂/投資(?)', '備註': '初二試手氣' },
    { '日期': '2026-02-16', '項目': '飲料', '金額': '25', '類別': '飲食/超市', '備註': '解渴' }
  ];

  // 2. 更新標題列並重新填入數據
  await mainSheet.clear();
  await mainSheet.setHeaderRow(['日期', '項目', '金額', '類別', '備註']);
  await mainSheet.addRows(enrichedData);

  console.log('欄位升級與備註補完完成！');
}
update().catch(console.error);
