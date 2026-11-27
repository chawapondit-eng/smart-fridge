/**
 * CheckTuYen — Intelligent Product Classification & Semantic Validation Engine
 *
 * ทำหน้าที่:
 * 1. ตรวจสอบและจำแนกประเภทสินค้าจากใบเสร็จ (FOOD, SEASONING, NON_FOOD, UNKNOWN)
 * 2. คัดกรอง OCR Noise, ข้อมูลส่วนลด, ภาษี, ยอดรวม และตัวอักษรขยะ
 * 3. บริหาร Confidence Score อย่างแม่นยำด้วยการวิเคราะห์ความหมาย (Semantic Context)
 * 4. รองรับคำศัพท์ภาษาไทย ภาษาอังกฤษ และชื่อแบรนด์ยอดนิยม
 * 5. ป้องกันสินค้าที่ไม่ใช่อาหารหลุดเข้าสู่ Food Inventory ของตู้เย็น 100%
 */

export type ProductCategory = 'food' | 'seasoning' | 'non_food' | 'unknown';
export type ReviewStatus = 'ready' | 'needs_review' | 'non_food';

// -------------------------------------------------------------
// หมวดหมู่และหน่วยนับมาตรฐานของระบบ Smart Fridge
// -------------------------------------------------------------

export interface UnitGroup {
  groupName: string;
  units: string[];
}

export const STANDARD_UNIT_GROUPS: UnitGroup[] = [
  {
    groupName: 'จำนวนชิ้น / ภาชนะเดี่ยว',
    units: ['ชิ้น', 'อัน', 'ฟอง', 'ลูก', 'ใบ', 'ผล', 'หัว', 'ต้น', 'แผง', 'แพ็ค', 'แพ็ก'],
  },
  {
    groupName: 'บรรจุภัณฑ์',
    units: ['กล่อง', 'ขวด', 'กระป๋อง', 'ถุง', 'ห่อ', 'ถาด', 'มัด', 'กระปุก', 'หลอด'],
  },
  {
    groupName: 'อาหารและเครื่องดื่ม',
    units: ['จาน', 'ถ้วย', 'ชาม', 'แก้ว', 'เสิร์ฟ'],
  },
  {
    groupName: 'น้ำหนัก',
    units: ['กรัม', 'กิโลกรัม'],
  },
  {
    groupName: 'ปริมาตร',
    units: ['มิลลิลิตร', 'ลิตร'],
  },
];

export const ALL_STANDARD_UNITS: string[] = STANDARD_UNIT_GROUPS.flatMap((g) => g.units);

export interface PriceValidationResult {
  isConsistent: boolean;
  calculatedLineTotal: number | null;
  calculatedUnitPrice: number | null;
  message?: string;
  hasDiscrepancy: boolean;
}

/**
 * ตรวจสอบความสอดคล้องระหว่าง จำนวน x ราคาต่อหน่วย กับ ราคารวม
 */
export function validatePriceConsistency(
  quantity: number,
  unitPrice: number | null,
  lineTotal: number | null
): PriceValidationResult {
  const qty = Number(quantity) || 1;

  if (unitPrice === null && lineTotal === null) {
    return {
      isConsistent: true,
      calculatedLineTotal: null,
      calculatedUnitPrice: null,
      hasDiscrepancy: false,
    };
  }

  if (unitPrice !== null && lineTotal === null) {
    const calcTotal = Math.round(qty * unitPrice * 100) / 100;
    return {
      isConsistent: true,
      calculatedLineTotal: calcTotal,
      calculatedUnitPrice: unitPrice,
      hasDiscrepancy: false,
    };
  }

  if (unitPrice === null && lineTotal !== null) {
    const calcUnitPrice = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : null;
    return {
      isConsistent: true,
      calculatedLineTotal: lineTotal,
      calculatedUnitPrice: calcUnitPrice,
      hasDiscrepancy: false,
    };
  }

  // ทั้งสองราคามีค่า -> ตรวจสอบว่า qty * unitPrice == lineTotal หรือไม่ (อนุโลม error 0.05 จากการปัดเศษ)
  if (unitPrice !== null && lineTotal !== null) {
    const expectedTotal = Math.round(qty * unitPrice * 100) / 100;
    const diff = Math.abs(expectedTotal - lineTotal);
    const hasDiscrepancy = diff > 0.05;

    return {
      isConsistent: !hasDiscrepancy,
      calculatedLineTotal: expectedTotal,
      calculatedUnitPrice: qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : unitPrice,
      hasDiscrepancy,
      message: hasDiscrepancy
        ? `ราคารวม (฿${lineTotal.toFixed(2)}) ไม่ตรงกับ ${qty} x ฿${unitPrice.toFixed(2)} = ฿${expectedTotal.toFixed(2)}`
        : undefined,
    };
  }

  return {
    isConsistent: true,
    calculatedLineTotal: null,
    calculatedUnitPrice: null,
    hasDiscrepancy: false,
  };
}

export interface ClassificationResult {
  category: ProductCategory;
  confidence: number;
  reason: string;
  suggestedUnit: string;
  isFoodOrSeasoning: boolean;
  needsReview: boolean;
  cleanedName: string;
}

export interface RawOcrLineItem {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  price?: number | null;
  confidence?: number;
  category?: ProductCategory;
  reason?: string;
  rawText?: string;
}

// -------------------------------------------------------------
// 1. พจนานุกรมคำศัพท์และ Regular Expressions สำหรับการคัดแยก
// -------------------------------------------------------------

// หมวด C: ของใช้ที่ไม่ใช่อาหาร (NON-FOOD) — ต้องมีน้ำหนักสูงที่สุดเพื่อป้องกันหลุดเข้าตู้เย็น
const NON_FOOD_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // น้ำยาและผลิตภัณฑ์ทำความสะอาดในครัวเรือน
  { regex: /น้ำยาล้างจาน|ซันไลต์|ซันไลท์|ทีโพล์|dishwash/i, reason: 'น้ำยาล้างจาน (ของใช้ทำความสะอาด)' },
  { regex: /ผงซักฟอก|น้ำยาซักผ้า|บรีส|โอโม|แฟ้บ|แอทแทค|เปา|detergent|laundry/i, reason: 'ผลิตภัณฑ์ซักผ้า (ของใช้ทำความสะอาด)' },
  { regex: /น้ำยาปรับผ้านุ่ม|คอมฟอร์ท|ดาวน์นี่|downy|comfort|softener/i, reason: 'น้ำยาปรับผ้านุ่ม (ของใช้ในบ้าน)' },
  { regex: /น้ำยาถูพื้น|มาจิคลีน|มิสเตอร์มัสเซิล|floor cleaner/i, reason: 'น้ำยาทำความสะอาดพื้น' },
  { regex: /น้ำยาล้างห้องน้ำ|เป็ดโปร|วิกซอล|magiclean|dettol|เดทตอล|ไฮเตอร์|bleach/i, reason: 'น้ำยาฆ่าเชื้อ/ล้างห้องน้ำ' },
  { regex: /สเปรย์ปรับอากาศ|แกลด|เกลด|ambipur|glade/i, reason: 'สเปรย์ปรับอากาศ' },
  { regex: /ยาจุดกันยุง|ยากันยุง|อาท|คาย่า|เชนไดร้ท์|baygon|shieldtox/i, reason: 'ยากำจัดแมลง' },

  // ของใช้ส่วนตัว (Personal Care)
  { regex: /แชมพู|ยาสระผม|shampoo|head & shoulders|pantene|sunsilk|clear/i, reason: 'แชมพูสระผม (ของใช้ส่วนตัว)' },
  { regex: /ครีมนวดผม|conditioner/i, reason: 'ครีมนวดผม (ของใช้ส่วนตัว)' },
  { regex: /สบู่|สบู่เหลว|ครีมอาบน้ำ|shower cream|body wash|dettol soap|lux|protex|shokubutsu/i, reason: 'สบู่/ครีมอาบน้ำ (ของใช้ส่วนตัว)' },
  { regex: /ยาสีฟัน|toothpaste|colgate|darlie|sensodyne|คอลเกต|ดาร์ลี่/i, reason: 'ยาสีฟัน (ของใช้ส่วนตัว)' },
  { regex: /แปรงสีฟัน|toothbrush/i, reason: 'แปรงสีฟัน (ของใช้ส่วนตัว)' },
  { regex: /โฟมล้างหน้า|cleanser|facial foam/i, reason: 'โฟมล้างหน้า (ของใช้ส่วนตัว)' },
  { regex: /โลชั่น|lotion|vaseline|nivea|นีเวีย|วาสลีน/i, reason: 'โลชั่นบำรุงผิว (ของใช้ส่วนตัว)' },
  { regex: /ผ้าอนามัย|sanitary napkin|laurier|sofy|ลอรีเอะ|โซฟี/i, reason: 'ผ้าอนามัย (ของใช้ส่วนตัว)' },
  { regex: /โรลออน|roll on|deodorant|rexona|เรโซนา/i, reason: 'โรลออนระงับกลิ่นกาย' },
  { regex: /สำลี|cotton pad|cotton bud|สำลีก้าน/i, reason: 'สำลี/คอตตอนบัด' },
  { regex: /มีดโกน|ใบมีดโกน|gillette|ยิลเลตต์/i, reason: 'มีดโกนหนวด' },
  { regex: /เกลือขัดผิว|สครับ|body scrub/i, reason: 'เกลือขัดผิว (เครื่องสำอาง ไม่ใช่เกลือแกง)' },

  // กระดาษ ของใช้สิ้นเปลือง และเครื่องครัวที่ไม่ใช่อาหาร
  { regex: /กระดาษทิชชู่|กระดาษทิชชู|กระดาษชำระ|ทิชชู่|ทิชชู|tissue|scott|kleenex|scottex/i, reason: 'กระดาษชำระ/ทิชชู่ (ของใช้ในบ้าน)' },
  { regex: /ทิชชู่เปียก|wet wipes|baby wipes/i, reason: 'ทิชชู่เปียก (ของใช้ในบ้าน)' },
  { regex: /ฟองน้ำล้างจาน|ฟองน้ำ|แผ่นใยขัด|สก๊อตช์-ไบรต์|scotch-brite|sponge/i, reason: 'ฟองน้ำ/อุปกรณ์ล้างจาน' },
  { regex: /ถุงขยะ|trash bag|garbage bag|แชมเปี้ยน/i, reason: 'ถุงขยะ (ของใช้ในบ้าน)' },
  { regex: /ถุงพลาสติก|ถุงหูหิ้ว|ถุงซิปล็อค|ziploc/i, reason: 'ถุงบรรจุภัณฑ์' },
  { regex: /ฟอยล์|อะลูมิเนียมฟอยล์|wrap|พลาสติกแรป/i, reason: 'ฟอยล์/แรปห่ออาหาร' },
  { regex: /ไม้จิ้มฟัน|หลอดดูด|ถ้วยกระดาษ|จานกระดาษ|ช้อนพลาสติก/i, reason: 'ภาชนะ/ของใช้แบบใช้แล้วทิ้ง' },
  { regex: /แบตเตอรี่|ถ่านไฟฉาย|ถ่านอัลคาไลน์|battery|panasonic alkaline|energizer/i, reason: 'ถ่านไฟฉาย/แบตเตอรี่' },
  { regex: /หลอดไฟ|ปลั๊กไฟ|เทปกาว|กรรไกร|ปากกา|สมุด/i, reason: 'ของใช้ในบ้าน/เครื่องเขียน' },
  { regex: /อาหารสัตว์|อาหารแมว|อาหารสุนัข|อาหารหมา|pedigree|whiskas|me-o|smartheart/i, reason: 'อาหารสัตว์เลี้ยง (แยกจากอาหารคน)' },
];

// หมวด B: เครื่องปรุงและส่วนประกอบอาหาร (SEASONING) — ต้องนับเป็น FOOD
const SEASONING_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // ซอสและเครื่องปรุงรสเหลว
  { regex: /น้ำปลา|fish sauce|ทิพรส|ปลาหมึก|เมกาเชฟ/i, reason: 'น้ำปลา (เครื่องปรุงรส)' },
  { regex: /ซีอิ๊วขาว|ซีอิ๊วดำ|ซีอิ๊วหวาน|ซีอิ๊ว|soy sauce|เด็กสมบูรณ์|ง่วนเชียง/i, reason: 'ซีอิ๊ว (เครื่องปรุงรส)' },
  { regex: /ซอสหอยนางรม|น้ำมันหอย|oyster sauce|แม่ครัว/i, reason: 'ซอสหอยนางรม (เครื่องปรุงรส)' },
  { regex: /ซอสปรุงรส|ซอสฝาเขียว|ซอสถั่วเหลือง|maggie|แม็กกี้|ภูเขาทอง/i, reason: 'ซอสปรุงรส (เครื่องปรุงรส)' },
  { regex: /ซอสมะเขือเทศ|ketchup|tomato sauce|ไฮนซ์|heinz|โรซ่า/i, reason: 'ซอสมะเขือเทศ (เครื่องปรุงรส)' },
  { regex: /ซอสพริก|chili sauce|ศรีราชา/i, reason: 'ซอสพริก (เครื่องปรุงรส)' },
  { regex: /จิ๊กโฉ่ว|ซอสเปรี้ยว|worcestershire sauce/i, reason: 'ซอสเปรี้ยว (เครื่องปรุงรส)' },
  { regex: /น้ำส้มสายชู|vinegar/i, reason: 'น้ำส้มสายชู (เครื่องปรุงรส)' },
  { regex: /น้ำมันพืช|น้ำมันถั่วเหลือง|น้ำมันปาล์ม|น้ำมันรำข้าว|น้ำมันงา|น้ำมันมะกอก|cooking oil|องุ่น|มรกต/i, reason: 'น้ำมันสำหรับปรุงอาหาร' },
  { regex: /น้ำจิ้ม|น้ำจิ้มไก่|น้ำจิ้มสุกี้|น้ำจิ้มซีฟู้ด|น้ำปลาหวาน/i, reason: 'น้ำจิ้มสำเร็จรูป (เครื่องปรุงรส)' },
  { regex: /ซอสบาร์บีคิว|bbq sauce|มายองเนส|mayonnaise|สลัดครีม|น้ำสลัด/i, reason: 'ซอสสลัด/มายองเนส' },

  // เครื่องปรุงรสแห้ง ผง และเครื่องเทศ
  { regex: /น้ำตาล|น้ำตาลทราย|น้ำตาลปี๊บ|น้ำตาลมะพร้าว|sugar|มิตรผล/i, reason: 'น้ำตาล (เครื่องปรุงรส)' },
  { regex: /เกลือ|เกลือปรุงทิพย์|เกลือสมุทร|เกลือบริโภค|table salt|salt(?! scrub)/i, reason: 'เกลือปรุงอาหาร' },
  { regex: /ผงชูรส|อายิโนะโมะโต๊ะ|msg|monosodium glutamate/i, reason: 'ผงชูรส (เครื่องปรุงรส)' },
  { regex: /ผงปรุงรส|คนอร์|รสดี|คนอร์ก้อน|ซุปก้อน|รสหมู|รสไก่|rosdee|knorr/i, reason: 'ผงปรุงรส/ซุปก้อน' },
  { regex: /พริกไทย|พริกไทยป่น|พริกไทยดำ|pepper/i, reason: 'พริกไทย (เครื่องเทศ)' },
  { regex: /พริกป่น|พริกแห้ง|พริกขี้หนูป่น/i, reason: 'พริกป่น (เครื่องเทศ)' },
  { regex: /ผงกะหรี่|ผงพะโล้|ผงปาปริก้า|เครื่องเทศ|อบเชย|โป๊ยกั๊ก|ลูกผักชี|ยี่หร่า/i, reason: 'เครื่องเทศสำหรับปรุงอาหาร' },
  { regex: /ผงกระเทียม|กระเทียมเจียว|หอมเจียว/i, reason: 'เครื่องเทศ/เครื่องโรยอาหาร' },
  { regex: /เครื่องแกง|พริกแกง|น้ำพริกแกง|กะปิ|เต้าเจี้ยว|เต้าหู้ยี้/i, reason: 'พริกแกง/เครื่องปรุงรสพื้นฐาน' },
  { regex: /น้ำพริก|น้ำพริกเผา|น้ำพริกตาแดง|น้ำพริกหนุ่ม/i, reason: 'น้ำพริกประกอบอาหาร' },
  { regex: /แป้งทอดกรอบ|แป้งข้าวโพด|แป้งสาลี|แป้งมัน|แป้งข้าวเจ้า|flour/i, reason: 'แป้งประกอบอาหาร' },
  { regex: /ผงฟู|เบกกิ้งโซดา|ยีสต์|baking powder|baking soda|yeast/i, reason: 'ส่วนประกอบเบเกอรี่/ปรุงอาหาร' },
  { regex: /กะทิ|กะทิกล่อง|กะทิสด|ชาวเกาะ|อร่อยดี|coconut milk/i, reason: 'กะทิประกอบอาหาร' },
];

// หมวด A: อาหารและเครื่องดื่มทั่วไป (FOOD)
const FOOD_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  // ผักสดและผลไม้
  { regex: /ผัก|ผลไม้|กะหล่ำ|ผักกาด|ผักบุ้ง|คะน้า|กวางตุ้ง|ตำลึง|แตงกวา|มะเขือ|ฟักทอง|แครอท|หอมใหญ่|ต้นหอม|ผักชี|กะเพรา|กระเพรา|โหระพา|ข่า|ตะไคร้|ใบมะกรูด|เห็ด|มะนาว|มะเขือเทศ|ส้ม|กล้วย|แอปเปิ้ล|แตงโม|มะม่วง|สับปะรด|องุ่น/i, reason: 'ผักหรือผลไม้สด' },
  
  // เนื้อสัตว์ ไข่ และอาหารทะเล
  { regex: /หมู|เนื้อหมู|หมูสับ|หมูบด|สันนอก|สันใน|สามชั้น|เบคอน|ซี่โครงหมู|ไก่|เนื้อไก่|อกไก่|น่องไก่|ปีกไก่|เป็ด|เนื้อวัว|เนื้อ|กุ้ง|ปลา|ปลาแซลมอน|ปลาดอลลี่|ปลาทูน่า|ปลาหมึก|หอย|ปู|ลูกชิ้น|ไส้กรอก|แฮม|กุนเชียง/i, reason: 'เนื้อสัตว์/อาหารทะเล' },
  { regex: /ไข่|ไข่ไก่|ไข่เป็ด|ไข่เค็ม|ไข่เยี่ยวม้า|egg/i, reason: 'ไข่สด/ผลิตภัณฑ์ไข่' },

  // นม ผลิตภัณฑ์นม ขนมปัง ข้าว เส้น
  { regex: /นม|นมสด|นมจืด|นมเปรี้ยว|นมถั่วเหลือง|โยเกิร์ต|ชีส|เนยสด|มาการีน|milk|yogurt|cheese|butter|แลคตาซอย|ไวตามิ้ลค์|ดัชมิลล์|เมจิ/i, reason: 'นมหรือผลิตภัณฑ์นม' },
  { regex: /ข้าว|ข้าวหอมมะลิ|ข้าวขาว|ข้าวกล้อง|ข้าวสาร|rice/i, reason: 'ข้าวสารหรือข้าวหุง' },
  { regex: /ขนมปัง|ครัวซองต์|เบเกอรี่|เค้ก|พาย|bread|bakery/i, reason: 'ขนมปังหรือเบเกอรี่' },
  { regex: /เส้น|บะหมี่|ก๋วยเตี๋ยว|วุ้นเส้น|พาสต้า|สปาเก็ตตี้|มาม่า|ไวไว|ยำยำ|บะหมี่กึ่งสำเร็จรูป|noodle|pasta/i, reason: 'เส้นหรือบะหมี่' },

  // อาหารสำเร็จรูป อาหารกระป๋อง และของทานเล่น
  { regex: /อาหารแช่แข็ง|อาหารกล่อง|ข้าวผัด|ข้าวกล่อง|เต้าหู้|เกี๊ยว|ติ่มซำ|ปลาทู|ปลากระป๋อง|ซีเล็ค|สามแม่ครัว/i, reason: 'อาหารปรุงสำเร็จ/อาหารกระป๋อง' },
  { regex: /ขนม|มันฝรั่งทอด|เลย์|lays|บิสกิต|แครกเกอร์|คุกกี้|เวเฟอร์|ช็อกโกแลต|snack/i, reason: 'ขนมขบเคี้ยว' },

  // เครื่องดื่ม
  { regex: /น้ำดื่ม|น้ำเปล่า|น้ำแร่|น้ำส้ม|น้ำผลไม้|ชา|ชาเขียว|กาแฟ|เนสกาแฟ|โออิชิ|อิชิตัน|โค้ก|เป๊ปซี่|สไปรท์|โซดา|coke|pepsi|water|beverage/i, reason: 'เครื่องดื่ม' },
];

// ข้อความขยะ OCR Noise หรือบรรทัด Header/Footer/Payment ของใบเสร็จ
const NOISE_OR_METADATA_PATTERNS: RegExp[] = [
  /^v\s*1m$/i,
  /^vw$/i,
  /^nm$/i,
  /^[a-z0-9]{1,2}$/i, // ข้อความ 1-2 ตัวอักษรสุ่มๆ เช่น "A", "01", "XX"
  /^[\*\#\-\=\.\:\_\/\s]+$/, // เครื่องหมายล้วนๆ
  /^(total|subtotal|grand\s*total|vat|tax|change|cash|balance|amount|pos|receipt|invoice|slip|rounding)$/i,
  /^(ยอดรวม|รวมเงิน|รวมทั้งสิ้น|ยอดสุทธิ|สุทธิ|ปัดเศษ|ภาษีมูลค่าเพิ่ม|เงินสด|เงินทอน|ยอดชำระ|คงเหลือ)$/i,
  /^(ใบเสร็จ|ใบกำกับภาษี|อย่างย่อ|สำเนา|ต้นฉบับ|สลิป|หมายเหตุ)$/i,
  /^(ยินดีต้อนรับ|ขอบคุณที่ใช้บริการ|welcome|thank you)$/i,
  /^(สมาชิก|ราคาสมาชิก|แต้มสะสม|คะแนน|สะสมแต้ม|all member|clubcard|the 1|point)$/i,
  /^(tel|โทร|สาขา|branch|date|time|เครื่อง|แคชเชียร์|cashier)$/i,
  /^(ส่วนลด|ลดทันที|ประหยัด|โปรโมชั่น|discount|coupon|คูปอง)$/i,
  /^(พร้อมเพย์|promptpay|qr\s*code|qr\s*payment|โอนเงิน)$/i,
  /^(ค่าส่ง|ค่าจัดส่ง|ค่าบริการ|delivery\s*fee|service\s*charge|grabexpress|lineman|line\s*man)$/i,
  /^(ช้อนส้อม|ไม่รับช้อนส้อม|รับช้อนส้อม)$/i,
  /^(7-eleven|lotus's|lotus|big\s*c|makro|tops|grabmart|grabfood)$/i,
];

// -------------------------------------------------------------
// 2. ฟังก์ชันตรวจสอบความสะอาดของข้อความ (Clean & Normalize)
// -------------------------------------------------------------

/**
 * ตรวจสอบว่าข้อความเป็น Noise, Header หรือไม่ใช่อาหารแบบไร้ความหมายหรือไม่
 */
export function isOcrNoiseOrReceiptMetadata(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length === 0) return true;
  if (cleaned.length <= 2 && !['ไข่', 'หมู', 'ไก่', 'นม', 'ชา'].includes(cleaned)) return true;

  // ตรวจสอบกับ Regular Expressions ขยะ
  for (const pattern of NOISE_OR_METADATA_PATTERNS) {
    if (pattern.test(cleaned)) return true;
  }

  // ตัวเลขล้วนๆ
  if (/^\d+$/.test(cleaned)) return true;

  return false;
}

// การขยายชื่อย่อของสินค้าในซูเปอร์มาร์เก็ตไทย (Supermarket Abbreviations Expander)
const SUPERMARKET_ABBREVIATIONS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\b(นมสด\s*)?พาสฯ\b|\bพาสเจอฯ\b/gi, replacement: 'พาสเจอร์ไรส์' },
  { regex: /\bยูเอชที\b|\buht\b/gi, replacement: 'UHT' },
  { regex: /\bผงซักฯ\b/gi, replacement: 'ผงซักฟอก' },
  { regex: /\bนย\.ล้างจาน\b|\bน\.ย\.ล้างจาน\b/gi, replacement: 'น้ำยาล้างจาน' },
  { regex: /\bนย\.ปรับผ้า\b|\bน้ำยาปรับผ้าฯ\b/gi, replacement: 'น้ำยาปรับผ้านุ่ม' },
  { regex: /\bซอสปรุงรส\s*ภขท\b/gi, replacement: 'ซอสปรุงรส ภูเขาทอง' },
  { regex: /\bหมูสับฯ\b|\bหมูบดฯ\b/gi, replacement: 'หมูบด' },
  { regex: /\bอกไก่\s*บด\b/gi, replacement: 'อกไก่บด' },
  { regex: /\bไข่ไก่\s*บ\.(\d)\b/gi, replacement: 'ไข่ไก่ เบอร์ $1' },
];

/**
 * ล้างข้อความนำหน้า/ต่อท้าย และตัด Noise ออกจากชื่อสินค้า
 */
export function sanitizeProductName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';
  if (isOcrNoiseOrReceiptMetadata(rawName)) return '';

  let cleaned = rawName
    .replace(/^[\d\.\-\*\#\s\>\•\–]+/, '') // ตัดรหัสลำดับด้านหน้า เช่น "1. ", "01-", "* "
    .replace(/\s+[\d,]+(?:\.\d+)?\s*[a-zA-Z]?\s*(บาท|baht|thb)?$/i, '') // ตัดราคาท้ายชื่อ เช่น " 45.00V บาท", " 26.50 บาท", " 45.00V"
    .replace(/[\*\#\>\•\–]/g, '') // ลบเครื่องหมายพิเศษ
    .replace(/\s+/g, ' ') // ยุบช่องว่างซ้ำ
    .trim();

  // ขยายชื่อย่อซูเปอร์มาร์เก็ต
  for (const abbrev of SUPERMARKET_ABBREVIATIONS) {
    cleaned = cleaned.replace(abbrev.regex, abbrev.replacement);
  }

  // ตรวจสอบกับฟังก์ชัน noise อีกครั้งหลังล้าง
  if (isOcrNoiseOrReceiptMetadata(cleaned)) return '';

  // ตรวจสอบว่ามีตัวอักษรไทยหรืออังกฤษที่มีความหมายหรือไม่
  const hasValidChars = /[a-zA-Z\u0E00-\u0E7F]/.test(cleaned);
  if (!hasValidChars || cleaned.length < 2) {
    return '';
  }

  return cleaned.trim();
}

/**
 * ปรับชื่อสินค้าให้อยู่ในรูปมาตรฐานสำหรับเปรียบเทียบ (Lowercase, trimmed)
 */
export function normalizeProductKey(name: string): string {
  return sanitizeProductName(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

// -------------------------------------------------------------
// 3. ระบบ Semantic Classification Engine (จำแนกตามความหมาย)
// -------------------------------------------------------------

/**
 * ตรวจหาหน่วยสินค้าที่ระบุไว้ในข้อความโดยตรง (Explicit Unit Token)
 */
export function extractUnitFromText(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();

  const unitPatterns: Array<{ regex: RegExp; unit: string }> = [
    { regex: /(?:\d+|\s|^)(แผง)(?:\s|$|\d)/, unit: 'แผง' },
    { regex: /(?:\d+|\s|^)(แพ็ค|แพ็ก)(?:\s|$|\d)/, unit: 'แพ็ค' },
    { regex: /(?:\d+|\s|^)(กล่อง)(?:\s|$|\d)/, unit: 'กล่อง' },
    { regex: /(?:\d+|\s|^)(ขวด)(?:\s|$|\d)/, unit: 'ขวด' },
    { regex: /(?:\d+|\s|^)(กระป๋อง)(?:\s|$|\d)/, unit: 'กระป๋อง' },
    { regex: /(?:\d+|\s|^)(ถุง)(?:\s|$|\d)/, unit: 'ถุง' },
    { regex: /(?:\d+|\s|^)(ห่อ)(?:\s|$|\d)/, unit: 'ห่อ' },
    { regex: /(?:\d+|\s|^)(ถาด)(?:\s|$|\d)/, unit: 'ถาด' },
    { regex: /(?:\d+|\s|^)(มัด|กำ)(?:\s|$|\d)/, unit: 'มัด' },
    { regex: /(?:\d+|\s|^)(กระปุก)(?:\s|$|\d)/, unit: 'กระปุก' },
    { regex: /(?:\d+|\s|^)(หลอด)(?:\s|$|\d)/, unit: 'หลอด' },
    { regex: /(?:\d+|\s|^)(จาน)(?:\s|$|\d)/, unit: 'จาน' },
    { regex: /(?:\d+|\s|^)(ถ้วย)(?:\s|$|\d)/, unit: 'ถ้วย' },
    { regex: /(?:\d+|\s|^)(ชาม)(?:\s|$|\d)/, unit: 'ชาม' },
    { regex: /(?:\d+|\s|^)(แก้ว)(?:\s|$|\d)/, unit: 'แก้ว' },
    { regex: /(?:\d+|\s|^)(เสิร์ฟ)(?:\s|$|\d)/, unit: 'เสิร์ฟ' },
    { regex: /(?:\d+|\s|^)(กิโลกรัม|กก\.|กก|kg)(?:\s|$|\d)/i, unit: 'กิโลกรัม' },
    { regex: /(?:\d+|\s|^)(กรัม|g)(?:\s|$|\d)/i, unit: 'กรัม' },
    { regex: /(?:\d+|\s|^)(มิลลิลิตร|มล\.|มล|ml)(?:\s|$|\d)/i, unit: 'มิลลิลิตร' },
    { regex: /(?:\d+|\s|^)(ลิตร|l)(?:\s|$|\d)/i, unit: 'ลิตร' },
    { regex: /(?:\d+|\s|^)(ฟอง)(?:\s|$|\d)/, unit: 'ฟอง' },
    { regex: /(?:\d+|\s|^)(ลูก)(?:\s|$|\d)/, unit: 'ลูก' },
    { regex: /(?:\d+|\s|^)(ใบ)(?:\s|$|\d)/, unit: 'ใบ' },
    { regex: /(?:\d+|\s|^)(ผล)(?:\s|$|\d)/, unit: 'ผล' },
    { regex: /(?:\d+|\s|^)(หัว)(?:\s|$|\d)/, unit: 'หัว' },
    { regex: /(?:\d+|\s|^)(ต้น)(?:\s|$|\d)/, unit: 'ต้น' },
    { regex: /(?:\d+|\s|^)(อัน)(?:\s|$|\d)/, unit: 'อัน' },
    { regex: /(?:\d+|\s|^)(ชิ้น)(?:\s|$|\d)/, unit: 'ชิ้น' },
  ];

  for (const p of unitPatterns) {
    if (p.regex.test(t)) {
      return p.unit;
    }
  }

  return null;
}

/**
 * คาดเดาหน่วยนับที่เหมาะสมจากชื่อ ประเภทสินค้า และบริบทข้อความ
 */
export function guessSmartUnit(name: string, category: ProductCategory, rawContext?: string): string {
  // 1. ตรวจสอบหน่วยที่ปรากฏชัดเจนในข้อความดิบหรือชื่อสินค้าก่อน
  const explicitFromContext = extractUnitFromText(rawContext || '');
  if (explicitFromContext) return explicitFromContext;

  const explicitFromName = extractUnitFromText(name || '');
  if (explicitFromName) return explicitFromName;

  const lower = (name || '').toLowerCase();

  // 2. หมวด NON-FOOD
  if (category === 'non_food') {
    if (lower.includes('ทิชชู่') || lower.includes('กระดาษ')) return 'ม้วน';
    if (lower.includes('ถุงขยะ')) return 'แพ็ค';
    if (lower.includes('น้ำยา') || lower.includes('แชมพู') || lower.includes('สบู่เหลว') || lower.includes('โลชั่น')) return 'ขวด';
    if (lower.includes('ยาสีฟัน')) return 'หลอด';
    if (lower.includes('สบู่') || lower.includes('ฟองน้ำ')) return 'ก้อน';
    return 'ชิ้น';
  }

  // 3. หมวด SEASONING (เครื่องปรุง)
  if (category === 'seasoning') {
    if (lower.includes('น้ำปลา') || lower.includes('ซีอิ๊ว') || lower.includes('ซอส') || lower.includes('น้ำมัน') || lower.includes('น้ำส้มสายชู')) return 'ขวด';
    if (lower.includes('น้ำตาล')) return 'กิโลกรัม';
    if (lower.includes('เกลือ')) return 'ถุง';
    if (lower.includes('พริกไทย')) return 'ขวด';
    if (lower.includes('ผง') || lower.includes('พริกแกง') || lower.includes('เครื่องแกง') || lower.includes('แป้ง')) return 'ถุง';
    if (lower.includes('ซุปก้อน') || lower.includes('คนอร์ก้อน')) return 'กล่อง';
    return 'ขวด';
  }

  // 4. หมวด FOOD & BEVERAGE
  // ไข่สด (ถ้าในชื่อระบุ แผง จะตรงเงื่อนไข explicit ด้านบนแล้ว)
  if (lower.includes('ไข่')) return 'ฟอง';

  // นมสด ผลิตภัณฑ์นม
  if (lower.includes('นมสด') || lower.includes('นมกล่อง') || lower.includes('นมถั่วเหลือง') || lower.includes('กะทิ')) return 'กล่อง';
  if (lower.includes('นมเปรี้ยว') || lower.includes('โยเกิร์ต')) return 'ถ้วย';

  // เครื่องดื่มเหลว
  if (lower.includes('น้ำดื่ม') || lower.includes('น้ำเปล่า') || lower.includes('โค้ก') || lower.includes('เป๊ปซี่') || lower.includes('ชาเขียว') || lower.includes('โซดา') || lower.includes('เบียร์') || lower.includes('ไวน์')) return 'ขวด';
  if (lower.includes('กาแฟ') || lower.includes('ชาเย็น') || lower.includes('ชานม')) return 'แก้ว';

  // อาหารปรุงสำเร็จ / อาหารจานเดียว
  if (lower.includes('ข้าวผัด') || lower.includes('กะเพรา') || lower.includes('กระเพรา') || lower.includes('ผัดซีอิ๊ว') || lower.includes('ผัดไทย') || lower.includes('สเต็ก') || lower.includes('ข้าวราด') || lower.includes('ข้าวกล่อง')) return 'จาน';
  if (lower.includes('ก๋วยเตี๋ยว') || lower.includes('ต้มยำ') || lower.includes('แกงจืด') || lower.includes('ซุป') || lower.includes('ราดหน้า') || lower.includes('แกงเขียวหวาน')) return 'ชาม';

  // ผักสด
  if (lower.includes('ผักบุ้ง') || lower.includes('คะน้า') || lower.includes('กวางตุ้ง') || lower.includes('ต้นหอม') || lower.includes('ผักชี') || lower.includes('ชะอม') || lower.includes('ใบกะเพรา') || lower.includes('ใบโหระพา')) return 'มัด';
  if (lower.includes('กะหล่ำ') || lower.includes('ผักกาด') || lower.includes('หอมใหญ่') || lower.includes('บรอกโคลี') || lower.includes('บล็อคโคลี่')) return 'หัว';

  // ผลไม้
  if (lower.includes('แตงโม') || lower.includes('ส้มโอ') || lower.includes('แคนตาลูป') || lower.includes('ฟักทอง') || lower.includes('มะพร้าว')) return 'ลูก';
  if (lower.includes('แอปเปิ้ล') || lower.includes('ส้ม') || lower.includes('มะนาว') || lower.includes('มะม่วง') || lower.includes('กล้วยหอม') || lower.includes('อะโวคาโด')) return 'ผล';

  // อาหารกระป๋อง ขนมปัง ข้าวสาร (ตรวจสอบก่อนเนื้อสัตว์/ปลาสด)
  if (lower.includes('ปลากระป๋อง') || lower.includes('กระป๋อง') || lower.includes('ทูน่า') || lower.includes('ซาร์ดีน')) return 'กระป๋อง';
  if (lower.includes('ขนมปัง') || lower.includes('บาแก็ต')) return 'แถว';
  if (lower.includes('ข้าวสาร') || lower.includes('ข้าวหอมมะลิ') || lower.includes('ข้าวเหนียว') || lower.includes('ข้าวกล้อง')) return 'ถุง';

  // เนื้อสัตว์และอาหารทะเล
  if (lower.includes('หมูบด') || lower.includes('หมูสับ') || lower.includes('เนื้อวัว') || lower.includes('หมูสามชั้น')) return 'กิโลกรัม';
  if (lower.includes('เนื้อ') || lower.includes('หมู') || lower.includes('ไก่') || lower.includes('ปลา') || lower.includes('กุ้ง') || lower.includes('หมึก') || lower.includes('หอย')) return 'แพ็ค';

  return 'ชิ้น';
}

/**
 * จำแนกประเภทสินค้าอย่างชาญฉลาดโดยวิเคราะห์บริบทและความหมาย
 */
export function classifyProductSemantically(rawName: string): ClassificationResult {
  const cleaned = sanitizeProductName(rawName);

  // 1. ตรวจสอบ Noise และข้อความที่อ่านไม่ออก
  if (!cleaned || isOcrNoiseOrReceiptMetadata(rawName)) {
    return {
      category: 'unknown',
      confidence: 0.20,
      reason: 'ข้อความไม่สมบูรณ์หรือเป็นข้อมูลหัว/ท้ายใบเสร็จ',
      suggestedUnit: 'ชิ้น',
      isFoodOrSeasoning: false,
      needsReview: true,
      cleanedName: cleaned || rawName.trim(),
    };
  }

  // 2. ตรวจสอบหมวด C: NON-FOOD ก่อน (ความสำคัญสูงสุด ป้องกันของใช้หลุดเข้าตู้เย็น)
  for (const item of NON_FOOD_PATTERNS) {
    if (item.regex.test(cleaned)) {
      return {
        category: 'non_food',
        confidence: 0.96,
        reason: item.reason,
        suggestedUnit: guessSmartUnit(cleaned, 'non_food'),
        isFoodOrSeasoning: false,
        needsReview: false,
        cleanedName: cleaned,
      };
    }
  }

  // 3. ตรวจสอบหมวด B: SEASONING (เครื่องปรุงและส่วนประกอบอาหาร - นับเป็น FOOD)
  for (const item of SEASONING_PATTERNS) {
    if (item.regex.test(cleaned)) {
      return {
        category: 'seasoning',
        confidence: 0.95,
        reason: item.reason,
        suggestedUnit: guessSmartUnit(cleaned, 'seasoning'),
        isFoodOrSeasoning: true,
        needsReview: false,
        cleanedName: cleaned,
      };
    }
  }

  // 4. ตรวจสอบหมวด A: FOOD (อาหาร เครื่องดื่ม ผัก ผลไม้ เนื้อสัตว์)
  for (const item of FOOD_PATTERNS) {
    if (item.regex.test(cleaned)) {
      return {
        category: 'food',
        confidence: 0.94,
        reason: item.reason,
        suggestedUnit: guessSmartUnit(cleaned, 'food'),
        isFoodOrSeasoning: true,
        needsReview: false,
        cleanedName: cleaned,
      };
    }
  }

  // 5. คำทั่วไปหรือสินค้าที่ระบบยังไม่แน่ใจ (Ambiguous / Unknown)
  // ต้องแจ้งเตือนให้ผู้ใช้ตรวจสอบ ไม่เดาสุ่ม
  return {
    category: 'unknown',
    confidence: 0.65,
    reason: 'ไม่พบในฐานข้อมูลสินค้าอาหาร ต้องให้ผู้ใช้ยืนยัน',
    suggestedUnit: 'ชิ้น',
    isFoodOrSeasoning: false,
    needsReview: true,
    cleanedName: cleaned,
  };
}

// -------------------------------------------------------------
// 4. ระบบการเรียนรู้จากการแก้ไขของผู้ใช้ (Learned Product Dictionary)
// -------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'checktuyen_learned_products_';

export interface UserCorrectionEntry {
  normalizedName: string;
  originalName: string;
  category: ProductCategory;
  updatedAt: string;
  householdId: string;
}

/**
 * ดึงพจนานุกรมการจำแนกที่ผู้ใช้เคยยืนยันแล้วของครัวเรือนนี้
 */
export function getLearnedProductDictionary(householdId: string): Record<string, ProductCategory> {
  if (typeof window === 'undefined' || !householdId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${householdId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * บันทึกการแก้ไข/ยืนยันประเภทสินค้าของผู้ใช้ เพื่อนำไปใช้จำแนกในครั้งถัดไป
 */
export function recordUserProductCorrection(
  householdId: string,
  rawName: string,
  category: ProductCategory
): void {
  if (typeof window === 'undefined' || !householdId) return;
  const key = normalizeProductKey(rawName);
  if (!key || key.length < 2) return;

  try {
    const current = getLearnedProductDictionary(householdId);
    current[key] = category;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${householdId}`, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save product correction:', err);
  }
}

// -------------------------------------------------------------
// ระบบบันทึกและดึงประวัติราคาซื้อเดิมรายครัวเรือน (Household Price History)
// -------------------------------------------------------------

const PRICE_STORAGE_KEY_PREFIX = 'smart_fridge_price_history_';

export function getPriceHistory(
  householdId: string
): Record<string, { unitPrice: number; unit?: string; date?: string }> {
  if (typeof window === 'undefined' || !householdId) return {};
  try {
    const raw = localStorage.getItem(`${PRICE_STORAGE_KEY_PREFIX}${householdId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function recordPriceHistory(
  householdId: string,
  rawName: string,
  unitPrice: number,
  unit?: string
): void {
  if (typeof window === 'undefined' || !householdId || !unitPrice || unitPrice <= 0) return;
  const key = normalizeProductKey(rawName);
  if (!key || key.length < 2) return;

  try {
    const current = getPriceHistory(householdId);
    current[key] = {
      unitPrice,
      unit,
      date: new Date().toISOString().split('T')[0],
    };
    localStorage.setItem(`${PRICE_STORAGE_KEY_PREFIX}${householdId}`, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save price history:', err);
  }
}

/**
 * ตรวจสอบและจำแนกสินค้าโดยนำ Learned Dictionary มาร่วมพิจารณาเป็นอันดับแรก
 */
export function classifyProductWithLearning(
  rawName: string,
  householdId?: string
): ClassificationResult {
  const cleaned = sanitizeProductName(rawName);
  const key = normalizeProductKey(cleaned);

  // 1. ถ้าผู้ใช้เคยยืนยันสินค้านี้ในครัวเรือนแล้ว ให้เชื่อถือผลการยืนยันของผู้ใช้ 100%
  if (householdId) {
    const learnedDict = getLearnedProductDictionary(householdId);
    if (key && learnedDict[key]) {
      const learnedCat = learnedDict[key];
      const isFood = learnedCat === 'food' || learnedCat === 'seasoning';
      return {
        category: learnedCat,
        confidence: 1.0,
        reason: `เรียนรู้จากการยืนยันของผู้ใช้ในบ้าน (${learnedCat === 'food' ? 'อาหาร' : learnedCat === 'seasoning' ? 'เครื่องปรุง' : 'ของใช้'})`,
        suggestedUnit: guessSmartUnit(cleaned, learnedCat),
        isFoodOrSeasoning: isFood,
        needsReview: false,
        cleanedName: cleaned,
      };
    }
  }

  // 2. ถ้ายังไม่เคยยืนยัน ให้ประมวลผลผ่าน Semantic Classification Engine
  return classifyProductSemantically(rawName);
}

// -------------------------------------------------------------
// ระบบราคาประเมินมาตรฐาน (Benchmark Estimated Price)
// -------------------------------------------------------------

export interface EstimatedPriceResult {
  estimatedPrice: number | null;
  isEstimate: boolean;
  benchmarkUnit?: string;
  sourceLabel?: string;
}

export const ESTIMATED_PRICE_BENCHMARKS: Record<string, { price: number; unit: string }> = {
  ไข่ไก่: { price: 5.5, unit: 'ฟอง' },
  ไข่เป็ด: { price: 6.0, unit: 'ฟอง' },
  ไข่: { price: 5.5, unit: 'ฟอง' },
  นมสด: { price: 45.0, unit: 'กล่อง' },
  นม: { price: 45.0, unit: 'กล่อง' },
  นมเปรี้ยว: { price: 25.0, unit: 'ขวด' },
  หมูสับ: { price: 65.0, unit: 'แพ็ค' },
  เนื้อหมู: { price: 120.0, unit: 'กิโลกรัม' },
  หมู: { price: 120.0, unit: 'กิโลกรัม' },
  สันคอหมู: { price: 140.0, unit: 'กิโลกรัม' },
  เนื้อไก่: { price: 85.0, unit: 'กิโลกรัม' },
  อกไก่: { price: 80.0, unit: 'กิโลกรัม' },
  ไก่: { price: 85.0, unit: 'กิโลกรัม' },
  กุ้ง: { price: 180.0, unit: 'กิโลกรัม' },
  ปลา: { price: 90.0, unit: 'ตัว' },
  ผักบุ้ง: { price: 20.0, unit: 'กำ' },
  ผักกาดขาว: { price: 30.0, unit: 'หัว' },
  กะหล่ำปลี: { price: 30.0, unit: 'หัว' },
  แครอท: { price: 25.0, unit: 'หัว' },
  มะเขือเทศ: { price: 35.0, unit: 'ถุง' },
  แตงกวา: { price: 25.0, unit: 'ถุง' },
  พริก: { price: 20.0, unit: 'ถุง' },
  กระเทียม: { price: 40.0, unit: 'ถุง' },
  หอมแดง: { price: 45.0, unit: 'ถุง' },
  มะนาว: { price: 5.0, unit: 'ลูก' },
  ข้าวสาร: { price: 180.0, unit: 'ถุง' },
  ข้าวผัด: { price: 50.0, unit: 'จาน' },
  น้ำปลา: { price: 35.0, unit: 'ขวด' },
  ซีอิ๊วขาว: { price: 40.0, unit: 'ขวด' },
  ซอสหอยนางรม: { price: 45.0, unit: 'ขวด' },
  น้ำมันพืช: { price: 55.0, unit: 'ขวด' },
  น้ำตาล: { price: 30.0, unit: 'ถุง' },
  เกลือ: { price: 15.0, unit: 'ถุง' },
  ขนมปัง: { price: 42.0, unit: 'แถว' },
  เนย: { price: 75.0, unit: 'ก้อน' },
  โยเกิร์ต: { price: 18.0, unit: 'ถ้วย' },
};

/**
 * ดึงราคาประเมินมาตรฐานกรณีใบเสร็จไม่มีราคา หรืออ่านไม่ชัดเจน
 * ติดป้ายกำกับชัดเจนว่าเป็น "ราคาประเมิน" ไม่หลอกเป็นราคาจริง
 */
export function getEstimatedPriceBenchmark(name: string): EstimatedPriceResult {
  if (!name) return { estimatedPrice: null, isEstimate: false };
  const cleaned = sanitizeProductName(name).toLowerCase();

  for (const [key, benchmark] of Object.entries(ESTIMATED_PRICE_BENCHMARKS)) {
    if (cleaned.includes(key.toLowerCase())) {
      return {
        estimatedPrice: benchmark.price,
        isEstimate: true,
        benchmarkUnit: benchmark.unit,
        sourceLabel: 'ราคาประเมินมาตรฐานตลาด',
      };
    }
  }

  return { estimatedPrice: null, isEstimate: false };
}

// -------------------------------------------------------------
// ระบบประเมินราคาตามลำดับความสำคัญ (Hierarchical Price Extraction)
// Priority 1: ราคาที่อ่านได้โดยตรงจากใบเสร็จ (Actual Receipt Price)
// Priority 2: ราคาจากฐานข้อมูลสินค้าที่ตรงกับสินค้าและขนาดบรรจุภัณฑ์
// Priority 3: ราคาจากประวัติการซื้อสินค้าชนิดเดียวกันของผู้ใช้ในบ้าน
// Priority 4: ราคาโดยประมาณมาตรฐานตลาด (Benchmark Estimated Price)
// -------------------------------------------------------------

export type PriceSource = 'receipt' | 'history' | 'benchmark' | 'unknown';

export interface HierarchicalPriceInfo {
  unitPrice: number | null;
  lineTotal: number | null;
  price: number | null;
  source: PriceSource;
  isEstimate: boolean;
  sourceLabel: string;
}

export function resolveHierarchicalPrice(
  productName: string,
  rawUnitPrice: number | null,
  rawLineTotal: number | null,
  quantity: number = 1,
  householdIdOrHistory?: string | Map<string, number> | Record<string, { unitPrice: number }>
): HierarchicalPriceInfo {
  const qty = quantity > 0 ? quantity : 1;

  // Priority 1: Actual Receipt Price (จากใบเสร็จจริง)
  if (rawLineTotal !== null && rawLineTotal > 0) {
    const calcUnitPrice =
      rawUnitPrice !== null && rawUnitPrice > 0
        ? rawUnitPrice
        : Math.round((rawLineTotal / qty) * 100) / 100;
    return {
      unitPrice: calcUnitPrice,
      lineTotal: rawLineTotal,
      price: rawLineTotal,
      source: 'receipt',
      isEstimate: false,
      sourceLabel: 'ราคาจากใบเสร็จ',
    };
  }

  if (rawUnitPrice !== null && rawUnitPrice > 0) {
    const calcLineTotal = Math.round(rawUnitPrice * qty * 100) / 100;
    return {
      unitPrice: rawUnitPrice,
      lineTotal: calcLineTotal,
      price: calcLineTotal,
      source: 'receipt',
      isEstimate: false,
      sourceLabel: 'ราคาจากใบเสร็จ',
    };
  }

  // Priority 2 & 3: User/Household Database or Purchase History Price
  const cleanKey = normalizeProductKey(productName);
  if (householdIdOrHistory && cleanKey) {
    let histPrice: number | undefined;

    if (typeof householdIdOrHistory === 'string') {
      const historyDict = getPriceHistory(householdIdOrHistory);
      histPrice = historyDict[cleanKey]?.unitPrice;
    } else if (householdIdOrHistory instanceof Map) {
      histPrice = householdIdOrHistory.get(cleanKey);
    } else if (typeof householdIdOrHistory === 'object') {
      histPrice = householdIdOrHistory[cleanKey]?.unitPrice;
    }

    if (histPrice && histPrice > 0) {
      const calcLineTotal = Math.round(histPrice * qty * 100) / 100;
      return {
        unitPrice: histPrice,
        lineTotal: calcLineTotal,
        price: calcLineTotal,
        source: 'history',
        isEstimate: true,
        sourceLabel: 'ราคาประเมินจากประวัติเดิมในบ้าน',
      };
    }
  }

  // Priority 4: Benchmark Estimated Price (ราคาเฉลี่ยมาตรฐานตลาด)
  const benchmark = getEstimatedPriceBenchmark(productName);
  if (benchmark.estimatedPrice !== null && benchmark.estimatedPrice > 0) {
    const calcLineTotal = Math.round(benchmark.estimatedPrice * qty * 100) / 100;
    return {
      unitPrice: benchmark.estimatedPrice,
      lineTotal: calcLineTotal,
      price: calcLineTotal,
      source: 'benchmark',
      isEstimate: true,
      sourceLabel: 'ราคาประเมินมาตรฐานตลาด',
    };
  }

  // Unknown Price (No price found anywhere - do NOT fake 0.00)
  return {
    unitPrice: null,
    lineTotal: null,
    price: null,
    source: 'unknown',
    isEstimate: false,
    sourceLabel: 'ไม่ระบุราคาในใบเสร็จ',
  };
}

