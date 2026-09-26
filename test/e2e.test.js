'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PDFDocument, rgb } = require('pdf-lib');

const app = require('../server');
const { renderImposedPdf } = require('../lib/pdf');
const { buildPlan } = require('../lib/imposition');

// 生成带编号页面的测试 PDF（每页白底）
async function makeSourcePdf(pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([297.64, 420.94]); // A3 竖版，测试非 A5 页面的等比缩放
    page.drawText(`PAGE ${i + 1}`, { x: 40, y: 400, size: 24 });
    page.drawRectangle({
      x: 0, y: 0, width: 10, height: 420.94,
      color: rgb(i / pageCount, 0.3, 0.6),
    });
  }
  return doc.save();
}

test('renderImposedPdf：P=7,k=1 输出 4 面 A4 横向', async () => {
  const src = await makeSourcePdf(7);
  const plan = buildPlan(7, 1);
  const out = await renderImposedPdf(src, plan);
  const outDoc = await PDFDocument.load(out);
  const pages = outDoc.getPages();
  assert.equal(pages.length, 4, '2 帖 × 每张 2 面 = 4 面');
  for (const p of pages) {
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width - 841.89) < 0.5, `宽 ${width}`);
    assert.ok(Math.abs(height - 595.28) < 0.5, `高 ${height}`);
    assert.ok(width > height, '应为横向');
  }
});

test('renderImposedPdf：P=5,k=2 输出 4 面', async () => {
  const src = await makeSourcePdf(5);
  const plan = buildPlan(5, 2);
  const out = await renderImposedPdf(src, plan);
  const outDoc = await PDFDocument.load(out);
  assert.equal(outDoc.getPageCount(), 4);
});

test('HTTP 全流程：上传 → 计划 → 下载', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const src = Buffer.from(await makeSourcePdf(6));

  const body = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'POST',
        host: '127.0.0.1',
        port,
        path: '/api/impose?sheets=2',
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': src.length },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on('error', reject);
    req.end(src);
  });

  assert.equal(body.status, 200);
  const payload = JSON.parse(body.data);
  assert.equal(payload.plan.signatureCount, 1);
  assert.equal(payload.plan.totalSheets, 2);
  assert.equal(payload.plan.blankCount, 2);

  const pdf = await new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${payload.downloadUrl}`, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, type: res.headers['content-type'], buf: Buffer.concat(chunks) })
        );
      })
      .on('error', reject);
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.type, 'application/pdf');
  const outDoc = await PDFDocument.load(pdf.buf);
  assert.equal(outDoc.getPageCount(), 4);

  // 错误参数
  const bad = await new Promise((resolve, reject) => {
    const req = http.request(
      { method: 'POST', host: '127.0.0.1', port, path: '/api/impose?sheets=3', headers: { 'Content-Type': 'application/pdf' } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.end(src);
  });
  assert.equal(bad, 400);

  server.close();
});
