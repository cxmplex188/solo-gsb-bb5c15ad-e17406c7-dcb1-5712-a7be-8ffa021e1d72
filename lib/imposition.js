'use strict';

// 折页小册子拼版核心逻辑
//
// 术语：
//   帖（signature）：一叠套在一起折叠的纸张
//   每张纸有两面（正面 front / 背面 back），每面放两页
//   k = 每帖纸张数（1 或 2），每帖共 4*k 个页位
//
// 一帖之内，页位编号规则（以一帖总页数 M = 4k 为基数，页位从 1 起）：
//   第 s 张纸（s 从外到内，0 起）：
//     正面左 = M - 2s      正面右 = 1 + 2s
//     背面左 = 2 + 2s      背面右 = M - 1 - 2s
//
// 输出纸张顺序：第 1 帖（第 1 张正面、第 1 张背面、第 2 张正面、……），
// 接着第 2 帖…… 同一帖的纸张按从外到内排列，折叠后页码连续。

/**
 * 计算拼版方案（不接触 PDF，纯数据，便于测试与预览）
 *
 * @param {number} pageCount 源 PDF 页数
 * @param {1|2} sheetsPerSignature 每帖纸张数
 * @returns {object} 拼版方案
 */
function buildPlan(pageCount, sheetsPerSignature) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error('页数必须为正整数');
  }
  const k = Number(sheetsPerSignature);
  if (k !== 1 && k !== 2) {
    throw new Error('每帖纸张数只能为 1 或 2');
  }

  const pagesPerSignature = 4 * k;
  const signatureCount = Math.ceil(pageCount / pagesPerSignature);
  // 仅在末帖补空白：总页位向上取整到每帖容量的倍数
  const totalSlots = signatureCount * pagesPerSignature;
  const blankCount = totalSlots - pageCount;

  /** 给定帖内页位（1 起），返回全局页码；超出源页数则为空白 */
  const slot = (signatureIndex, localNumber) => {
    const globalNumber = signatureIndex * pagesPerSignature + localNumber;
    return globalNumber <= pageCount
      ? { page: globalNumber, blank: false }
      : { page: null, blank: true, blankPage: globalNumber };
  };

  const signatures = [];
  for (let i = 0; i < signatureCount; i++) {
    const sheets = [];
    for (let s = 0; s < k; s++) {
      sheets.push({
        sheetIndex: s,
        role: k === 1 ? '单张（封面/封底）' : s === 0 ? '外张（封面/封底）' : '内张',
        front: {
          left: slot(i, pagesPerSignature - 2 * s),
          right: slot(i, 1 + 2 * s),
        },
        back: {
          left: slot(i, 2 + 2 * s),
          right: slot(i, pagesPerSignature - 1 - 2 * s),
        },
      });
    }
    // 判断该帖是否为补空白的末帖
    const isPadded = i === signatureCount - 1 && blankCount > 0;
    signatures.push({
      signatureIndex: i,
      sheets,
      padded: isPadded,
    });
  }

  const totalSheets = signatureCount * k;

  return {
    sourcePageCount: pageCount,
    sheetsPerSignature: k,
    pagesPerSignature,
    signatureCount,
    totalSheets,
    totalSlots,
    blankCount,
    signatures,
    // 输出 PDF 面数（每张纸正反两面）
    sideCount: totalSheets * 2,
  };
}

module.exports = { buildPlan };
