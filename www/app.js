const C = window.Capacitor;
const plug = n => (C.registerPlugin ? C.registerPlugin(n) : C.Plugins[n]);
const Scanner = plug('DocumentScanner');
const Media = plug('MediaSave');
const $ = s => document.querySelector(s);
const ROOT = 'Download/Scans';
window.addEventListener('error', e => { $('#log').textContent = 'JS error: ' + e.message; });

const MAX_BYTES = 110000; // per page, stays under 120k
const T = {
  he: {
    scan: '📷 סרוק מסמך', settings: 'שמור', reviewTitle: 'לא הצלחתי לזהות — אשר או תקן',
    type: 'סוג מסמך (תיקייה)', period: 'תקופה (למשל 2026.11-12)', ok: 'שמור', cancel: 'בטל',
    fmt: 'פורמט שמירה', lang: 'שפה', models: 'מודלים של AI לפי סדר ניסיון',
    hModels: 'שורה לכל מודל: gemini:שם-מודל  או  openrouter:שם-מודל. אם אחד נכשל, ינסה את הבא.',
    compress: 'מכווץ…', analyze: 'מזהה סוג ותקופה…', saved: 'נשמר: ', noKey: 'לא הוגדר מפתח AI — הזן ידנית',
    fail: 'שגיאה: ', cancelled: 'בוטל'
  },
  en: {
    scan: '📷 Scan document', settings: 'Save', reviewTitle: 'Could not identify — confirm or fix',
    type: 'Document type (folder)', period: 'Period (e.g. 2026.11-12)', ok: 'Save', cancel: 'Cancel',
    fmt: 'Save format', lang: 'Language', models: 'AI models, in order of attempt',
    hModels: 'One per line: gemini:model-name or openrouter:model-name. If one fails the next is tried.',
    compress: 'Compressing…', analyze: 'Detecting type and period…', saved: 'Saved: ', noKey: 'No AI key set — enter manually',
    fail: 'Error: ', cancelled: 'Cancelled'
  }
};
let S = Object.assign({
  fmt: 'pdf', lang: 'he', gKey: '', oKey: '',
  models: 'gemini:gemini-2.5-flash\ngemini:gemini-2.5-flash-lite\nopenrouter:google/gemma-3-27b-it:free'
}, JSON.parse(localStorage.getItem('s') || '{}'));
const t = k => T[S.lang][k];
const log = m => { $('#log').textContent = m; };

function applyLang() {
  document.documentElement.dir = S.lang === 'he' ? 'rtl' : 'ltr';
  $('#scanBtn').textContent = t('scan'); $('#reviewTitle').textContent = t('reviewTitle');
  $('#lType').textContent = t('type'); $('#lPeriod').textContent = t('period');
  $('#rOk').textContent = t('ok'); $('#rCancel').textContent = t('cancel');
  $('#lFmt').textContent = t('fmt'); $('#lLang').textContent = t('lang');
  $('#lModels').textContent = t('models'); $('#hModels').textContent = t('hModels');
  $('#sOk').textContent = t('settings');
}
applyLang();

$('#gearBtn').onclick = () => {
  const p = $('#settings');
  if (p.style.display === 'block') { p.style.display = 'none'; return; }
  $('#sFmt').value = S.fmt; $('#sLang').value = S.lang; $('#sG').value = S.gKey; $('#sO').value = S.oKey; $('#sM').value = S.models;
  p.style.display = 'block';
};
$('#sOk').onclick = () => {
  S = { fmt: $('#sFmt').value, lang: $('#sLang').value, gKey: $('#sG').value.trim(), oKey: $('#sO').value.trim(), models: $('#sM').value };
  localStorage.setItem('s', JSON.stringify(S));
  applyLang(); $('#settings').style.display = 'none';
};

// ---------- image compression ----------
async function compress(path) {
  const img = new Image();
  img.src = C.convertFileSrc(path);
  await img.decode();
  let side = 1400, q = 0.6, blob;
  for (let i = 0; i < 12; i++) {
    const sc = Math.min(1, side / Math.max(img.width, img.height));
    const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
    if (blob.size <= MAX_BYTES) return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
    if (q > 0.4) q -= 0.1; else { side *= 0.85; q = 0.5; }
  }
  const w = img.width, h = img.height;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

const b64 = u8 => {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};

// ---------- minimal PDF writer (JPEG pages) ----------
function makePdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (i, fn) => { offs[i] = len; push(`${i} 0 obj\n`); fn(); push('endobj\n'); };
  const n = pages.length;
  push('%PDF-1.4\n');
  obj(1, () => push('<</Type/Catalog/Pages 2 0 R>>\n'));
  obj(2, () => push(`<</Type/Pages/Kids[${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}]/Count ${n}>>\n`));
  pages.forEach((p, i) => {
    const b = 3 + i * 3, pw = 595, ph = Math.round(595 * p.h / p.w);
    obj(b, () => push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pw} ${ph}]/Resources<</XObject<</Im0 ${b + 2} 0 R>>>>/Contents ${b + 1} 0 R>>\n`));
    const c = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(b + 1, () => push(`<</Length ${c.length}>>\nstream\n${c}\nendstream\n`));
    obj(b + 2, () => {
      push(`<</Type/XObject/Subtype/Image/Width ${p.w}/Height ${p.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${p.bytes.length}>>\nstream\n`);
      push(p.bytes); push('\nendstream\n');
    });
  });
  const total = 2 + n * 3, xref = len;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<</Size ${total + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- AI classification with model fallback ----------
async function existingFolders() {
  try { return (await Media.folders()).folders; } catch (e) { return []; }
}

function prompt(folders) {
  return 'This is a scanned document (Hebrew or English). Return JSON only: ' +
    '{"type": short Hebrew folder name for the document category (e.g. ארנונה, חשמל, מים, ביטוח, בנק, רפואי), ' +
    '"period": the period the document covers as YYYY.MM for one month, YYYY.MM-MM for a range of months in one year, ' +
    'YYYY for a whole year, YYYY.MM.DD if it is a single-date document, ' +
    '"confident": true or false}. Existing folders: ' + JSON.stringify(folders) +
    ' - reuse one if it fits. Use the year printed on the document. If unsure about type or period, set confident false.';
}

async function askModel(line, img64, folders) {
  const i = line.indexOf(':'), prov = line.slice(0, i).trim(), model = line.slice(i + 1).trim();
  let text;
  if (prov === 'gemini') {
    if (!S.gKey) throw new Error('no gemini key');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${S.gKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(folders) }, { inline_data: { mime_type: 'image/jpeg', data: img64 } }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    if (!r.ok) throw new Error(`${model} ${r.status}`);
    text = (await r.json()).candidates[0].content.parts[0].text;
  } else if (prov === 'openrouter') {
    if (!S.oKey) throw new Error('no openrouter key');
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.oKey },
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt(folders) },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img64 } }] }]
      })
    });
    if (!r.ok) throw new Error(`${model} ${r.status}`);
    text = (await r.json()).choices[0].message.content;
  } else throw new Error('bad provider ' + prov);
  return JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
}

async function classify(page, folders) {
  const img64 = b64(page.bytes);
  for (const line of S.models.split('\n').map(l => l.trim()).filter(Boolean)) {
    try { return await askModel(line, img64, folders); } catch (e) { console.warn(line, e); }
  }
  return null;
}

// ---------- review dialog ----------
function review(info, folders) {
  return new Promise(res => {
    $('#folders').innerHTML = folders.map(f => `<option value="${f}">`).join('');
    $('#rType').value = (info && info.type) || ''; $('#rPeriod').value = (info && info.period) || '';
    $('#review').style.display = 'block';
    const done = v => { $('#review').style.display = 'none'; res(v); };
    $('#rOk').onclick = () => {
      const type = $('#rType').value.trim(), period = $('#rPeriod').value.trim();
      if (type && period) done({ type, period });
    };
    $('#rCancel').onclick = () => done(null);
  });
}

// ---------- saving ----------
const clean = s => s.replace(/[\\/:*?"<>|]/g, '-').trim();
async function save(pages, type, period) {
  const folder = clean(type), base = clean(period), saved = [];
  const put = async (name, mime, u8) => {
    const r = await Media.save({ folder, name, mime, data: b64(u8) });
    saved.push(`${ROOT}/${folder}/${r.name}`);
  };
  if (S.fmt === 'pdf') await put(base + '.pdf', 'application/pdf', makePdf(pages));
  else for (let i = 0; i < pages.length; i++)
    await put((pages.length > 1 ? `${base}-p${i + 1}` : base) + '.jpg', 'image/jpeg', pages[i].bytes);
  return saved;
}

// ---------- main flow ----------
$('#scanBtn').onclick = async () => {
  try {
    log('');
    const r = await Scanner.scanDocument({ galleryImportAllowed: true, pageLimit: 10, resultFormats: 'JPEG', scannerMode: 'FULL' });
    const paths = r.scannedImages || [];
    if (!paths.length) { log(t('cancelled')); return; }
    log(t('compress'));
    const pages = [];
    for (const p of paths) pages.push(await compress(p));
    log(t('analyze'));
    const folders = await existingFolders();
    let info = await classify(pages[0], folders);
    if (!info || !info.confident || !info.type || !info.period) {
      log(info ? '' : t('noKey'));
      info = await review(info, folders);
      if (!info) { log(t('cancelled')); return; }
    }
    const files = await save(pages, info.type, info.period);
    const kb = pages.reduce((a, p) => a + p.bytes.length, 0) / 1024;
    log(t('saved') + files.join('\n') + `\n(${Math.round(kb)} KB)`);
  } catch (e) {
    log(t('fail') + (e.message || e));
  }
};
