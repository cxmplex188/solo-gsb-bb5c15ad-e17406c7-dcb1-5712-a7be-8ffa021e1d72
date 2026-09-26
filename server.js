'use strict';

const express = require('express');
const path = require('path');

const { buildPlan } = require('./lib/imposition');
const { renderImposedPdf } = require('./lib/pdf');

const app = express();
const PORT = process.env.PORT || 3000;

// 上传为原始 PDF 字节，限制 100MB，足够社区常见多页文档
app.use(express.raw({ type: 'application/pdf', limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 拼版任务暂存（内存，10 分钟过期）
const JOBS = new Map();
const JOB_TTL_MS = 10 * 60 * 1000;

function createJob(pdfBytes, plan) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  JOBS.set(id, { pdf: Buffer.from(pdfBytes), plan, createdAt: Date.now() });
  return id;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of JOBS) {
    if (now - job.createdAt > JOB_TTL_MS) JOBS.delete(id);
  }
}, 60 * 1000).unref();

app.get('/health', (_req, res) => res.json({ ok: true }));

// POST /api/impose?sheets=1|2 ，请求体为 application/pdf
app.post('/api/impose', async (req, res) => {
  try {
    const sheets = parseInt(req.query.sheets, 10);
    if (sheets !== 1 && sheets !== 2) {
      return res.status(400).json({ error: '参数 sheets 必须为 1 或 2' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: '请上传 PDF 文件（Content-Type: application/pdf）' });
    }

    const { PDFDocument } = require('pdf-lib');
    let sourceDoc;
    try {
      sourceDoc = await PDFDocument.load(req.body, { ignoreEncryption: true });
    } catch (err) {
      return res.status(400).json({ error: `无法解析 PDF：${err.message}` });
    }
    const pageCount = sourceDoc.getPageCount();
    if (pageCount === 0) {
      return res.status(400).json({ error: 'PDF 没有任何页面' });
    }
    if (pageCount > 500) {
      return res.status(400).json({ error: '页数过多（上限 500 页），请拆分后再试' });
    }

    const plan = buildPlan(pageCount, sheets);
    const pdfBytes = await renderImposedPdf(req.body, plan);
    const jobId = createJob(pdfBytes, plan);

    return res.json({
      jobId,
      downloadUrl: `/api/download/${jobId}`,
      plan,
    });
  } catch (err) {
    console.error('impose error:', err);
    return res.status(500).json({ error: `拼版失败：${err.message}` });
  }
});

app.get('/api/download/:id', (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: '任务不存在或已过期（结果保留 10 分钟），请重新上传' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="booklet-imposed.pdf"');
  return res.send(job.pdf);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`折页拼版服务已启动: http://localhost:${PORT}`);
  });
}

module.exports = app;
