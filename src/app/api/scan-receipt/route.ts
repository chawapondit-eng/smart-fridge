import { NextRequest, NextResponse } from 'next/server';

interface ParsedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price?: number;
  confidence: number;
}

// ล้างชื่อสินค้าและตัดคำที่ไม่เกี่ยวข้อง
function cleanItemName(name: string): string {
  return name
    .replace(/^[\d\.\-\*\#\s]+/, '') // ตัดตัวเลขนำหน้า เช่น "1. " หรือ "01 "
    .replace(/\s+[\d\.]+\s*(บาท|baht|v|b)?$/i, '') // ตัดราคาท้ายชื่อ เช่น " 45.00V บาท"
    .trim();
}

// คาดเดาหน่วยนับจากชื่อสินค้า
function guessUnit(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ข้าว') || lower.includes('ผัด') || lower.includes('กะเพรา') || lower.includes('กระเพรา')) return 'จาน';
  if (lower.includes('นม') || lower.includes('น้ำ') || lower.includes('โค้ก') || lower.includes('ชา') || lower.includes('ไวน์')) return 'ขวด';
  if (lower.includes('ไข่')) return 'ฟอง';
  if (lower.includes('ขนมปัง')) return 'แถว';
  if (lower.includes('เนื้อ') || lower.includes('หมู') || lower.includes('ไก่')) return 'แพ็ก';
  if (lower.includes('แกง') || lower.includes('ต้ม') || lower.includes('ซุป')) return 'ถุง';
  return 'ชิ้น';
}

// แยก JSON Array ออกจากข้อความ AI อย่างปลอดภัย
function extractJsonArray(text: string): unknown[] | null {
  try {
    const direct = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    if (Array.isArray(direct)) return direct;
  } catch {}

  // หา [ และ ]
  const startIdx = text.indexOf('[');
  const endIdx = text.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const candidate = text.substring(startIdx, endIdx + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  // หา { items: [...] }
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    const candidate = text.substring(objStart, objEnd + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && Array.isArray(parsed.products)) return parsed.products;
    } catch {}
  }

  return null;
}

// ระบบดึงข้อมูลจากข้อความใบเสร็จไทย (Thai Receipt Text Parser)
function parseThaiReceiptText(rawText: string): ParsedItem[] {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  const ignoreKeywords = [
    'tax', 'invoice', 'taxid', 'vat', 'total', 'subtotal', 'cash', 'change',
    'ยอดรวม', 'รวมทั้งสิ้น', 'ภาษี', 'เงินสด', 'เงินทอน', 'สาขา', 'วันที่', 'date',
    'time', 'เวลา', 'เครื่องที่', 'vid', 'ref', 'pos', 'member', 'clubcard',
    'ยินดีต้อนรับ', 'ขอบคุณ', 'thank', 'tel', 'โทร', 'คงเหลือ', 'แต้ม', 'point',
    'ใบกำกับภาษี', 'อย่างย่อ', 'ใบเสร็จรับเงิน', 'รายการ', 'มูลค่า'
  ];

  let idCounter = 1;

  for (const line of lines) {
    const lower = line.toLowerCase();
    // ข้าม Header/Footer
    if (ignoreKeywords.some((k) => lower.includes(k) && !lower.includes('ข้าว') && !lower.includes('ไก่') && !lower.includes('นม') && !lower.includes('ไข่'))) {
      if (lower.includes('ยอดรวม') || lower.includes('total') || lower.includes('vat') || lower.includes('คงเหลือ') || lower.includes('แต้ม') || lower.includes('มูลค่า')) {
        continue;
      }
    }

    // แบบที่ 1: "1. ข้าวผัดพริก กระเพรา 1 45.00V บาท" หรือ "2. ข้าวเปล่า 1 10.00 บาท"
    const match = line.match(/^(\d+)[\.\s]+(.+?)(?:\s+(\d+)\s+([\d\.]+.*))?$/);
    if (match) {
      let rawName = match[2].trim();
      let qty = match[3] ? parseInt(match[3], 10) : 1;

      const innerMatch = rawName.match(/^(.+?)\s+(\d+)\s+([\d\.]+.*)$/);
      if (innerMatch) {
        rawName = innerMatch[1].trim();
        qty = parseInt(innerMatch[2], 10) || 1;
      }

      rawName = cleanItemName(rawName);

      if (rawName.length >= 2 && !ignoreKeywords.some((k) => rawName.toLowerCase() === k)) {
        items.push({
          id: String(idCounter++),
          name: rawName,
          quantity: qty || 1,
          unit: guessUnit(rawName),
          confidence: 0.90,
        });
        continue;
      }
    }

    // แบบที่ 2: "ข้าวผัดกะเพรา 1 50"
    const matchQtyPrice = line.match(/^(.+?)\s+(\d+)\s+([\d\.]+.*)$/);
    if (matchQtyPrice) {
      const rawName = cleanItemName(matchQtyPrice[1].trim());
      const qty = parseInt(matchQtyPrice[2], 10) || 1;

      if (rawName.length >= 2 && !ignoreKeywords.some((k) => rawName.toLowerCase().includes(k))) {
        items.push({
          id: String(idCounter++),
          name: rawName,
          quantity: qty,
          unit: guessUnit(rawName),
          confidence: 0.85,
        });
      }
    }
  }

  return items;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientApiKey = (formData.get('apiKey') as string) || req.headers.get('x-gemini-key') || '';

    if (!file) {
      return NextResponse.json({ error: 'ไม่พบไฟล์รูปภาพใบเสร็จ' }, { status: 400 });
    }

    const apiKey =
      clientApiKey.trim() ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 1. ถ้ามี Gemini API Key ให้ใช้ Gemini Vision AI
    if (apiKey) {
      const modelsToTry = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
      ];
      let lastGeminiErr = '';

      for (const model of modelsToTry) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `คุณคือ AI ผู้เชี่ยวชาญด้านการอ่านใบเสร็จรับเงิน (Receipt OCR) สำหรับนำอาหารและของสดเข้าตู้เย็น
จงอ่านภาพใบเสร็จนี้อย่างละเอียด และดึงเฉพาะ "รายการสินค้าอาหาร เครื่องดื่ม หรือของสด" เท่านั้น
(ไม่ต้องเอา ยอดรวม, ภาษี VAT, เงินสด, เงินทอน, เลขที่ใบเสร็จ, ชื่อสาขา, รหัสบัตร, วันที่, หรือข้อความอื่นๆ ที่ไม่ใช่สินค้า)

ตอบกลับเป็น JSON array ของวัตถุเท่านั้นในรูปแบบนี้:
[
  {
    "name": "ชื่อสินค้าภาษาไทยตามที่ปรากฏในใบเสร็จ เช่น ข้าวผัดพริกกระเพรา หรือ ข้าวเปล่า",
    "quantity": 1,
    "unit": "หน่วยนับที่เหมาะสม เช่น จาน, กล่อง, ขวด, แพ็ก, ชิ้น, ถุง",
    "price": 45.0,
    "confidence": 0.95
  }
]
คำสั่งเด็ดขาด: ให้ตอบกลับเป็น JSON array ล้วนๆ เท่านั้น ห้ามใส่คำอธิบายนำหน้าหรือต่อท้าย ห้ามใส่เครื่องหมาย markdown codeblock`,
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

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = extractJsonArray(rawText);

            if (Array.isArray(parsed) && parsed.length > 0) {
              const items: ParsedItem[] = parsed.map((item: any, idx: number) => ({
                id: String(idx + 1),
                name: String(item.name || '').trim(),
                quantity: Number(item.quantity) || 1,
                unit: String(item.unit || guessUnit(String(item.name || ''))).trim(),
                price: Number(item.price) || 0,
                confidence: Number(item.confidence) || 0.95,
              }));

              return NextResponse.json({
                success: true,
                engine: `gemini_vision (${model})`,
                items,
              });
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

    // 3. ถ้าไม่มี API key หรือ OCR อ่านไม่ออก แจ้งเตือนตรงไปตรงมา
    return NextResponse.json(
      {
        success: false,
        error: apiKey
          ? 'AI ไม่สามารถอ่านตัวหนังสือจากภาพใบเสร็จได้ชัดเจน กรุณาถ่ายภาพใหม่ให้ตรงและคมชัดขึ้น หรือพิมพ์เพิ่มรายการเอง'
          : 'ต้องการ Google Gemini API Key เพื่อเปิดใช้งาน AI Vision สแกนใบเสร็จไทยจริง (รับฟรีใน 10 วินาที)',
        needApiKey: !apiKey,
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
