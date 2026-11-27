import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProductSemantically,
  sanitizeProductName,
  isOcrNoiseOrReceiptMetadata,
  getEstimatedPriceBenchmark,
} from '../src/lib/productClassifier';

// ============================================================
// 1. FOOD TESTS (หมวด A: อาหารและเครื่องดื่ม)
// ============================================================
test('Food Test Suite: สินค้าอาหารต้องถูกจำแนกเป็น food หรือ seasoning พร้อมนับเป็นอาหาร', () => {
  const foodSamples = [
    'ไข่ไก่',
    'นมสด',
    'ผักบุ้ง',
    'เนื้อหมู',
    'ปลา',
    'ข้าวสาร',
    'ขนมปัง',
    'น้ำดื่ม',
    'อกไก่สด',
    'กุ้งขาว',
    'ข้าวหอมมะลิ',
    'แอปเปิ้ลฟูจิ',
  ];

  for (const item of foodSamples) {
    const res = classifyProductSemantically(item);
    assert.strictEqual(
      res.isFoodOrSeasoning,
      true,
      `สินค้าอาหาร "${item}" ต้องมี isFoodOrSeasoning = true`
    );
    assert.ok(
      res.category === 'food' || res.category === 'seasoning',
      `"${item}" ควรถูกจำแนกเป็น food หรือ seasoning (ได้: ${res.category})`
    );
    assert.ok(
      res.confidence >= 0.90,
      `"${item}" ต้องมี confidence >= 0.90 (ได้: ${res.confidence})`
    );
  }
});

// ============================================================
// 2. SEASONING TESTS (หมวด B: เครื่องปรุงและส่วนประกอบอาหาร)
// ============================================================
test('Seasoning Test Suite: เครื่องปรุงต้องถูกจำแนกเป็น seasoning และต้องนับเป็น FOOD (ห้ามตัดทิ้ง)', () => {
  const seasoningSamples = [
    'น้ำปลา',
    'ซีอิ๊วขาว',
    'ซอสหอยนางรม',
    'น้ำมันพืช',
    'น้ำตาล',
    'เกลือ',
    'ผงชูรส',
    'ผงปรุงรส',
    'พริกไทย',
    'เครื่องแกง',
    'น้ำส้มสายชู',
    'ซอสปรุงรสฝาเขียว',
    'คนอร์ซุปก้อน',
    'ผงพะโล้',
  ];

  for (const item of seasoningSamples) {
    const res = classifyProductSemantically(item);
    assert.strictEqual(
      res.category,
      'seasoning',
      `เครื่องปรุง "${item}" ต้องถูกจำแนกเป็น category = 'seasoning' (ได้: ${res.category})`
    );
    assert.strictEqual(
      res.isFoodOrSeasoning,
      true,
      `เครื่องปรุง "${item}" ต้องนับเป็นส่วนประกอบอาหาร (isFoodOrSeasoning = true)`
    );
    assert.strictEqual(
      res.needsReview,
      false,
      `เครื่องปรุงมาตรฐาน "${item}" ไม่ควรติดสถานะ needsReview`
    );
  }
});

// ============================================================
// 3. NON-FOOD TESTS (หมวด C: ของใช้ทั่วไปและผลิตภัณฑ์ทำความสะอาด)
// ============================================================
test('Non-Food Test Suite: ของใช้ต้องถูกตัดออกจาก Food Inventory 100%', () => {
  const nonFoodSamples = [
    'น้ำยาล้างจาน',
    'น้ำยาล้างจาน ซันไลต์',
    'ผงซักฟอก',
    'ผงซักฟอก บรีสเอกเซล',
    'น้ำยาปรับผ้านุ่ม',
    'แชมพู',
    'ครีมนวดผม',
    'ยาสีฟัน',
    'สบู่',
    'สบู่เหลว เดทตอล',
    'ทิชชู่',
    'กระดาษทิชชู่ สก๊อตต์',
    'ถุงขยะ',
    'ถุงขยะดำ แชมเปี้ยน',
    'ฟองน้ำล้างจาน',
    'น้ำยาถูพื้น',
    'น้ำยาล้างห้องน้ำ เป็ดโปร',
  ];

  for (const item of nonFoodSamples) {
    const res = classifyProductSemantically(item);
    assert.strictEqual(
      res.category,
      'non_food',
      `ของใช้ "${item}" ต้องถูกจำแนกเป็น non_food (ได้: ${res.category})`
    );
    assert.strictEqual(
      res.isFoodOrSeasoning,
      false,
      `ของใช้ "${item}" ต้องมี isFoodOrSeasoning = false ห้ามเข้าตู้เย็นเด็ดขาด`
    );
    assert.ok(
      res.confidence >= 0.90,
      `"${item}" ต้องมีความมั่นใจสูง (>= 0.90) ในการคัดออก (ได้: ${res.confidence})`
    );
  }
});

// ============================================================
// 4. CONTEXTUAL SEMANTIC DISAMBIGUATION TESTS
// ============================================================
test('Semantic Disambiguation: แยกแยะคำที่มีคำนำหน้าคล้ายกันแต่ความหมายต่างกันอย่างสิ้นเชิง', () => {
  // น้ำปลา (เครื่องปรุง) VS น้ำยาล้างจาน (ของใช้) VS น้ำดื่ม (อาหาร)
  const fishSauce = classifyProductSemantically('น้ำปลา ทิพรส');
  const dishSoap = classifyProductSemantically('น้ำยาล้างจาน ซันไลต์ 750ml');
  const drinkWater = classifyProductSemantically('น้ำดื่ม คริสตัล 1500ml');

  assert.strictEqual(fishSauce.category, 'seasoning');
  assert.strictEqual(dishSoap.category, 'non_food');
  assert.strictEqual(drinkWater.category, 'food');

  // ผงปรุงรส (เครื่องปรุง) VS ผงซักฟอก (ของใช้)
  const seasoningPowder = classifyProductSemantically('ผงปรุงรส รสดีหมู');
  const detergent = classifyProductSemantically('ผงซักฟอก โอโมพลัส');

  assert.strictEqual(seasoningPowder.category, 'seasoning');
  assert.strictEqual(detergent.category, 'non_food');

  // เกลือแกง (เครื่องปรุง) VS เกลือขัดผิว (ของใช้)
  const tableSalt = classifyProductSemantically('เกลือบริโภค ปรุงทิพย์');
  const scrubSalt = classifyProductSemantically('เกลือขัดผิว โยโกะ');

  assert.strictEqual(tableSalt.category, 'seasoning');
  assert.strictEqual(scrubSalt.category, 'non_food');

  // ซอสปรุงรส (เครื่องปรุง) VS สบู่เหลว (ของใช้)
  const sauce = classifyProductSemantically('ซอสปรุงรส แม็กกี้');
  const liquidSoap = classifyProductSemantically('สบู่เหลว โพรเทคส์');

  assert.strictEqual(sauce.category, 'seasoning');
  assert.strictEqual(liquidSoap.category, 'non_food');
});

// ============================================================
// 5. AMBIGUOUS & OCR NOISE TESTS (ตัวอักษรขยะ และข้อมูลใบเสร็จ)
// ============================================================
test('Ambiguous & OCR Noise: ข้อความขยะและข้อมูลใบเสร็จต้องถูกปฏิเสธหรือไม่ให้เป็น Food อัตโนมัติ', () => {
  const noiseSamples = [
    'V 1m',
    'Vw',
    'nm',
    'TOTAL',
    'SUBTOTAL',
    'VAT 7%',
    'CHANGE',
    'CASH',
    'ยอดรวมทั้งสิ้น',
    'ภาษีมูลค่าเพิ่ม',
    'เงินทอน',
    'ใบกำกับภาษีอย่างย่อ',
    'ขอบคุณที่ใช้บริการ',
    '***',
    '---',
    '01',
    '1234567890',
  ];

  for (const noise of noiseSamples) {
    const isNoise = isOcrNoiseOrReceiptMetadata(noise);
    const classification = classifyProductSemantically(noise);

    assert.ok(
      isNoise || classification.category === 'unknown',
      `ข้อความขยะ "${noise}" ต้องถูกตรวจพบว่าเป็น Noise หรือ unknown`
    );
    assert.strictEqual(
      classification.isFoodOrSeasoning,
      false,
      `ข้อความขยะ "${noise}" ห้ามถือว่าเป็นอาหาร (isFoodOrSeasoning = false)`
    );
  }
});

// ============================================================
// 6. SANITIZATION & PRICE / EXPIRY INTEGRITY TESTS
// ============================================================
test('Data Integrity: การทำความสะอาดชื่อสินค้า และตรวจสอบการไม่เติม 0.00 หรือวันหมดอายุปลอม', () => {
  // ล้างตัวเลขนำหน้าและราคาท้ายบรรทัด
  assert.strictEqual(
    sanitizeProductName('1. ข้าวผัดพริก กระเพรา 45.00V บาท'),
    'ข้าวผัดพริก กระเพรา'
  );
  assert.strictEqual(
    sanitizeProductName('02- นมสด เมจิ รสจืด 26.50 บาท'),
    'นมสด เมจิ รสจืด'
  );
  assert.strictEqual(
    sanitizeProductName('* ไข่ไก่ เบอร์ 2 แพ็ก 10 ฟอง'),
    'ไข่ไก่ เบอร์ 2 แพ็ก 10 ฟอง'
  );

  // คำสั้นเกินไปหรือขยะต้องได้ค่าว่าง
  assert.strictEqual(sanitizeProductName('Vw'), '');
  assert.strictEqual(sanitizeProductName('***'), '');
});

// ============================================================
// 7. BENCHMARK ESTIMATED PRICE TESTS
// ============================================================
test('Benchmark Price: การดึงราคาประเมินมาตรฐานเมื่อไม่มีราคาจากใบเสร็จ', () => {
  const egg = getEstimatedPriceBenchmark('ไข่ไก่ เบอร์ 2');
  assert.strictEqual(egg.isEstimate, true);
  assert.strictEqual(egg.estimatedPrice, 5.5);
  assert.strictEqual(egg.benchmarkUnit, 'ฟอง');

  const pork = getEstimatedPriceBenchmark('เนื้อหมู สันนอก');
  assert.strictEqual(pork.isEstimate, true);
  assert.strictEqual(pork.estimatedPrice, 120.0);

  const milk = getEstimatedPriceBenchmark('นมสด พาสเจอร์ไรส์');
  assert.strictEqual(milk.isEstimate, true);
  assert.strictEqual(milk.estimatedPrice, 45.0);

  const unknown = getEstimatedPriceBenchmark('สินค้าแปลกประหลาดที่ไม่รู้จัก');
  assert.strictEqual(unknown.isEstimate, false);
  assert.strictEqual(unknown.estimatedPrice, null);
});

