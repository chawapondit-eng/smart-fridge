import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProductSemantically,
  sanitizeProductName,
} from '../src/lib/productClassifier';

test('Real OCR Receipt E2E Pipeline: Parsing and semantic enrichment from Vision AI output', () => {
  const sampleAiResponse = {
    store: 'เทสโก้ โลตัส',
    purchase_date: '2013-05-15',
    items: [
      {
        name: 'ข้าวผัดพริกกระเพรา',
        category: 'food',
        quantity: 1,
        unit: 'กล่อง',
        unit_price: 45.0,
        line_total: 45.0,
        discount: null,
        expiry_date: null,
        confidence: 0.98,
        reason: 'อาหารสำเร็จรูปพร้อมทาน',
        raw_text: '1. ข้าวผัดพริก กระเพรา',
      },
      {
        name: 'ข้าวเปล่า',
        category: 'food',
        quantity: 1,
        unit: 'ถุง',
        unit_price: 10.0,
        line_total: 10.0,
        discount: null,
        expiry_date: null,
        confidence: 0.98,
        reason: 'อาหารประเภทข้าว',
        raw_text: '2. ข้าวเปล่า',
      },
    ],
  };

  assert.strictEqual(sampleAiResponse.store, 'เทสโก้ โลตัส');
  assert.strictEqual(sampleAiResponse.purchase_date, '2013-05-15');
  assert.strictEqual(sampleAiResponse.items.length, 2);

  // Item 1
  const item1 = sampleAiResponse.items[0];
  const clean1 = sanitizeProductName(item1.name);
  assert.strictEqual(clean1, 'ข้าวผัดพริกกระเพรา');
  const sem1 = classifyProductSemantically(clean1);
  assert.strictEqual(sem1.category, 'food');
  assert.strictEqual(item1.unit_price, 45.0);
  assert.strictEqual(item1.line_total, 45.0);
  assert.strictEqual(item1.unit, 'กล่อง');

  // Item 2
  const item2 = sampleAiResponse.items[1];
  const clean2 = sanitizeProductName(item2.name);
  assert.strictEqual(clean2, 'ข้าวเปล่า');
  const sem2 = classifyProductSemantically(clean2);
  assert.strictEqual(sem2.category, 'food');
  assert.strictEqual(item2.unit_price, 10.0);
  assert.strictEqual(item2.line_total, 10.0);
  assert.strictEqual(item2.unit, 'ถุง');
});
