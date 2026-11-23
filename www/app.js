const C = window.Capacitor;
const plug = n => (C.registerPlugin ? C.registerPlugin(n) : C.Plugins[n]);
const Scanner = plug('DocumentScanner');
const Media = plug('MediaSave');
const $ = s => document.querySelector(s);
let mainFolder = '';
window.addEventListener('error', e => { $('#log').textContent = 'JS error: ' + e.message; });

const MAX_BYTES = 110000; // per page, stays under 120k
const T = {
  he: {
    scan: '📷 סרוק מסמך', settings: 'שמור', reviewTitle: 'לא הצלחתי לזהות — אשר או תקן',
    type: 'סוג מסמך (תיקייה)', period: 'תקופה (למשל 2026.11-12)', ok: 'שמור', cancel: 'בטל',
    fmt: 'פורמט שמירה', lang: 'שפה', models: 'מודלים של AI לפי סדר ניסיון',
    hModels: 'שורה לכל מודל: gemini:שם-מודל, openrouter:שם-מודל או groq:שם-מודל. אם אחד נכשל, ינסה את הבא.',
    compress: 'מכווץ…', analyze: 'מזהה סוג ותקופה…', saved: 'נשמר: ', noKey: 'לא הוגדר מפתח AI — הזן ידנית',
    fail: 'שגיאה: ', modelLog: 'יומן מודלים', clearLog: 'נקה יומן', noLog: 'אין פעילות עדיין', needName: 'מסמך ממתין למתן שם', aiFail: 'שגיאת AI: ', bg: 'שומר ברקע: ', autoNext: 'פתח מצלמה אוטומטית אחרי מתן שם', folder: 'תיקייה ראשית לשמירה', pick: 'בחר תיקייה', none: 'לא נבחרה תיקייה', needFolder: 'בחר קודם תיקייה ראשית בהגדרות (למשל Download/Scans)', cancelled: 'בוטל'
  },
  en: {
    scan: '📷 Scan document', settings: 'Save', reviewTitle: 'Could not identify — confirm or fix',
    type: 'Document type (folder)', period: 'Period (e.g. 2026.11-12)', ok: 'Save', cancel: 'Cancel',
    fmt: 'Save format', lang: 'Language', models: 'AI models, in order of attempt',
    hModels: 'One per line: gemini:model-name, openrouter:model-name or groq:model-name. If one fails the next is tried.',
    compress: 'Compressing…', analyze: 'Detecting type and period…', saved: 'Saved: ', noKey: 'No AI key set — enter manually',
    fail: 'Error: ', modelLog: 'Model log', clearLog: 'Clear log', noLog: 'No activity yet', needName: 'Document needs a name', aiFail: 'AI error: ', bg: 'Saving in background: ', autoNext: 'Reopen camera automatically after naming', folder: 'Main save folder', pick: 'Choose folder', none: 'No folder chosen', needFolder: 'Choose a main folder in settings first (e.g. Download/Scans)', cancelled: 'Cancelled'
  }
};
let S = Object.assign({
  fmt: 'jpg', lang: 'en', gKey: '', oKey: '', grKey: '',
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
  $('#sOk').textContent = t('settings'); $('#sTitle').textContent = '⚙'; $('#logSum').textContent = t('modelLog'); $('#clearLog').textContent = t('clearLog'); $('#lAuto').textContent = t('autoNext');
  $('#lFolder').textContent = t('folder'); $('#pickBtn').textContent = t('pick');
}
applyLang();

async function refreshFolder() {
  try { mainFolder = (await Media.getFolder()).name; } catch (e) { mainFolder = ''; }
  $('#folderName').textContent = mainFolder || t('none');
}
refreshFolder();
$('#pickBtn').onclick = async () => {
  try { await Media.pickFolder(); } catch (e) { }
  refreshFolder();
};

$('#gearBtn').onclick = () => {
  const p = $('#settings');
  if (p.style.display === 'block') { p.style.display = 'none'; return; }
  $('#sFmt').value = S.fmt; $('#sLang').value = S.lang; $('#sG').value = S.gKey; $('#sO').value = S.oKey; $('#sGr').value = S.grKey; $('#sM').value = S.models; $('#sAuto').checked = !!S.auto;
  p.style.display = 'block';
};
$('#sOk').onclick = () => {
  S = { fmt: $('#sFmt').value, lang: $('#sLang').value, gKey: $('#sG').value.trim(), oKey: $('#sO').value.trim(), grKey: $('#sGr').value.trim(), models: $('#sM').value, auto: $('#sAuto').checked };
  localStorage.setItem('s', JSON.stringify(S));
  applyLang(); $('#settings').style.display = 'none';
};

// ---------- image compression ----------
async function compress(path, rot = 0) {
  const img = new Image();
  img.src = C.convertFileSrc(path);
  await img.decode();
  const sw = rot % 180 ? img.height : img.width, sh = rot % 180 ? img.width : img.height;
  let side = 1400, q = 0.6, blob, w = sw, h = sh;
  for (let i = 0; i < 12; i++) {
    const sc = Math.min(1, side / Math.max(sw, sh));
    w = Math.round(sw * sc); h = Math.round(sh * sc);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
    cx.save(); cx.translate(w / 2, h / 2); cx.rotate(rot * Math.PI / 180);
    const dw = rot % 180 ? h : w, dh = rot % 180 ? w : h;
    cx.drawImage(img, -dw / 2, -dh / 2, dw, dh); cx.restore();
    blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
    if (blob.size <= MAX_BYTES) break;
    if (q > 0.4) q -= 0.1; else { side *= 0.85; q = 0.5; }
  }
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

const tfetch = (u, o) => { const c = new AbortController(); const id = setTimeout(() => c.abort(), 25000); return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(id)); };

async function askModel(line, img64, folders) {
  const i = line.indexOf(':'), prov = line.slice(0, i).trim().toLowerCase(), model = line.slice(i + 1).trim();
  let text;
  if (prov === 'gemini') {
    if (!S.gKey) throw new Error('Gemini key is empty - open settings, paste it and press Save');
    const call = think => tfetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${S.gKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(folders) }, { inline_data: { mime_type: 'image/jpeg', data: img64 } }] }],
        generationConfig: Object.assign({ responseMimeType: 'application/json' }, think ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      })
    });
    let r = await call(true);
    if (r.status === 400) r = await call(false); // model doesn't accept a thinking budget of 0
    if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 150)}`);
    text = (await r.json()).candidates[0].content.parts[0].text;
  } else if (prov === 'openrouter' || prov === 'groq') {
    const key = prov === 'groq' ? S.grKey : S.oKey;
    if (!key) throw new Error(prov + ' key is empty - open settings, paste it and press Save');
    const r = await tfetch(prov === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt(folders) },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img64 } }] }]
      })
    });
    if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 150)}`);
    text = (await r.json()).choices[0].message.content;
  } else throw new Error('bad provider ' + prov);
  return JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
}

let aiErr = '';
let lastAttempts = [];
async function classify(img64, folders) {
  aiErr = ''; lastAttempts = [];
  for (const line of S.models.split('\n').map(l => l.trim()).filter(Boolean)) {
    const t0 = Date.now(), name = line.slice(line.indexOf(':') + 1).trim();
    try {
      const o = await askModel(line, img64, folders);
      const sec = (Date.now() - t0) / 1000;
      lastAttempts.push({ model: name, ok: true, sec });
      o._label = `${name} ${sec.toFixed(1)}s`;
      return o;
    } catch (e) {
      aiErr = String(e.message || e);
      lastAttempts.push({ model: name, ok: false, sec: (Date.now() - t0) / 1000, err: aiErr.slice(0, 120) });
    }
  }
  return null;
}

// ---------- review dialog (for one pending document) ----------
function review(item) {
  return new Promise(res => {
    $('#folders').innerHTML = item.folders.map(f => `<option value="${f}">`).join('');
    const info = item.info || {};
    $('#rType').value = info.type || ''; $('#rPeriod').value = info.period || ''; $('#rRot').value = String(item.rot);
    $('#rWhy').textContent = item.info ? item.info._label + ' (low confidence)' : (item.err ? t('aiFail') + item.err : t('noKey'));
    URL.revokeObjectURL($('#rImg').src);
    $('#rImg').src = URL.createObjectURL(new Blob([item.pages[0].bytes], { type: 'image/jpeg' }));
    $('#review').style.display = 'block';
    const done = v => { $('#review').style.display = 'none'; res(v); };
    $('#rOk').onclick = () => {
      const type = $('#rType').value.trim(), period = $('#rPeriod').value.trim();
      if (type && period) done({ type, period, rot: +$('#rRot').value });
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
    saved.push(r.name);
  };
  if (S.fmt === 'pdf') await put(base + '.pdf', 'application/pdf', makePdf(pages));
  else for (let i = 0; i < pages.length; i++)
    await put((pages.length > 1 ? `${base}-p${i + 1}` : base) + '.jpg', 'image/jpeg', pages[i].bytes);
  return saved;
}

// ---------- model activity log ----------
function logEntry(e) {
  try {
    const arr = JSON.parse(localStorage.getItem('log') || '[]');
    arr.unshift(e);
    localStorage.setItem('log', JSON.stringify(arr.slice(0, 300)));
  } catch (x) { }
}
function renderLog() {
  let arr = []; try { arr = JSON.parse(localStorage.getItem('log') || '[]'); } catch (x) { }
  const st = {};
  for (const e of arr) for (const a of e.attempts || []) {
    const m = st[a.model] || (st[a.model] = { ok: 0, fail: 0, secOk: 0 });
    if (a.ok) { m.ok++; m.secOk += a.sec; } else m.fail++;
  }
  const lines = Object.entries(st).map(([m, v]) =>
    `${m}: ✓${v.ok} ✗${v.fail}` + (v.ok ? ` · avg ${(v.secOk / v.ok).toFixed(1)}s` : ''));
  let out = lines.length ? lines.join('\n') + '\n\n' : '';
  if (!arr.length) out = t('noLog');
  for (const e of arr) {
    const d = new Date(e.ts);
    out += `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${e.file} · ${e.type} · total ${e.total}s${e.manual ? ' · manual' : ''}\n`;
    for (const a of e.attempts || []) out += `   ${a.ok ? '✓' : '✗'} ${a.model} ${a.sec.toFixed(1)}s${a.err ? ' — ' + a.err : ''}\n`;
    if (!(e.attempts || []).length) out += '   (no AI attempt)\n';
    out += '\n';
  }
  $('#logView').textContent = out;
}
$('#clearLog').onclick = () => { localStorage.removeItem('log'); renderLog(); };
$('#logBox').addEventListener('toggle', renderLog);

// ---------- main flow ----------
// Every scan goes straight into a background queue. The worker names it with AI, compresses it and saves it.
// If AI can't name it, it waits in a "needs name" list and never blocks scanning.
const queue = [], results = [], pending = []; let working = false, current = '';
const tick = () => new Promise(r => setTimeout(r, 0));
function render() {
  const lines = [];
  if (current) lines.push(current);
  if (working || queue.length) lines.push(t('bg') + (queue.length + (working ? 1 : 0)));
  lines.push(...results.slice(0, 6));
  log(lines.join('\n'));
  const box = $('#pending'); box.innerHTML = '';
  pending.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'sec'; b.style.marginTop = '8px';
    b.textContent = `✎ ${t('needName')} (${i + 1}/${pending.length})`;
    b.onclick = () => nameIt(it);
    box.appendChild(b);
  });
}

async function saveDoc(pages, type, period, label = '', meta = null, manual = false) {
  const entry = { ts: Date.now(), type, manual, attempts: meta ? meta.attempts : [], total: '' };
  try {
    const files = await save(pages, type, period);
    const kb = Math.round(pages.reduce((a, p) => a + p.bytes.length, 0) / 1024);
    results.unshift('✓ ' + files.join(', ') + ` (${kb} KB) · ${type}${label}`);
    entry.file = files.join(', ');
  } catch (e) {
    results.unshift(`✗ ${type} ${period}: ` + (e.message || e));
    entry.file = `SAVE FAILED ${period}: ${String(e.message || e).slice(0, 80)}`;
  }
  entry.total = (meta ? (manual ? meta.procSec : (Date.now() - meta.start) / 1000) : 0).toFixed(1);
  logEntry(entry);
  render();
}

async function nameIt(item) {
  if ($('#review').style.display === 'block') return;
  const v = await review(item);
  if (!v) return;
  pending.splice(pending.indexOf(item), 1);
  render();
  if (v.rot !== item.rot) { item.pages = []; for (const p of item.paths) { item.pages.push(await compress(p, v.rot)); await tick(); } }
  saveDoc(item.pages, v.type, v.period, '', item.meta, true);
}

async function process(j) {
  const start = Date.now();
  current = t('analyze'); render();
  const folders = await existingFolders();
  let info = null;
  try { info = await classify(await thumbB64(j.paths[0]), folders); } catch (e) { aiErr = String(e.message || e); }
  const err = aiErr, rot = 0, meta = { attempts: lastAttempts.slice(), start };
  current = t('compress'); render();
  const pages = [];
  for (const p of j.paths) { pages.push(await compress(p, rot)); await tick(); }
  current = '';
  if (info && info.confident && info.type && info.period) await saveDoc(pages, info.type, info.period, ' · ' + info._label, meta);
  else { meta.procSec = (Date.now() - start) / 1000; pending.push({ paths: j.paths, pages, info, err, rot, folders, meta }); render(); }
}

async function runQueue() {
  if (working) return;
  working = true;
  while (queue.length) {
    const j = queue.shift();
    try { await process(j); } catch (e) { current = ''; results.unshift('✗ ' + (e.message || e)); }
    render();
  }
  working = false; current = ''; render();
}

async function thumbB64(path) {
  const img = new Image();
  img.src = C.convertFileSrc(path);
  await img.decode();
  const sc = Math.min(1, 900 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.6));
  return b64(new Uint8Array(await blob.arrayBuffer()));
}

// returns true if a document was scanned and queued
async function scanOnce() {
  const r = await Scanner.scanDocument({ galleryImportAllowed: true, pageLimit: 10, resultFormats: 'JPEG', scannerMode: 'FULL' });
  const paths = r.scannedImages || [];
  if (!paths.length) return false;
  queue.push({ paths });
  render(); runQueue();
  return true;
}

$('#scanBtn').onclick = async () => {
  try {
    await refreshFolder();
    if (!mainFolder) { current = t('needFolder'); render(); $('#settings').style.display = 'block'; return; }
    current = ''; render();
    while (await scanOnce() && S.auto);
  } catch (e) {
    const m = String(e.message || e);
    current = /cancel|Result code: 0/i.test(m) ? '' : t('fail') + m; render();
  }
};
