import { NextRequest, NextResponse } from 'next/server';
import {
  classifyProductSemantically,
  sanitizeProductName,
  normalizeProductKey,
  isOcrNoiseOrReceiptMetadata,
  guessSmartUnit,
  extractUnitFromText,
  type ProductCategory,
} from '@/lib/productClassifier';

export interface ParsedItemPayload {
  id: string;
  name: string;
  normalizedName?: string;
  category: ProductCategory;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  price: number | null; // For backward compatibility (= lineTotal ?? unitPrice)
  discount?: number | null;
  confidence: number;
  reason: string;
  rawText?: string;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  isFoodOrSeasoning: boolean;
}

// แปลงข้อความราคาเป็นตัวเลขอย่างปลอดภัย (ถ้าไม่พบราคา คืนค่า null ห้ามคืน 0.00)
function parseSafePrice(rawPrice: unknown): number | null {
  if (rawPrice === null || rawPrice === undefined) return null;
  if (typeof rawPrice === 'number') {
    return !isNaN(rawPrice) && rawPrice > 0 ? Number(rawPrice.toFixed(2)) : null;
  }
  const str = String(rawPrice)
    .replace(/,/g, '')
    .replace(/[฿\$\sBahtbahtTHBthbVvBบาท]/g, '')
    .trim();
  const m = str.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return !isNaN(val) && val > 0 ? Number(val.toFixed(2)) : null;
}

// แยกข้อมูลร้านค้าและรายการสินค้าจากข้อความ AI อย่างปลอดภัย
function extractReceiptPayload(text: string): { store?: string; items: unknown[]; purchase_date?: string | null } | null {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    const direct = JSON.parse(stripped);
    if (Array.isArray(direct)) return { items: direct };
    if (direct && typeof direct === 'object') {
      const items = Array.isArray(direct.items)
        ? direct.items
        : Array.isArray(direct.products)
        ? direct.products
        : null;
      if (items) {
        return {
          store: typeof direct.store === 'string' ? direct.store.trim() : undefined,
          purchase_date: typeof direct.purchase_date === 'string' ? direct.purchase_date.trim() : null,
          items,
        };
      }
    }
  } catch {}

  // ค้นหา { ... }
  const objStart = stripped.indexOf('{');
  const objEnd = stripped.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    const candidate = stripped.substring(objStart, objEnd + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.items)) {
        return {
          store: typeof parsed.store === 'string' ? parsed.store.trim() : undefined,
          purchase_date: typeof parsed.purchase_date === 'string' ? parsed.purchase_date.trim() : null,
          items: parsed.items,
        };
      }
      if (parsed && Array.isArray(parsed.products)) {
        return {
          store: typeof parsed.store === 'string' ? parsed.store.trim() : undefined,
          purchase_date: typeof parsed.purchase_date === 'string' ? parsed.purchase_date.trim() : null,
          items: parsed.products,
        };
      }
    } catch {}
  }

  // ค้นหา [ ... ]
  const startIdx = stripped.indexOf('[');
  const endIdx = stripped.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const candidate = stripped.substring(startIdx, endIdx + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { items: parsed };
    } catch {}
  }

  return null;
}

// ประมวลผลและตรวจสอบ Semantic Validation ในแต่ละรายการ
function validateAndEnrichItems(rawItems: unknown[], receiptPurchaseDate?: string | null): ParsedItemPayload[] {
  const results: ParsedItemPayload[] = [];
  let idCounter = 1;

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const originalName = String(item.name || item.item_name || '').trim();
    if (!originalName) continue;

    // 1. ตรวจสอบ Noise และข้อมูลส่วนลด/ภาษี/ยอดรวม
    if (isOcrNoiseOrReceiptMetadata(originalName)) {
      continue;
    }

    const cleanedName = sanitizeProductName(originalName);
    if (!cleanedName || cleanedName.length < 2) {
      continue;
    }

    // 2. วิเคราะห์ Semantic Classification ผ่านกฎและพจนานุกรม
    const semanticResult = classifyProductSemantically(cleanedName);

    // 3. กำหนด Category โดยให้ความสำคัญกับ Semantic Rule Engine เพื่อความแม่นยำ
    let finalCategory: ProductCategory = semanticResult.category;
    let finalConfidence = semanticResult.confidence;
    let finalReason = semanticResult.reason;

    // ถ้า AI ระบุ category มาแล้ว แต่ Rule Engine มีความมั่นใจสูงกว่า ให้ใช้ Rule Engine (ป้องกัน AI หลุด)
    const aiCategory = String(item.category || '').toLowerCase();
    if (aiCategory === 'non_food' && finalCategory !== 'non_food') {
      finalCategory = 'non_food';
      finalConfidence = Math.max(finalConfidence, 0.90);
      finalReason = 'AI จำแนกเป็นของใช้ที่ไม่ใช่อาหาร';
    } else if ((aiCategory === 'seasoning' || aiCategory === 'food') && finalCategory === 'unknown') {
      finalCategory = aiCategory as ProductCategory;
      finalConfidence = 0.85;
      finalReason = aiCategory === 'seasoning' ? 'เครื่องปรุงและส่วนประกอบอาหาร' : 'อาหารและเครื่องดื่ม';
    }

    // 4. วิเคราะห์จำนวน (Quantity) — รองรับทศนิยม เช่น 0.5 กก. หรือ 250 มล.
    const rawQty = item.quantity;
    let quantity = 1;
    if (typeof rawQty === 'number' && !isNaN(rawQty) && rawQty > 0) {
      quantity = rawQty;
    } else if (typeof rawQty === 'string') {
      const parsedQty = parseFloat(rawQty);
      if (!isNaN(parsedQty) && parsedQty > 0) quantity = parsedQty;
    }

    // 5. วิเคราะห์หน่วย (Unit) อย่างชาญฉลาดตามบริบทสินค้า
    const explicitUnit = extractUnitFromText(originalName) || extractUnitFromText(cleanedName);
    let unit = String(item.unit || '').trim();
    if (!unit || unit === 'ชิ้น' || unit === 'undefined') {
      unit = explicitUnit || guessSmartUnit(cleanedName, finalCategory, originalName);
    }

    // 6. วิเคราะห์ราคาต่อหน่วย (unitPrice) และราคารวม (lineTotal)
    // ตรวจสอบครอบคลุมทุกคีย์ที่ AI และ OCR อาจส่งกลับมา
    let unitPrice = parseSafePrice(item.unit_price ?? item.unitPrice);
    let lineTotal = parseSafePrice(
      item.line_total ??
      item.lineTotal ??
      item.total_price ??
      item.totalPrice ??
      item.total ??
      item.amount
    );
    const genericPrice = parseSafePrice(item.price ?? item.cost ?? item.item_price);

    if (lineTotal === null && genericPrice !== null) {
      if (quantity === 1) {
        lineTotal = genericPrice;
        if (unitPrice === null) unitPrice = genericPrice;
      } else {
        // เมื่อ quantity > 1
        if (unitPrice !== null) {
          lineTotal = Math.round(unitPrice * quantity * 100) / 100;
        } else {
          lineTotal = genericPrice;
          unitPrice = Math.round((genericPrice / quantity) * 100) / 100;
        }
      }
    } else if (lineTotal !== null && unitPrice === null) {
      unitPrice = quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : null;
    } else if (unitPrice !== null && lineTotal === null) {
      lineTotal = Math.round(unitPrice * quantity * 100) / 100;
    }

    const discount = parseSafePrice(item.discount);
    const expiryDate = typeof item.expiry_date === 'string' && item.expiry_date.trim() ? item.expiry_date.trim() : null;

    results.push({
      id: String(idCounter++),
      name: cleanedName,
      normalizedName: normalizeProductKey(cleanedName),
      category: finalCategory,
      quantity,
      unit,
      unitPrice,
      lineTotal,
      price: lineTotal ?? unitPrice,
      discount,
      confidence: Number(finalConfidence.toFixed(2)),
      reason: finalReason,
      rawText: originalName,
      purchaseDate: receiptPurchaseDate || null,
      expiryDate,
      isFoodOrSeasoning: finalCategory === 'food' || finalCategory === 'seasoning',
    });
  }

  return results;
}

// ระบบดึงข้อมูลจากข้อความใบเสร็จไทย (Thai Receipt Multiline & Spatial Text Parser)
function parseThaiReceiptText(rawText: string): ParsedItemPayload[] {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const candidates: Array<{
    name: string;
    quantity: number;
    unit?: string;
    unit_price?: number | null;
    line_total?: number | null;
    price: number | null;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isOcrNoiseOrReceiptMetadata(line)) continue;

    // ตรวจสอบบรรทัดถัดไป (Lookahead) สำหรับใบเสร็จที่แยกชื่อสินค้ากับราคาคนละบรรทัด (Multiline Pairing)
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

    // แบบที่ 1: "1. นมสด 2 กล่อง 70.00 บาท" หรือ "1. ข้าวผัด 1 จาน 50.00 บาท" ในบรรทัดเดียว
    const matchWithUnit = line.match(/^(\d+)[\.\s]+(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s\.\,]+)\s+([\d,\.]+.*)$/);
    if (matchWithUnit) {
      const rawName = matchWithUnit[2].trim();
      const qty = parseFloat(matchWithUnit[3]) || 1;
      const detectedUnit = matchWithUnit[4].trim();
      const price = parseSafePrice(matchWithUnit[5]);
      const clean = sanitizeProductName(rawName);

      if (clean && !isOcrNoiseOrReceiptMetadata(clean)) {
        candidates.push({
          name: clean,
          quantity: qty,
          unit: detectedUnit,
          line_total: price,
          price,
        });
        continue;
      }
    }

    // แบบที่ 2: Multiline Lookahead
    // บรรทัดที่ 1 คือชื่อสินค้า (เช่น "CP นมสด 200ml" หรือ "1. ไข่ไก่เบอร์ 2")
    // บรรทัดที่ 2 มีจำนวน x ราคา (เช่น "1 x 55.00  55.00" หรือ "2 กล่อง 70.00" หรือ "45.00")
    if (nextLine && !isOcrNoiseOrReceiptMetadata(line)) {
      const cleanCurrent = sanitizeProductName(line);
      if (cleanCurrent && cleanCurrent.length >= 2) {
        // เช็คว่าบรรทัดถัดไปมีรูปแบบ "จำนวน x ราคาต่อหน่วย ราคารวม" หรือไม่ (เช่น "2 x 35.00 70.00")
        const multilineWithQty = nextLine.match(/^(\d+(?:\.\d+)?)\s*(?:x|\*|\@)?\s*([\d,\.]+)(?:\s+([\d,\.]+))?$/i);
        if (multilineWithQty) {
          const qty = parseFloat(multilineWithQty[1]) || 1;
          const priceA = parseSafePrice(multilineWithQty[2]);
          const priceB = multilineWithQty[3] ? parseSafePrice(multilineWithQty[3]) : null;

          let unitPrice = priceA;
          let lineTotal = priceB ?? (priceA !== null ? Math.round(priceA * qty * 100) / 100 : null);
          if (priceB !== null && priceA !== null && qty > 1) {
            unitPrice = priceA;
            lineTotal = priceB;
          }

          candidates.push({
            name: cleanCurrent,
            quantity: qty,
            unit_price: unitPrice,
            line_total: lineTotal,
            price: lineTotal ?? unitPrice,
          });
          i++; // ข้ามบรรทัดราคาที่จับคู่ไปแล้ว
          continue;
        }

        // เช็คว่าบรรทัดถัดไปเป็นตัวเลขราคาเพียวๆ หรือไม่ (เช่น "55.00" หรือ "45.00 บาท")
        const purePriceMatch = nextLine.match(/^([\d,\.]+(?:\.\d{2})?)\s*(?:บาท|baht|v|b)?$/i);
        if (purePriceMatch) {
          const price = parseSafePrice(purePriceMatch[1]);
          if (price !== null) {
            candidates.push({
              name: cleanCurrent,
              quantity: 1,
              line_total: price,
              unit_price: price,
              price,
            });
            i++; // ข้ามบรรทัดราคาที่จับคู่ไปแล้ว
            continue;
          }
        }
      }
    }

    // แบบที่ 3: "1. ข้าวผัดพริก กระเพรา 1 45.00V บาท"
    const matchWithNum = line.match(/^(\d+)[\.\s]+(.+?)(?:\s+(\d+(?:\.\d+)?)\s+([\d,\.]+.*))?$/);
    if (matchWithNum) {
      let rawName = matchWithNum[2].trim();
      let qty = matchWithNum[3] ? parseFloat(matchWithNum[3]) : 1;
      let price = parseSafePrice(matchWithNum[4]);

      const innerMatch = rawName.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,\.]+.*)$/);
      if (innerMatch) {
        rawName = innerMatch[1].trim();
        qty = parseFloat(innerMatch[2]) || 1;
        price = parseSafePrice(innerMatch[3]);
      } else if (price === null) {
        const trailingPrice = rawName.match(/\s+([\d,]+\.\d{2})\s*(?:บาท|baht|v|b)?$/i);
        if (trailingPrice) {
          price = parseSafePrice(trailingPrice[1]);
        }
      }

      const clean = sanitizeProductName(rawName);
      if (clean && !isOcrNoiseOrReceiptMetadata(clean)) {
        candidates.push({ name: clean, quantity: qty || 1, price });
        continue;
      }
    }

    // แบบที่ 4: "นมสด 2 กล่อง 70.00"
    const matchNamedWithUnit = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([^\d\s\.\,]+)\s+([\d,\.]+.*)$/);
    if (matchNamedWithUnit) {
      const clean = sanitizeProductName(matchNamedWithUnit[1].trim());
      const qty = parseFloat(matchNamedWithUnit[2]) || 1;
      const detectedUnit = matchNamedWithUnit[3].trim();
      const price = parseSafePrice(matchNamedWithUnit[4]);
      if (clean && !isOcrNoiseOrReceiptMetadata(clean)) {
        candidates.push({
          name: clean,
          quantity: qty,
          unit: detectedUnit,
          line_total: price,
          price,
        });
        continue;
      }
    }

    // แบบที่ 5: "นมสด 1 45.00" หรือ "นมสด 45.00"
    const matchQtyPrice = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,\.]+.*)$/);
    if (matchQtyPrice) {
      const clean = sanitizeProductName(matchQtyPrice[1].trim());
      const qty = parseFloat(matchQtyPrice[2]) || 1;
      const price = parseSafePrice(matchQtyPrice[3]);
      if (clean && !isOcrNoiseOrReceiptMetadata(clean)) {
        candidates.push({ name: clean, quantity: qty, price });
        continue;
      }
    }

    // แบบที่ 6: ท้ายชื่อมีราคา เช่น "ข้าวผัดกระเพรา 50.00"
    const matchTrailing = line.match(/^(.+?)\s+([\d,]+\.\d{2})\s*(?:บาท|baht|v|b)?$/i);
    if (matchTrailing) {
      const clean = sanitizeProductName(matchTrailing[1].trim());
      const price = parseSafePrice(matchTrailing[2]);
      if (clean && !isOcrNoiseOrReceiptMetadata(clean)) {
        candidates.push({ name: clean, quantity: 1, price });
      }
    }
  }

  return validateAndEnrichItems(candidates);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientApiKey = (formData.get('apiKey') as string) || req.headers.get('x-gemini-key') || '';

    if (!file) {
      return NextResponse.json({ error: 'ไม่พบไฟล์รูปภาพใบเสร็จ' }, { status: 400 });
    }

    const serverApiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    const clientKey = clientApiKey.trim();
    // Prioritize keys: if client provided a key, try it; then fallback to server key if different
    const candidateKeys = [clientKey, serverApiKey].filter(
      (k, idx, arr): k is string => Boolean(k) && arr.indexOf(k) === idx
    );

    const buffer = await file.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 1. ถ้ามี Gemini API Key ให้ใช้ Gemini Vision AI พร้อม Intelligent Semantic Prompting
    if (candidateKeys.length > 0) {
      // โมเดลที่พร้อมให้บริการจริงในปัจจุบัน (จัดลำดับตามความเร็วและโควตา: flash-lite -> flash-latest -> 3.8-flash)
      const modelsToTry = [
        'gemini-flash-lite-latest',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ];
      let lastGeminiErr = '';

      for (const currentKey of candidateKeys) {
        for (const model of modelsToTry) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': currentKey,
                },
                signal: controller.signal,
                body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `คุณคือ AI ผู้เชี่ยวชาญด้านการอ่านใบเสร็จรับเงิน (Receipt OCR) และการจำแนกประเภทสินค้าสำหรับระบบ Smart Fridge
จงอ่านภาพใบเสร็จนี้อย่างละเอียด และจำแนกรายการสินค้าออกเป็น 4 หมวดหมู่:
1. "food": อาหาร เครื่องดื่ม ผัก ผลไม้ เนื้อสัตว์ นม ไข่ ข้าว ขนมปัง อาหารสำเร็จรูป
2. "seasoning": เครื่องปรุงรสและส่วนประกอบอาหาร เช่น น้ำปลา, ซีอิ๊ว, ซอสปรุงรส, ซอสหอยนางรม, น้ำมันพืช, น้ำตาล, เกลือ, ผงชูรส, ผงปรุงรส, พริกไทย, เครื่องเทศ, เครื่องแกง (หมวดนี้เป็นส่วนประกอบอาหารที่นำเข้าตู้เย็น/คลังอาหารได้)
3. "non_food": ของใช้ในบ้าน ผลิตภัณฑ์ทำความสะอาด ของใช้ส่วนตัว เช่น น้ำยาล้างจาน, ผงซักฟอก, น้ำยาปรับผ้านุ่ม, แชมพู, สบู่, ยาสีฟัน, กระดาษทิชชู่, ถุงขยะ, ฟองน้ำล้างจาน
4. "unknown": ข้อความที่ไม่สามารถระบุได้ว่าเป็นสินค้า หรือข้อความอ่านไม่ออก

กฎข้อห้ามและคำแนะนำสำคัญ:
- ห้ามดึงข้อมูลที่ไม่ใช่สินค้า เช่น หัวใบเสร็จ, สาขา, วันที่, ยอดรวม (TOTAL), ยอดก่อนภาษี (SUBTOTAL), ภาษี (VAT), เงินสด (CASH), เงินทอน (CHANGE), ส่วนลดรวม (DISCOUNT), หมายเลขใบเสร็จ
- ต้องแยก "unit_price" (ราคาต่อหน่วย) กับ "line_total" (ราคารวมของรายการ) ให้ชัดเจน:
  * ตัวอย่าง: "นมสด 2 กล่อง 70.00 บาท" -> quantity: 2, unit: "กล่อง", unit_price: 35.00, line_total: 70.00
  * ตัวอย่าง: "ไข่ไก่ 1 แผง 45.00 บาท" -> quantity: 1, unit: "แผง", unit_price: 45.00, line_total: 45.00
  * ตัวอย่าง: "ข้าวผัด 1 จาน 50.00 บาท" -> quantity: 1, unit: "จาน", unit_price: 50.00, line_total: 50.00
  * ห้ามนำราคารวมของสินค้าหลายชิ้นมาแสดงเป็นราคาต่อหน่วยโดยไม่คำนวณ
  * หากอ่านราคาไม่ได้ ให้ใส่ null ทั้ง unit_price และ line_total (ห้ามใส่ 0.00 หรือสร้างราคาเองเด็ดขาด)
- วิเคราะห์ "unit" (หน่วยนับ) ให้สอดคล้องกับสินค้าจริง ห้ามกำหนดทุกรายการเป็น "ชิ้น":
  * จำนวนชิ้น: ชิ้น, อัน, ฟอง, ลูก, ใบ, ผล, หัว, ต้น, แผง, แพ็ค
  * บรรจุภัณฑ์: กล่อง, ขวด, กระป๋อง, ถุง, ห่อ, ถาด, มัด, กระปุก, หลอด
  * อาหารและเครื่องดื่ม: จาน, ถ้วย, ชาม, แก้ว, เสิร์ฟ
  * น้ำหนัก/ปริมาตร: กรัม, กิโลกรัม, มิลลิลิตร, ลิตร
  * เช่น ไข่ไก่ = ฟอง หรือ แผง, นมสด = กล่อง, น้ำปลา = ขวด, น้ำตาล = กิโลกรัม หรือ ถุง, ผักบุ้ง = มัด, ข้าวผัด = จาน
- "quantity" ดึงตามตัวเลขจริง รองรับทศนิยม เช่น 0.5 หรือ 250
- "expiry_date" ให้ระบุ YYYY-MM-DD เฉพาะกรณีที่มีพิมพ์ระบุวันหมดอายุไว้จริงบนใบเสร็จเท่านั้น หากไม่มีให้ใส่ null (ห้ามสร้างวันหมดอายุเองเด็ดขาด)

ตอบกลับเป็น JSON object รูปแบบนี้เท่านั้น:
{
  "store": "ชื่อร้านค้าหรือซูเปอร์มาร์เก็ต (เช่น 7-Eleven, Lotus's, Big C, Tops, Makro หรือ 'ซูเปอร์มาร์เก็ต')",
  "purchase_date": "YYYY-MM-DD หรือ null หากไม่มี",
  "items": [
    {
      "name": "ชื่อสินค้าภาษาไทย",
      "category": "food" | "seasoning" | "non_food" | "unknown",
      "quantity": 1,
      "unit": "ขวด/กล่อง/จาน/ฟอง/แผง/มัด/ถุง/กิโลกรัม",
      "unit_price": 35.0,
      "line_total": 70.0,
      "discount": null,
      "expiry_date": null,
      "confidence": 0.95,
      "reason": "เหตุผลการจำแนกประเภท",
      "raw_text": "ข้อความเดิมบนใบเสร็จ"
    }
  ]
}
คำสั่งเด็ดขาด: ตอบกลับเป็น JSON ล้วนๆ เท่านั้น ห้ามใส่คำอธิบายนำหน้าหรือต่อท้าย ห้ามใส่เครื่องหมาย markdown codeblock`,
                      },
                      {
                        inline_data: {
                          mime_type: mimeType,
                          data: base64Data,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                },
              }),
            }
          );
          clearTimeout(timeoutId);

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const payload = extractReceiptPayload(rawText);

            if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
              const enrichedItems = validateAndEnrichItems(payload.items, payload.purchase_date);

              if (enrichedItems.length > 0) {
                return NextResponse.json({
                  success: true,
                  engine: `gemini_vision (${model})`,
                  store: payload.store || 'ซูเปอร์มาร์เก็ต',
                  purchase_date: payload.purchase_date || null,
                  items: enrichedItems,
                });
              }
            }
          } else {
            const errBody = await geminiRes.text();
            lastGeminiErr = `${model}: ${errBody}`;
            console.warn(`Gemini ${model} failed:`, errBody);
          }
        } catch (mErr: unknown) {
          lastGeminiErr = mErr instanceof Error ? mErr.message : String(mErr);
        }
      }
    }

    console.warn('All Gemini models attempted, error:', lastGeminiErr);
  }

  // 2. Fallback: OCR.space Free API (Thai OCR)
  try {
    const ocrFormData = new FormData();
    ocrFormData.append('base64Image', `data:${mimeType};base64,${base64Data}`);
    ocrFormData.append('language', 'tha');
    ocrFormData.append('isOverlayRequired', 'false');
    ocrFormData.append('filetype', 'JPG');
    ocrFormData.append('detectOrientation', 'true');
    ocrFormData.append('scale', 'true');
    ocrFormData.append('OCREngine', '2');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: 'K88796489488957',
      },
      body: ocrFormData,
    });

    if (ocrRes.ok) {
      const ocrData = await ocrRes.json();
      const parsedResults = ocrData.ParsedResults?.[0]?.ParsedText || '';
      if (parsedResults) {
        const items = parseThaiReceiptText(parsedResults);
        if (items.length > 0) {
          return NextResponse.json({
            success: true,
            engine: 'ocr_space',
            items,
            raw_text: parsedResults,
          });
        }
      }
    }
  } catch (ocrErr) {
    console.warn('OCR.space failed:', ocrErr);
  }

  return NextResponse.json(
    {
      success: false,
      error: candidateKeys.length > 0
        ? 'AI ไม่สามารถอ่านตัวหนังสือจากภาพใบเสร็จได้ชัดเจน กรุณาถ่ายภาพใหม่ให้ตรงและคมชัดขึ้น หรือพิมพ์เพิ่มรายการเอง'
        : 'ต้องการ Google Gemini API Key เพื่อเปิดใช้งาน AI Vision สแกนใบเสร็จไทยจริง (รับฟรีใน 10 วินาที)',
      needApiKey: candidateKeys.length === 0,
    },
    { status: 422 }
  );
  } catch (error: unknown) {
    console.error('Scan receipt API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการประมวลผลใบเสร็จ' },
      { status: 500 }
    );
  }
}
