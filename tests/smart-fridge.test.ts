import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBangkokTodayString,
  addDaysFromBangkokToday,
  getDaysUntilExpiry,
  getExpiryStatusCategory,
  isExpiredDate,
  formatExpiryLabel,
  normalizeDateString,
} from '../src/lib/date';

import {
  classifyIngredients,
  getIngredientWeight,
  pickWeightedFocusIngredients,
  validateGeneratedRecipes,
} from '../src/lib/recipeEngine';

// อ้างอิงเวลาประเทศไทยสองช่วงเวลาเพื่อทดสอบปัญหา UTC Midnight Boundary:
// - 00:30 น. เวลาไทย (ตรงกับ 17:30 น. ของ "เมื่อวาน" ใน UTC!)
// - 23:30 น. เวลาไทย (ตรงกับ 16:30 น. ของ "วันนี้" ใน UTC)
const BANGKOK_EARLY_MORNING = new Date('2026-11-18T00:30:00+07:00');
const BANGKOK_LATE_NIGHT = new Date('2026-11-18T23:30:00+07:00');

// ============================================================
// EXPIRATION DATE TEST CASES (10 CASES — PART 9)
// ============================================================

test('Date Case 1: หมดอายุวันนี้ = 0 วัน (ทั้งช่วง 00:30 น. และ 23:30 น. เวลาไทย)', () => {
  assert.equal(getBangkokTodayString(BANGKOK_EARLY_MORNING), '2026-11-18');
  assert.equal(getBangkokTodayString(BANGKOK_LATE_NIGHT), '2026-11-18');
  assert.equal(getDaysUntilExpiry('2026-11-18', BANGKOK_EARLY_MORNING), 0);
  assert.equal(getDaysUntilExpiry('2026-11-18', BANGKOK_LATE_NIGHT), 0);
  assert.equal(getExpiryStatusCategory('2026-11-18', 5, BANGKOK_EARLY_MORNING), 'today');
  assert.equal(isExpiredDate('2026-11-18', BANGKOK_EARLY_MORNING), false);
  assert.equal(formatExpiryLabel(0), 'หมดอายุวันนี้');
});

test('Date Case 2: หมดอายุพรุ่งนี้ = เหลือ 1 วัน', () => {
  assert.equal(getDaysUntilExpiry('2026-11-19', BANGKOK_EARLY_MORNING), 1);
  assert.equal(getDaysUntilExpiry('2026-11-19', BANGKOK_LATE_NIGHT), 1);
  assert.equal(getExpiryStatusCategory('2026-11-19', 5, BANGKOK_EARLY_MORNING), 'expiring_soon');
  assert.equal(isExpiredDate('2026-11-19', BANGKOK_EARLY_MORNING), false);
  assert.equal(formatExpiryLabel(1), 'หมดอายุพรุ่งนี้ (เหลือ 1 วัน)');
});

test('Date Case 3: หมดอายุอีก 3 วัน = เหลือ 3 วัน (ไม่พลิกเป็นหมดอายุมาแล้ว 3 วัน)', () => {
  assert.equal(getDaysUntilExpiry('2026-11-21', BANGKOK_EARLY_MORNING), 3);
  assert.equal(getDaysUntilExpiry('2026-11-21', BANGKOK_LATE_NIGHT), 3);
  assert.equal(getExpiryStatusCategory('2026-11-21', 5, BANGKOK_EARLY_MORNING), 'expiring_soon');
  assert.equal(isExpiredDate('2026-11-21', BANGKOK_EARLY_MORNING), false);
  assert.equal(formatExpiryLabel(3), 'เหลือ 3 วัน');
});

test('Date Case 4: หมดอายุอีก 7 วัน = เหลือ 7 วัน (fresh)', () => {
  assert.equal(getDaysUntilExpiry('2026-11-25', BANGKOK_EARLY_MORNING), 7);
  assert.equal(getExpiryStatusCategory('2026-11-25', 5, BANGKOK_EARLY_MORNING), 'fresh');
  assert.equal(isExpiredDate('2026-11-25', BANGKOK_EARLY_MORNING), false);
});

test('Date Case 5: หมดอายุเมื่อวาน = -1 วัน (expired)', () => {
  assert.equal(getDaysUntilExpiry('2026-11-17', BANGKOK_EARLY_MORNING), -1);
  assert.equal(getDaysUntilExpiry('2026-11-17', BANGKOK_LATE_NIGHT), -1);
  assert.equal(getExpiryStatusCategory('2026-11-17', 5, BANGKOK_EARLY_MORNING), 'expired');
  assert.equal(isExpiredDate('2026-11-17', BANGKOK_EARLY_MORNING), true);
  assert.equal(formatExpiryLabel(-1), 'หมดอายุมาแล้ว 1 วัน');
});

test('Date Case 6: หมดอายุมาแล้ว 3 วัน = -3 วัน (expired)', () => {
  assert.equal(getDaysUntilExpiry('2026-11-15', BANGKOK_EARLY_MORNING), -3);
  assert.equal(getExpiryStatusCategory('2026-11-15', 5, BANGKOK_EARLY_MORNING), 'expired');
  assert.equal(formatExpiryLabel(-3), 'หมดอายุมาแล้ว 3 วัน');
});

test('Date Case 7: ไม่ระบุวันหมดอายุ = null (ห้ามเดาว่าหมดอายุ)', () => {
  assert.equal(getDaysUntilExpiry(null, BANGKOK_EARLY_MORNING), null);
  assert.equal(getDaysUntilExpiry('', BANGKOK_EARLY_MORNING), null);
  assert.equal(getExpiryStatusCategory(null, 5, BANGKOK_EARLY_MORNING), 'none');
  assert.equal(isExpiredDate(null, BANGKOK_EARLY_MORNING), false);
  assert.equal(formatExpiryLabel(null), 'ไม่ระบุวันหมดอายุ');
});

test('Date Case 8: กรอก "หมดอายุในอีก 3 วัน" แทน Date Picker -> todayBangkok + 3 วันตรงเป๊ะ', () => {
  const computedEarly = addDaysFromBangkokToday(3, BANGKOK_EARLY_MORNING);
  const computedLate = addDaysFromBangkokToday(3, BANGKOK_LATE_NIGHT);
  assert.equal(computedEarly, '2026-11-21');
  assert.equal(computedLate, '2026-11-21');
  assert.equal(getDaysUntilExpiry(computedEarly, BANGKOK_EARLY_MORNING), 3);
});

test('Date Case 9: ตั้งค่าแจ้งเตือนล่วงหน้า 3 วัน ไม่เปลี่ยนแปลงค่า expiry_date จริง', () => {
  const expiryDate = addDaysFromBangkokToday(10, BANGKOK_EARLY_MORNING);
  const reminderBeforeDays = 3;
  // แจ้งเตือนล่วงหน้าคือ metadata แยกต่างหาก ไม่เปลี่ยน expiryDate
  assert.equal(expiryDate, '2026-11-28');
  assert.equal(getDaysUntilExpiry(expiryDate, BANGKOK_EARLY_MORNING), 10);
  assert.equal(reminderBeforeDays, 3);
});

test('Date Case 10: บันทึกและเปิดข้อมูลเดิมอีกครั้ง (Round-trip) วันที่ต้องไม่คลาดเคลื่อน', () => {
  const saved = normalizeDateString('2026-11-21');
  assert.equal(saved, '2026-11-21');
  // จำลอง DB คืนค่ามาเป็น DATE string หรือ ISO Timestamp prefix
  assert.equal(normalizeDateString('2026-11-21T00:00:00.000Z'), '2026-11-21');
  assert.equal(getDaysUntilExpiry(saved, BANGKOK_EARLY_MORNING), 3);
  assert.equal(getDaysUntilExpiry(saved, BANGKOK_LATE_NIGHT), 3);
});

// ============================================================
// AI RECIPE ENGINE TEST CASES (8 CASES — PART 9)
// ============================================================

test('AI Case 1: ตู้เย็นมีวัตถุดิบสดใหม่ทั้งหมด', () => {
  const res = classifyIngredients(
    [
      { name: 'ไข่ไก่', quantity: 10, expiryDate: '2026-12-01' },
      { name: 'ข้าวสวย', quantity: 2, expiryDate: null },
    ],
    5,
    BANGKOK_EARLY_MORNING
  );
  assert.equal(res.expired.length, 0);
  assert.equal(res.expiringSoon.length, 0);
  assert.equal(res.fresh.length, 2);
  assert.equal(res.usable.length, 2);
});

test('AI Case 2: ตู้เย็นมีวัตถุดิบใกล้หมดอายุ (ได้คะแนน Weight สูงกว่าสดใหม่)', () => {
  const items = [
    { name: 'ผักบุ้ง', quantity: 1, expiryDate: '2026-11-18' }, // today -> weight 4.0
    { name: 'อกไก่', quantity: 1, expiryDate: '2026-11-20' }, // +2d -> weight 3.0
  ];
  const res = classifyIngredients(items, 5, BANGKOK_EARLY_MORNING);
  assert.equal(res.expiringSoon.length, 2);
  assert.equal(res.expired.length, 0);
  assert.equal(getIngredientWeight(res.expiringSoon[0], BANGKOK_EARLY_MORNING), 4.0);
  assert.equal(getIngredientWeight(res.expiringSoon[1], BANGKOK_EARLY_MORNING), 3.0);
});

test('AI Case 3: ตู้เย็นมีทั้งวัตถุดิบใกล้หมดอายุและสดใหม่', () => {
  const res = classifyIngredients(
    [
      { name: 'หมูสับ', quantity: 1, expiryDate: '2026-11-19' },
      { name: 'แครอท', quantity: 2, expiryDate: '2026-11-30' },
    ],
    5,
    BANGKOK_EARLY_MORNING
  );
  assert.equal(res.expiringSoon.length, 1);
  assert.equal(res.fresh.length, 1);
  assert.equal(res.usable.length, 2);
});

test('AI Case 4: ตู้เย็นมีวัตถุดิบหมดอายุปะปนกับวัตถุดิบที่ยังใช้ได้ (ต้องตัดของหมดอายุออก 100%)', () => {
  const res = classifyIngredients(
    [
      { name: 'นมบูด', quantity: 1, expiryDate: '2026-11-15' }, // -3d EXPIRED
      { name: 'ผักเน่า', quantity: 1, expiryDate: '2026-11-17' }, // -1d EXPIRED
      { name: 'ไข่ไก่', quantity: 6, expiryDate: '2026-11-20' }, // +2d USABLE
      { name: 'ข้าวสาร', quantity: 1, expiryDate: null }, // USABLE
    ],
    5,
    BANGKOK_EARLY_MORNING
  );
  assert.equal(res.expired.length, 2);
  assert.equal(res.usable.length, 2);
  assert.equal(getIngredientWeight(res.expired[0], BANGKOK_EARLY_MORNING), 0);
  assert.ok(!res.usable.some((i) => i.name === 'นมบูด' || i.name === 'ผักเน่า'));
});

test('AI Case 5: ตู้เย็นมีแต่วัตถุดิบหมดอายุ -> usable ว่างเปล่า (ห้ามสุ่มเมนู)', () => {
  const res = classifyIngredients(
    [
      { name: 'เนื้อหมดอายุ', quantity: 1, expiryDate: '2026-11-10' },
      { name: 'โยเกิร์ตหมดอายุ', quantity: 2, expiryDate: '2026-11-17' },
    ],
    5,
    BANGKOK_EARLY_MORNING
  );
  assert.equal(res.expired.length, 2);
  assert.equal(res.usable.length, 0);
});

test('AI Case 6: ตู้เย็นไม่มีวัตถุดิบเลย', () => {
  const res = classifyIngredients([], 5, BANGKOK_EARLY_MORNING);
  assert.equal(res.usable.length, 0);
  assert.equal(res.expired.length, 0);
});

test('AI Case 7: Weighted Random มีความหลากหลายและให้น้ำหนักของใกล้หมดอายุสูงกว่า', () => {
  const usable = [
    { name: 'ไก่ใกล้หมด', quantity: 1, expiryDate: '2026-11-18' }, // weight 4
    { name: 'ผักสด', quantity: 1, expiryDate: '2026-11-30' }, // weight 1
    { name: 'แครอทสด', quantity: 1, expiryDate: '2026-12-02' }, // weight 1
  ];
  let expiringFirstCount = 0;
  let freshFirstCount = 0;
  // ใช้ deterministic LCG RNG เพื่อความเสถียรของ unit test
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 200; i++) {
    const picked = pickWeightedFocusIngredients(usable, 1, rng, BANGKOK_EARLY_MORNING);
    if (picked[0].name === 'ไก่ใกล้หมด') expiringFirstCount++;
    else freshFirstCount++;
  }
  assert.ok(expiringFirstCount > freshFirstCount, 'ของใกล้หมดอายุต้องถูกเลือกบ่อยกว่าของสด');
  assert.ok(freshFirstCount > 0, 'ของสดใหม่ต้องมีโอกาสถูกสุ่มเพื่อความหลากหลายด้วย');
});

test('AI Case 8: Post-AI Validation ปฏิเสธเมนูที่แอบใช้วัตถุดิบหมดอายุ และตรวจ inFridge กับของจริง', () => {
  const usable = [
    { name: 'ไข่ไก่', quantity: 6, expiryDate: '2026-11-22' },
    { name: 'มะเขือเทศ', quantity: 3, expiryDate: '2026-11-20' },
  ];
  const expired = [{ name: 'นมบูด', quantity: 1, expiryDate: '2026-11-15' }];

  const aiCandidates = [
    {
      name: 'ซุปครีมนมบูด',
      ingredients: [
        { name: 'นมบูด', amount: '1 แก้ว', inFridge: true },
        { name: 'ไข่ไก่', amount: '2 ฟอง', inFridge: true },
      ],
      steps: ['ต้มให้เดือด'],
    },
    {
      name: 'ไข่ผัดมะเขือเทศ',
      ingredients: [
        { name: 'ไข่ไก่', amount: '2 ฟอง', inFridge: true },
        { name: 'มะเขือเทศ', amount: '2 ลูก', inFridge: true },
        // จำลอง LLM หลอนว่ามีกุ้งมังกรในตู้เย็น ทั้งที่ไม่มีจริง!
        { name: 'กุ้งมังกร', amount: '1 ตัว', inFridge: true },
      ],
      steps: ['ผัดไข่กับมะเขือเทศจนสุก'],
    },
  ];

  const validation = validateGeneratedRecipes(aiCandidates, usable, expired, 'ตู้เย็นหลัก');
  assert.equal(validation.rejectedCount, 1);
  assert.equal(validation.validRecipes.length, 1);
  assert.equal(validation.validRecipes[0].name, 'ไข่ผัดมะเขือเทศ');

  const lobster = validation.validRecipes[0].ingredients.find((i) => i.name === 'กุ้งมังกร');
  assert.equal(lobster?.inFridge, false, 'วัตถุดิบที่ไม่มีจริงต้องถูกแก้เป็น inFridge: false');
  const egg = validation.validRecipes[0].ingredients.find((i) => i.name === 'ไข่ไก่');
  assert.equal(egg?.inFridge, true);
  assert.equal(egg?.location, 'มีใน ตู้เย็นหลัก');
});
