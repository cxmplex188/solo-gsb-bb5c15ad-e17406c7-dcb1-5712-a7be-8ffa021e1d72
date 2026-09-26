'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../lib/imposition');

/** 把方案按「纸张 → 面 → 左右」拍平成页码/null 序列（即输出 PDF 的面顺序） */
function flatten(plan) {
  const out = [];
  for (const sig of plan.signatures) {
    for (const sheet of sig.sheets) {
      out.push([sheet.front.left, sheet.front.right].map((c) => (c.blank ? null : c.page)));
      out.push([sheet.back.left, sheet.back.right].map((c) => (c.blank ? null : c.page)));
    }
  }
  return out;
}

/**
 * 模拟物理折叠后的阅读顺序：
 * 每帖纸张从外到内 s=0..k-1。逐张沿中线对折并嵌套后，翻页顺序为
 *   向内：每张 front.right、back.left
 *   再向外出：每张 back.right、front.left（从最内张到最外张）
 * 例如 k=2：外(fR,bL) → 内(fR,bL,bR,fL) → 外(bR,fL)
 */
function readingOrder(plan) {
  const order = [];
  const cell = (c) => (c.blank ? null : c.page);
  for (const sig of plan.signatures) {
    const sheets = sig.sheets;
    const k = sheets.length;
    for (let s = 0; s < k; s++) {
      order.push(cell(sheets[s].front.right), cell(sheets[s].back.left));
    }
    for (let s = k - 1; s >= 0; s--) {
      order.push(cell(sheets[s].back.right), cell(sheets[s].front.left));
    }
  }
  return order;
}

test('P=4, k=1：经典单张 4 页拼版', () => {
  const plan = buildPlan(4, 1);
  assert.equal(plan.signatureCount, 1);
  assert.equal(plan.totalSheets, 1);
  assert.equal(plan.blankCount, 0);
  assert.deepEqual(flatten(plan), [
    [4, 1], // 正面
    [2, 3], // 背面
  ]);
});

test('P=8, k=2：两张嵌套拼版', () => {
  const plan = buildPlan(8, 2);
  assert.equal(plan.signatureCount, 1);
  assert.equal(plan.totalSheets, 2);
  assert.deepEqual(flatten(plan), [
    [8, 1], // 外张正面
    [2, 7], // 外张背面
    [6, 3], // 内张正面
    [4, 5], // 内张背面
  ]);
});

test('P=5, k=1：两帖，末帖补 3 个空白', () => {
  const plan = buildPlan(5, 1);
  assert.equal(plan.signatureCount, 2);
  assert.equal(plan.blankCount, 3);
  assert.equal(plan.signatures[0].padded, false);
  assert.equal(plan.signatures[1].padded, true);
  assert.deepEqual(flatten(plan), [
    [4, 1],
    [2, 3],
    [null, 5], // 末帖正面：空白 + P5
    [null, null], // 末帖背面全空
  ]);
});

test('P=10, k=1：三帖，末帖补 2 个空白', () => {
  const plan = buildPlan(10, 1);
  assert.equal(plan.signatureCount, 3);
  assert.equal(plan.blankCount, 2);
  assert.deepEqual(flatten(plan), [
    [4, 1], [2, 3],
    [8, 5], [6, 7],
    [null, 9], [10, null],
  ]);
});

test('P=6, k=2：一帖补 2 个空白', () => {
  const plan = buildPlan(6, 2);
  assert.equal(plan.signatureCount, 1);
  assert.equal(plan.blankCount, 2);
  assert.deepEqual(flatten(plan), [
    [null, 1], [2, null],
    [6, 3], [4, 5],
  ]);
});

test('参数校验', () => {
  assert.throws(() => buildPlan(0, 1), /正整数/);
  assert.throws(() => buildPlan(4, 3), /1 或 2/);
  assert.throws(() => buildPlan(4, 0), /1 或 2/);
});

test('穷举 P=1..40：每个页位非空页码 1..P 各出现一次，空白只在末尾帖', () => {
  for (const k of [1, 2]) {
    for (let p = 1; p <= 40; p++) {
      const plan = buildPlan(p, k);
      const sides = flatten(plan);
      const used = sides.flat().filter((n) => n !== null).sort((a, b) => a - b);
      assert.deepEqual(used, Array.from({ length: p }, (_, i) => i + 1), `k=${k},P=${p}`);
      assert.equal(sides.length, plan.totalSheets * 2);

      // 空白只能出现在最后一帖
      plan.signatures.forEach((sig, idx) => {
        const hasBlank = sig.sheets.some((sh) =>
          [sh.front.left, sh.front.right, sh.back.left, sh.back.right].some((c) => c.blank)
        );
        if (idx < plan.signatureCount - 1) assert.equal(hasBlank, false, `k=${k},P=${p}`);
      });
    }
  }
});

test('折叠模拟：P=4 单帖阅读顺序 1..4', () => {
  assert.deepEqual(readingOrder(buildPlan(4, 1)), [1, 2, 3, 4]);
});

test('折叠模拟：P=8 双张嵌套阅读顺序 1..8', () => {
  assert.deepEqual(readingOrder(buildPlan(8, 2)), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('穷举：各帖折叠后真实页码严格递增（空白统一落在帖末）', () => {
  for (const k of [1, 2]) {
    for (let p = 1; p <= 40; p++) {
      const order = readingOrder(buildPlan(p, k));
      const nums = order.filter((n) => n !== null);
      const sorted = [...nums].sort((a, b) => a - b);
      assert.deepEqual(nums, sorted, `折叠后乱序 k=${k},P=${p}`);
      // 每个真实页码恰好出现一次
      assert.deepEqual(nums, Array.from({ length: p }, (_, i) => i + 1), `页码缺失 k=${k},P=${p}`);
      // 空白（null）只能出现在序列尾部
      const firstNull = order.indexOf(null);
      if (firstNull >= 0) {
        assert.ok(order.slice(firstNull).every((n) => n === null), `空白不在末尾 k=${k},P=${p}`);
      }
    }
  }
});
