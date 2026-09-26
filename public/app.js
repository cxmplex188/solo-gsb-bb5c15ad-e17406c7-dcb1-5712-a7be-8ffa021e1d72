'use strict';

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileNameEl = document.getElementById('file-name');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const summaryEl = document.getElementById('summary');
const signaturesEl = document.getElementById('signatures');
const downloadLink = document.getElementById('download-link');

let selectedFile = null;

function getSheetsPerSignature() {
  return parseInt(document.querySelector('input[name="sheets"]:checked').value, 10);
}

function setStatus(message, kind = '') {
  statusEl.textContent = message || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function selectFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('请选择 PDF 文件', 'error');
    return;
  }
  selectedFile = file;
  fileNameEl.textContent = `已选择：${file.name}（${(file.size / 1024 / 1024).toFixed(2)} MB）`;
  submitBtn.disabled = false;
  setStatus('');
}

fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));

['dragenter', 'dragover'].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  })
);
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    selectFile(file);
  }
});

document.querySelectorAll('input[name="sheets"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    // 换选项后若已有结果，按需求重新拼版
    if (!resultEl.classList.contains('hidden')) {
      impose();
    }
  });
});

submitBtn.addEventListener('click', impose);

async function impose() {
  if (!selectedFile) {
    setStatus('请先选择 PDF 文件', 'error');
    return;
  }
  submitBtn.disabled = true;
  resultEl.classList.add('hidden');
  setStatus('正在上传并拼版，请稍候……', 'busy');

  try {
    const sheets = getSheetsPerSignature();
    const response = await fetch(`/api/impose?sheets=${sheets}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: selectedFile,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `服务器错误（${response.status}）`);
    }
    setStatus('拼版完成，可预览并下载。', 'ok');
    renderResult(payload.plan);
    downloadLink.href = payload.downloadUrl;
    resultEl.classList.remove('hidden');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function pageLabel(cell) {
  if (cell.blank) {
    return '<span class="num">空白</span><span class="label">（补白页位）</span>';
  }
  return `<span class="num">P${cell.page}</span>`;
}

function renderSide(side, kind, kindLabel) {
  return `
    <div class="side">
      <div class="side-name ${kind}">${kindLabel}（左 / 右）</div>
      <div class="face">
        <div class="page-box ${kind} ${side.left.blank ? 'blank' : ''}">
          <span class="label">左</span>${pageLabel(side.left)}
        </div>
        <div class="spine" aria-hidden="true"></div>
        <div class="page-box ${kind} ${side.right.blank ? 'blank' : ''}">
          <span class="label">右</span>${pageLabel(side.right)}
        </div>
      </div>
    </div>`;
}

function renderSheet(sheet) {
  return `
    <div class="sheet">
      <div class="sheet-head">第 ${sheet.sheetIndex + 1} 张纸 · ${sheet.role}</div>
      <div class="sides">
        ${renderSide(sheet.front, 'front', '正面')}
        <div class="sheet-arrow" aria-hidden="true">⇅ 短边翻转</div>
        ${renderSide(sheet.back, 'back', '背面')}
      </div>
    </div>`;
}

function renderPlan(plan) {
  summaryEl.innerHTML = `
    源 PDF 共 <strong>${plan.sourcePageCount}</strong> 页，
    每帖 <strong>${plan.sheetsPerSignature}</strong> 张纸（每帖 ${plan.pagesPerSignature} 页位），
    共 <strong>${plan.signatureCount}</strong> 帖、<strong>${plan.totalSheets}</strong> 张纸
    （输出 PDF ${plan.sideCount} 面）。
    ${plan.blankCount > 0
      ? `末帖补 <strong>${plan.blankCount}</strong> 个空白页位（不绘制内容），补白后共 ${plan.totalSlots} 页位。`
      : '页数恰好凑满所有帖，无需补空白。'}`;

  signaturesEl.innerHTML = plan.signatures
    .map(
      (sig) => `
      <div class="signature">
        <div class="sig-title">
          第 ${sig.signatureIndex + 1} 帖
          ${sig.padded ? '<span class="pad-flag">（末帖 · 含补空白）</span>' : ''}
        </div>
        ${sig.sheets.map(renderSheet).join('')}
      </div>`
    )
    .join('');
}
