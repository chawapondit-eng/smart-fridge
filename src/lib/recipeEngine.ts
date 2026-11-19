/**
 * CheckTuYen — AI Recipe Ingredient Classifier, Weighted Random Selector & Output Validator
 *
 * 1. แบ่งวัตถุดิบออกเป็น 3 กลุ่มชัดเจน:
 *    - expired (daysUntilExpiry < 0): ห้ามนำมาใช้แนะนำเมนูเด็ดขาด (Weight = 0)
 *    - expiring_soon (0 <= daysUntilExpiry <= 5): ลำดับความสำคัญสูง (Weight = 2.0 - 4.0)
 *    - fresh (daysUntilExpiry > 5 หรือไม่ระบุวันหมดอายุ): ลำดับความสำคัญปกติ (Weight = 1.0)
 * 2. Weighted Random Recommendation:
 *    - ให้โอกาสวัตถุดิบใกล้หมดอายุสูงกว่า แต่ยังเปิดให้วัตถุดิบสดใหม่มีโอกาสถูกสุ่มเพื่อความหลากหลาย
 * 3. Post-AI Validation:
 *    - ตรวจสอบผลลัพธ์จาก LLM ทุกครั้งว่าไม่มีวัตถุดิบหมดอายุ และไม่มีการอ้างว่ามีของที่ไม่มีจริงในตู้เย็น
 */

import { getDaysUntilExpiry } from './date';

export interface RawIngredientItem {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  expiryDate?: string | null;
  daysLeft?: number | null;
  fridgeId?: string;
  fridgeName?: string;
}

export interface ClassifiedIngredients {
  expired: RawIngredientItem[];
  expiringSoon: RawIngredientItem[];
  fresh: RawIngredientItem[];
  usable: RawIngredientItem[];
}

export interface RecipeIngredientVerified {
  name: string;
  amount: string;
  location: string;
  inFridge: boolean;
}

export interface GeneratedRecipeCandidate {
  id?: string;
  name: string;
  nameEn?: string;
  tag?: string;
  time?: string;
  difficulty?: string;
  calories?: string;
  servings?: string;
  ingredients?: Array<{ name?: string; amount?: string; inFridge?: boolean }>;
  steps?: unknown[];
}

export interface VerifiedRecipe {
  id: string;
  name: string;
  nameEn: string;
  tag: string;
  time: string;
  difficulty: string;
  calories: string;
  servings: string;
  ingredients: RecipeIngredientVerified[];
  steps: string[];
}

export interface RecipeValidationResult {
  validRecipes: VerifiedRecipe[];
  rejectedCount: number;
  rejectedReasons: string[];
}

export function normalizeIngredientName(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * ตรวจสอบว่าชื่อวัตถุดิบสองชื่อตรงกันหรือไม่ (สำหรับเทียบกับสต็อกจริงและรายการหมดอายุ)
 */
export function ingredientNamesMatch(a: string, b: string): boolean {
  const na = normalizeIngredientName(a);
  const nb = normalizeIngredientName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * คำนวณ daysLeft จริงจาก expiryDate (ถ้ามี) เพื่อไม่พึ่งพาค่าที่คำนวณผิดจากฝั่ง client
 */
export function resolveIngredientDaysLeft(
  item: RawIngredientItem,
  now: Date = new Date()
): number | null {
  if (item.expiryDate) {
    return getDaysUntilExpiry(item.expiryDate, now);
  }
  if (typeof item.daysLeft === 'number' && !isNaN(item.daysLeft)) {
    return Math.trunc(item.daysLeft);
  }
  return null;
}

/**
 * แบ่งวัตถุดิบออกเป็น 3 กลุ่มตามกฎ PART 5.1
 * - ตัดสินค้าที่ quantity <= 0 ออกทั้งหมด
 * - ตัดวัตถุดิบหมดอายุ (daysLeft < 0) ไปกลุ่ม expired (ไม่รวมใน usable)
 */
export function classifyIngredients(
  items: RawIngredientItem[],
  expiringSoonThreshold = 5,
  now: Date = new Date()
): ClassifiedIngredients {
  const expired: RawIngredientItem[] = [];
  const expiringSoon: RawIngredientItem[] = [];
  const fresh: RawIngredientItem[] = [];

  for (const raw of items) {
    const cleanName = raw.name?.trim();
    if (!cleanName) continue;
    if (typeof raw.quantity === 'number' && raw.quantity <= 0) continue;

    const daysLeft = resolveIngredientDaysLeft(raw, now);
    const enriched: RawIngredientItem = {
      ...raw,
      name: cleanName,
      daysLeft,
    };

    if (daysLeft !== null && daysLeft < 0) {
      expired.push(enriched);
    } else if (daysLeft !== null && daysLeft <= expiringSoonThreshold) {
      expiringSoon.push(enriched);
    } else {
      fresh.push(enriched);
    }
  }

  // เรียงวัตถุดิบใกล้หมดอายุจากด่วนที่สุดก่อน
  expiringSoon.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  return {
    expired,
    expiringSoon,
    fresh,
    usable: [...expiringSoon, ...fresh],
  };
}

/**
 * คำนวณน้ำหนักคะแนน (Weight) สำหรับ Weighted Random Recommendation
 * - หมดอายุ (< 0 วัน) -> 0 (ห้ามเลือกเด็ดขาด)
 * - หมดวันนี้ (0 วัน) -> 4.0
 * - 1-2 วัน -> 3.0
 * - 3-5 วัน -> 2.0
 * - สดใหม่ (> 5 วัน หรือไม่ระบุวันหมดอายุ) -> 1.0
 */
export function getIngredientWeight(item: RawIngredientItem, now: Date = new Date()): number {
  const days = resolveIngredientDaysLeft(item, now);
  if (days !== null && days < 0) return 0;
  if (days === 0) return 4.0;
  if (days !== null && days <= 2) return 3.0;
  if (days !== null && days <= 5) return 2.0;
  return 1.0;
}

/**
 * สุ่มวัตถุดิบโฟกัสแบบ Weighted Random (ไม่คืนซ้ำ)
 * ให้โอกาสวัตถุดิบใกล้หมดอายุสูงกว่า แต่ยังผสมวัตถุดิบสดใหม่เพื่อความหลากหลาย
 */
export function pickWeightedFocusIngredients(
  usableItems: RawIngredientItem[],
  count: number,
  rng: () => number = Math.random,
  now: Date = new Date()
): RawIngredientItem[] {
  const pool = usableItems
    .map((item) => ({ item, weight: getIngredientWeight(item, now) }))
    .filter((entry) => entry.weight > 0);

  const selected: RawIngredientItem[] = [];
  const targetCount = Math.min(count, pool.length);

  while (selected.length < targetCount && pool.length > 0) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) break;

    let r = rng() * totalWeight;
    let chosenIdx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    selected.push(pool[chosenIdx].item);
    pool.splice(chosenIdx, 1);
  }

  return selected;
}

/**
 * ตรวจสอบผลลัพธ์จาก AI หลังสร้างเสร็จ (PART 5.3)
 * - ปฏิเสธเมนูที่มีวัตถุดิบหมดอายุ (เว้นแต่มีล็อตใหม่ชื่อเดียวกันที่ยังไม่หมดอายุอยู่ใน usable)
 * - ตรวจยืนยัน flag inFridge กับรายการ usableFridgeItems จริงเท่านั้น
 */
export function validateGeneratedRecipes(
  candidates: GeneratedRecipeCandidate[],
  usableItems: RawIngredientItem[],
  expiredItems: RawIngredientItem[],
  fridgeName: string,
  defaultServings = '2 คน'
): RecipeValidationResult {
  const validRecipes: VerifiedRecipe[] = [];
  const rejectedReasons: string[] = [];

  // ชื่อวัตถุดิบที่หมดอายุและไม่มีล็อตที่ยังไม่หมดอายุทดแทน
  const strictlyExpiredItems = expiredItems.filter(
    (exp) => !usableItems.some((u) => ingredientNamesMatch(u.name, exp.name))
  );

  for (let idx = 0; idx < candidates.length; idx++) {
    const item = candidates[idx];
    const recipeName = String(item?.name || '').trim();
    if (!recipeName) continue;

    const rawIngs = Array.isArray(item.ingredients) ? item.ingredients : [];

    // ตรวจสอบว่าชื่อเมนูหรือส่วนผสมใช้วัตถุดิบที่หมดอายุแล้วหรือไม่
    let expiredHit: string | null = null;
    for (const exp of strictlyExpiredItems) {
      if (ingredientNamesMatch(recipeName, exp.name)) {
        expiredHit = exp.name;
        break;
      }
      if (rawIngs.some((ing) => ing?.name && ingredientNamesMatch(String(ing.name), exp.name))) {
        expiredHit = exp.name;
        break;
      }
    }

    if (expiredHit) {
      rejectedReasons.push(`เมนู "${recipeName}" ถูกตัดออกเนื่องจากมีวัตถุดิบหมดอายุ: "${expiredHit}"`);
      continue;
    }

    const verifiedIngredients: RecipeIngredientVerified[] = rawIngs
      .map((ing) => {
        const ingName = String(ing?.name || '').trim();
        if (!ingName) return null;
        const matchedReal = usableItems.find((real) => ingredientNamesMatch(ingName, real.name));
        const actuallyInFridge = Boolean(matchedReal);
        return {
          name: ingName,
          amount: String(ing?.amount || 'ตามชอบ').trim(),
          inFridge: actuallyInFridge,
          location: actuallyInFridge ? `มีใน ${fridgeName}` : 'ต้องซื้อเพิ่ม / เครื่องปรุง',
        };
      })
      .filter((x): x is RecipeIngredientVerified => x !== null);

    // ต้องมีวัตถุดิบที่มีอยู่จริงในตู้เย็นอย่างน้อย 1 อย่าง
    if (!verifiedIngredients.some((ing) => ing.inFridge)) {
      rejectedReasons.push(`เมนู "${recipeName}" ไม่ได้ใช้วัตถุดิบที่มีอยู่จริงในตู้เย็น "${fridgeName}"`);
      continue;
    }

    const steps = Array.isArray(item.steps)
      ? item.steps.map((st) => String(st).trim()).filter(Boolean)
      : [];

    validRecipes.push({
      id: String(item.id || `recipe-${Date.now()}-${idx + 1}`),
      name: recipeName,
      nameEn: String(item.nameEn || '').trim(),
      tag: String(item.tag || (idx === 0 ? '⭐ แนะนำสำหรับมื้อนี้' : 'เมนูจากของในตู้')).trim(),
      time: String(item.time || '15-20 นาที').trim(),
      difficulty: String(item.difficulty || 'ง่าย').trim(),
      calories: String(item.calories || '~320 kcal').trim(),
      servings: String(item.servings || defaultServings).trim(),
      ingredients: verifiedIngredients,
      steps,
    });
  }

  return {
    validRecipes,
    rejectedCount: rejectedReasons.length,
    rejectedReasons,
  };
}
