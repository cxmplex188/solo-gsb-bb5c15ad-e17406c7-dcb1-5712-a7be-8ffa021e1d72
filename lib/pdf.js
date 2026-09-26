'use strict';

const { PDFDocument, PageSizes } = require('pdf-lib');

// A4 横向（短边 210mm = 595.28pt，长边 297mm = 841.89pt）
const OUTPUT_WIDTH = PageSizes.A4[1];  // 841.89pt
const OUTPUT_HEIGHT = PageSizes.A4[0]; // 595.28pt

/**
 * 按拼版方案生成 A4 横向双面拼版 PDF
 *
 * 每面左右各放一页，等比缩放并居中；空白页位不绘制任何内容。
 * 输出页顺序：帖1 第1张正面、帖1 第1张背面、帖1 第2张正面、……，帖2 ……
 * （同一张纸的正反两面在 PDF 中相邻，方便双面打印逐张配对）
 *
 * @param {Buffer} sourceBuffer 源 PDF 字节
 * @param {object} plan buildPlan() 返回的拼版方案
 * @returns {Promise<Uint8Array>} 输出 PDF 字节
 */
async function renderImposedPdf(sourceBuffer, plan) {
  const sourceDoc = await PDFDocument.load(sourceBuffer, {
    // 允许读取带空属主口令（仅限制编辑）的 PDF
    ignoreEncryption: true,
  });

  const outputDoc = await PDFDocument.create();
  const sourcePages = sourceDoc.getPages();

  // 一次性复制全部源页到输出文档（embedded 页面通过 embedPage 引用）
  const embedded = await Promise.all(
    sourcePages.map((p) => outputDoc.embedPage(p))
  );

  const halfWidth = OUTPUT_WIDTH / 2;

  // 记录某源页被使用次数（纯防御，理论上每页恰好使用一次）
  const drawCell = (page, cell, xOffset) => {
    if (cell.blank) return;
    const embeddedPage = embedded[cell.page - 1];
    const width = embeddedPage.width;
    const height = embeddedPage.height;
    const scale = Math.min(halfWidth / width, OUTPUT_HEIGHT / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const x = xOffset + (halfWidth - drawWidth) / 2;
    const y = (OUTPUT_HEIGHT - drawHeight) / 2;
    page.drawPage(embeddedPage, { x, y, width: drawWidth, height: drawHeight });
  };

  for (const signature of plan.signatures) {
    for (const sheet of signature.sheets) {
      // 正面：左、右
      const front = outputDoc.addPage([OUTPUT_WIDTH, OUTPUT_HEIGHT]);
      drawCell(front, sheet.front.left, 0);
      drawCell(front, sheet.front.right, halfWidth);

      // 背面：左、右
      const back = outputDoc.addPage([OUTPUT_WIDTH, OUTPUT_HEIGHT]);
      drawCell(back, sheet.back.left, 0);
      drawCell(back, sheet.back.right, halfWidth);
    }
  }

  // pdf-lib 会自动去重同一嵌入页；这里每页只引用一次，输出元数据补上标题
  outputDoc.setTitle(`Booklet imposition - ${plan.totalSheets} sheets`);
  return outputDoc.save();
}

module.exports = { renderImposedPdf, OUTPUT_WIDTH, OUTPUT_HEIGHT };
