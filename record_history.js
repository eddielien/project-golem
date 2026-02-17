const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secret/gcloud.json');

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('1tXOKkUr6m_GC1aLwicVaW8yx-Ku6bjc_ubNckbTgRDw', serviceAccountAuth);

async function recordAll() {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = [
      { '日期': '2026-02-14', '項目': '全聯、Costco、情人節午餐', '金額': '7511', '備註': '與老婆大人用餐' },
      { '日期': '2026-02-14', '項目': '停車費', '金額': '255', '備註': '' },
      { '日期': '2026-02-15', '項目': '生活雜支', '金額': '492', '備註': '353+139' },
      { '日期': '2026-02-16', '項目': '過年紅包總計', '金額': '86000', '備註': '60k+8kx3+2k' },
      { '日期': '2026-02-16', '項目': '刮刮樂', '金額': '450', '備註': '大雄的發財夢' },
      { '日期': '2026-02-16', '項目': '飲料', '金額': '25', '備註': '' }
    ];
    await sheet.addRows(rows);
    console.log('✅ 歷史帳目已全部補齊！');
  } catch (e) {
    console.error('❌ 寫入失敗：', e.message);
  }
}
recordAll();
