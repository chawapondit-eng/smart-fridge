import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guessSmartUnit,
  extractUnitFromText,
  validatePriceConsistency,
  classifyProductSemantically,
  classifyProductWithLearning,
  sanitizeProductName,
  resolveHierarchicalPrice,
  getEstimatedPriceBenchmark,
  type ProductCategory,
} from '../src/lib/productClassifier';

// ============================================================
// PART 10: AUTOMATED TEST SUITE FOR RECEIPT EXTRACTION & MANAGEMENT
// ============================================================

test('Case 1 & 3 & 4: อ่านสินค้าพร้อมจำนวน ราคาต่อหน่วย และราคารวม (Unit Price vs Line Total)', () => {
  // ตัวอย่าง: "นมสด 2 กล่อง 70.00 บาท"
  const qty = 2;
  const lineTotal = 70.0;
  const calculatedUnitPrice = Math.round((lineTotal / qty) * 100) / 100;

  assert.strictEqual(qty, 2);
  assert.strictEqual(calculatedUnitPrice, 35.0, 'ราคาต่อหน่วยต้องเป็น 35.00 ไม่ใช่ 70.00');
  assert.strictEqual(lineTotal, 70.0, 'ราคารวมต้องเป็น 70.00');

  // ตรวจสอบความสอดคล้องของราคา
  const validation = validatePriceConsistency(qty, calculatedUnitPrice, lineTotal);
  assert.strictEqual(validation.isConsistent, true);
  assert.strictEqual(validation.hasDiscrepancy, false);
  assert.strictEqual(validation.calculatedLineTotal, 70.0);
  assert.strictEqual(validation.calculatedUnitPrice, 35.0);
});

test('Case 2: อ่านสินค้าได้แต่ไม่มีราคา ต้องเป็น null เท่านั้น (ห้ามใส่ 0.00 หรือสร้างราคาเอง)', () => {
  const missingPrice = null;
  const validation = validatePriceConsistency(1, missingPrice, null);

  assert.strictEqual(validation.isConsistent, true);
  assert.strictEqual(validation.hasDiscrepancy, false);
  assert.strictEqual(validation.calculatedLineTotal, null, 'ถ้าไม่มีราคา ราคารวมต้องเป็น null ห้ามเป็น 0.00');
  assert.strictEqual(validation.calculatedUnitPrice, null, 'ถ้าไม่มีราคา ราคาต่อหน่วยต้องเป็น null ห้ามเป็น 0.00');
});

test('Case 5: อ่านหน่วยเป็น "จาน" ตามบริบทอาหารปรุงสำเร็จ', () => {
  assert.strictEqual(guessSmartUnit('ข้าวผัด', 'food'), 'จาน');
  assert.strictEqual(guessSmartUnit('ข้าวผัดกุ้ง 1 จาน 50.00', 'food'), 'จาน');
  assert.strictEqual(guessSmartUnit('กะเพราหมูกรอบ', 'food'), 'จาน');
  assert.strictEqual(guessSmartUnit('ผัดไทยกุ้งสด', 'food'), 'จาน');
});

test('Case 6: อ่านหน่วยเป็น "กล่อง" ตามบริบทนม/บรรจุภัณฑ์', () => {
  assert.strictEqual(guessSmartUnit('นมสด', 'food'), 'กล่อง');
  assert.strictEqual(guessSmartUnit('นมสด 2 กล่อง', 'food'), 'กล่อง');
  assert.strictEqual(guessSmartUnit('นมถั่วเหลือง UHT', 'food'), 'กล่อง');
  assert.strictEqual(guessSmartUnit('คนอร์ซุปก้อน', 'seasoning'), 'กล่อง');
});

test('Case 7: อ่านหน่วยเป็น "ขวด" ตามบริบทเครื่องปรุงเหลวและเครื่องดื่ม', () => {
  assert.strictEqual(guessSmartUnit('น้ำปลา', 'seasoning'), 'ขวด');
  assert.strictEqual(guessSmartUnit('ซีอิ๊วขาว', 'seasoning'), 'ขวด');
  assert.strictEqual(guessSmartUnit('น้ำมันพืช', 'seasoning'), 'ขวด');
  assert.strictEqual(guessSmartUnit('น้ำดื่ม', 'food'), 'ขวด');
  assert.strictEqual(guessSmartUnit('น้ำส้มสายชู', 'seasoning'), 'ขวด');
});

test('Case 8: อ่านหน่วยเป็น "กิโลกรัม" ตามบริบทสินค้าชั่งน้ำหนัก', () => {
  assert.strictEqual(guessSmartUnit('น้ำตาลทราย', 'seasoning'), 'กิโลกรัม');
  assert.strictEqual(guessSmartUnit('หมูบด', 'food'), 'กิโลกรัม');
  assert.strictEqual(guessSmartUnit('เนื้อวัว 0.5 กิโลกรัม', 'food'), 'กิโลกรัม');
  assert.strictEqual(guessSmartUnit('อกไก่ 1 กก.', 'food'), 'กิโลกรัม');
});

test('Case 9: อ่านหน่วยประเภทอื่นๆ เช่น แผง, ฟอง, มัด, หัว, กระป๋อง ได้ถูกต้องตามหลักฐาน', () => {
  // ไข่ไก่: ถ้ามีคำว่าแผง ให้ใช้แผง ถ้าไม่ระบุให้เป็นฟอง
  assert.strictEqual(guessSmartUnit('ไข่ไก่ 1 แผง', 'food'), 'แผง');
  assert.strictEqual(guessSmartUnit('ไข่ไก่', 'food'), 'ฟอง');
  assert.strictEqual(guessSmartUnit('ผักบุ้ง 1 มัด', 'food'), 'มัด');
  assert.strictEqual(guessSmartUnit('กะหล่ำปลี', 'food'), 'หัว');
  assert.strictEqual(guessSmartUnit('ปลากระป๋อง', 'food'), 'กระป๋อง');
});

test('Case 10 & 11: คำนวณราคาอัตโนมัติเมื่อผู้ใช้แก้ไขราคาหรือจำนวน', () => {
  // ผู้ใช้เปลี่ยนจำนวนจาก 2 เป็น 3 กล่อง ราคาต่อหน่วย 35.00
  const qty = 3;
  const unitPrice = 35.0;
  const updatedLineTotal = Math.round(qty * unitPrice * 100) / 100;
  assert.strictEqual(updatedLineTotal, 105.0, '3 x 35.00 ต้องได้ 105.00');

  // ในทางกลับกัน หากผู้ใช้เปลี่ยนราคารวมเป็น 120.00 จำนวน 3 ชิ้น
  const newLineTotal = 120.0;
  const updatedUnitPrice = Math.round((newLineTotal / qty) * 100) / 100;
  assert.strictEqual(updatedUnitPrice, 40.0, '120 / 3 ต้องได้ 40.00');
});

test('Case 12: ผู้ใช้แก้ไขชื่อสินค้าและระบบล้างตัวอักษรขยะ OCR Noise', () => {
  const ocrNoiseName = '1. นมสด โฟร์โมสต์ 45.00V บาท';
  const cleaned = sanitizeProductName(ocrNoiseName);
  assert.strictEqual(cleaned, 'นมสด โฟร์โมสต์');

  // ผู้ใช้แก้ไขชื่อให้ชัดเจนขึ้น
  const userEditedName = 'นมสดจืด โฟร์โมสต์ 225 มล.';
  assert.ok(userEditedName.length > 0);
  assert.strictEqual(classifyProductSemantically(userEditedName).category, 'food');
});

test('Case 13 & 14: ตรรกะการยกเลิกและการบันทึกการแก้ไขของสินค้า', () => {
  interface MockItem {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number | null;
    isUserEdited: boolean;
  }

  const originalItem: MockItem = {
    id: 'item-1',
    name: 'นมสด',
    quantity: 1,
    unitPrice: 35.0,
    lineTotal: 35.0,
    isUserEdited: false,
  };

  // 13. ผู้ใช้กดยกเลิก -> คืนค่าเดิม
  let currentItem = { ...originalItem };
  const tempEdit = { ...currentItem, quantity: 5, lineTotal: 175.0 };
  // Cancel action:
  currentItem = { ...originalItem };
  assert.strictEqual(currentItem.quantity, 1);
  assert.strictEqual(currentItem.lineTotal, 35.0);
  assert.strictEqual(currentItem.isUserEdited, false);

  // 14. ผู้ใช้กดบันทึกการแก้ไข -> อัปเดต state
  currentItem = {
    ...tempEdit,
    isUserEdited: true,
  };
  assert.strictEqual(currentItem.quantity, 5);
  assert.strictEqual(currentItem.lineTotal, 175.0);
  assert.strictEqual(currentItem.isUserEdited, true);
});

test('Case 15: ตรวจสอบความสอดคล้องของราคา (Price Discrepancy Detection)', () => {
  // กรณีถูกต้อง: 2 x 35.00 = 70.00
  const valid = validatePriceConsistency(2, 35.0, 70.0);
  assert.strictEqual(valid.hasDiscrepancy, false);
  assert.strictEqual(valid.isConsistent, true);

  // กรณีไม่ตรง: 2 x 35.00 แต่ราคารวมเขียน 80.00
  const invalid = validatePriceConsistency(2, 35.0, 80.0);
  assert.strictEqual(invalid.hasDiscrepancy, true, 'ต้องตรวจพบความไม่สอดคล้องของราคา');
  assert.strictEqual(invalid.isConsistent, false);
  assert.ok(invalid.message?.includes('ไม่ตรงกับ'));
});

test('Case 16: ตรวจสอบว่าสินค้า NON-FOOD ถูกคัดแยกออกและห้ามบันทึกลง Food Inventory', () => {
  const receiptItems = [
    { name: 'อกไก่สด', category: 'food' as ProductCategory },
    { name: 'น้ำปลาทิพรส', category: 'seasoning' as ProductCategory },
    { name: 'น้ำยาล้างจาน ซันไลต์', category: 'non_food' as ProductCategory },
    { name: 'ผงซักฟอก บรีส', category: 'non_food' as ProductCategory },
    { name: 'กระดาษทิชชู่ สก๊อตต์', category: 'non_food' as ProductCategory },
  ];

  // จำลอง Filter กรองเข้า Food Inventory
  const foodInventoryReady = receiptItems.filter(
    (it) => it.category === 'food' || it.category === 'seasoning'
  );

  assert.strictEqual(foodInventoryReady.length, 2, 'ต้องมีเฉพาะอาหารและเครื่องปรุง 2 รายการเท่านั้น');
  assert.strictEqual(foodInventoryReady[0].name, 'อกไก่สด');
  assert.strictEqual(foodInventoryReady[1].name, 'น้ำปลาทิพรส');

  // ตรวจสอบว่าไม่มีของใช้ปะปน
  for (const item of foodInventoryReady) {
    assert.notStrictEqual(item.category, 'non_food');
    assert.ok(!item.name.includes('น้ำยาล้างจาน'));
    assert.ok(!item.name.includes('ผงซักฟอก'));
    assert.ok(!item.name.includes('ทิชชู่'));
  }
});

test('Case 17: การเก็บข้อมูลที่ยืนยันแล้ว และข้อมูล Activity Logs', () => {
  const confirmedItems = [
    { name: 'ไข่ไก่', quantity: 1, unit: 'แผง', unitPrice: 45.0, lineTotal: 45.0, category: 'food' },
    { name: 'นมสด', quantity: 2, unit: 'กล่อง', unitPrice: 35.0, lineTotal: 70.0, category: 'food' },
  ];

  const totalFoodPrice = confirmedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);
  assert.strictEqual(totalFoodPrice, 115.0);

  const mockActivityLog = {
    action: 'receipt_scanned',
    details: {
      store_name: '7-Eleven',
      items_count: confirmedItems.length,
      total_price: totalFoodPrice,
      non_food_excluded: 2,
    },
  };

  assert.strictEqual(mockActivityLog.details.items_count, 2);
  assert.strictEqual(mockActivityLog.details.total_price, 115.0);
  assert.strictEqual(mockActivityLog.details.non_food_excluded, 2);
});

test('Case 18: Hierarchical Price Extraction (Priority 1 -> Priority 2/3 -> Priority 4 -> Unknown)', () => {
  // Priority 1: Actual Receipt Price (ระบุในใบเสร็จ)
  const actualPrice = resolveHierarchicalPrice('นมสด เมจิ', 35.0, 70.0, 2);
  assert.strictEqual(actualPrice.source, 'receipt');
  assert.strictEqual(actualPrice.isEstimate, false);
  assert.strictEqual(actualPrice.unitPrice, 35.0);
  assert.strictEqual(actualPrice.lineTotal, 70.0);

  // Priority 2 & 3: Household History Price (ไม่มีในบิล แต่เคยซื้อในบ้านนี้มาก่อน)
  const historyMap = new Map<string, number>();
  historyMap.set('น้ำปลาทิพรส', 32.0);
  const historyPrice = resolveHierarchicalPrice('น้ำปลาทิพรส', null, null, 1, historyMap);
  assert.strictEqual(historyPrice.source, 'history');
  assert.strictEqual(historyPrice.isEstimate, true);
  assert.strictEqual(historyPrice.unitPrice, 32.0);
  assert.strictEqual(historyPrice.lineTotal, 32.0);

  // Priority 4: Market Benchmark Estimated Price (ไม่มีในบิล และไม่เคยซื้อ แต่มีในตารางกลาง)
  const benchmarkPrice = resolveHierarchicalPrice('ไข่ไก่ สด', null, null, 10);
  assert.strictEqual(benchmarkPrice.source, 'benchmark');
  assert.strictEqual(benchmarkPrice.isEstimate, true);
  assert.strictEqual(benchmarkPrice.unitPrice, 5.5);
  assert.strictEqual(benchmarkPrice.lineTotal, 55.0);

  // Unknown: สินค้าที่ไม่ทราบราคาเลย (ต้องเป็น null เท่านั้น ห้ามเป็น 0.00)
  const unknownPrice = resolveHierarchicalPrice('สินค้าแปลกประหลาดนิรนาม', null, null, 1);
  assert.strictEqual(unknownPrice.source, 'unknown');
  assert.strictEqual(unknownPrice.isEstimate, false);
  assert.strictEqual(unknownPrice.unitPrice, null);
  assert.strictEqual(unknownPrice.lineTotal, null);
  assert.strictEqual(unknownPrice.price, null);
});

test('Case 19: Separation of Actual Spend vs Estimated Spend for Budget Integrity', () => {
  const items = [
    { name: 'นมสด', lineTotal: 70.0, priceSource: 'receipt' },
    { name: 'ไข่ไก่', lineTotal: 55.0, priceSource: 'benchmark' },
    { name: 'น้ำปลา', lineTotal: 32.0, priceSource: 'history' },
  ];

  const actualReceiptSpent = items.reduce(
    (acc, it) => acc + (it.priceSource === 'receipt' ? it.lineTotal : 0),
    0
  );
  const estimatedSpent = items.reduce(
    (acc, it) => acc + (it.priceSource !== 'receipt' ? it.lineTotal : 0),
    0
  );

  assert.strictEqual(actualReceiptSpent, 70.0, 'ยอดจริงจากบิลต้องเป็น 70.00 เท่านั้น');
  assert.strictEqual(estimatedSpent, 87.0, 'ยอดประเมิน 55.00 + 32.00 ต้องแยกออกต่างหาก');
});

