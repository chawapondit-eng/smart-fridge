import { NextRequest, NextResponse } from 'next/server';
import {
  classifyIngredients,
  pickWeightedFocusIngredients,
  validateGeneratedRecipes,
  type RawIngredientItem,
  type GeneratedRecipeCandidate,
} from '@/lib/recipeEngine';

export const runtime = 'nodejs';

async function callGeminiForRecipes(
  apiKey: string,
  systemPrompt: string,
  temperature: number
): Promise<{ candidates: GeneratedRecipeCandidate[] | null; modelUsed: string; lastError: string }> {
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
  ];

  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 1800,
            },
          }),
        }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        lastError = `Gemini ${model} HTTP ${res.status}`;
        continue;
      }

      const raw = await res.json();
      const text = raw.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) {
        lastError = `Gemini ${model} empty response`;
        continue;
      }

      let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIdx = clean.indexOf('[');
      const endIdx = clean.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        clean = clean.substring(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          candidates: parsed as GeneratedRecipeCandidate[],
          modelUsed: model,
          lastError: '',
        };
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`Gemini model ${model} failed:`, lastError);
    }
  }

  return { candidates: null, modelUsed: '', lastError };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // รองรับทั้งรูปแบบใหม่ (allItems) และรูปแบบเดิม (priorityIngredients + otherIngredients + expiredIngredients)
    const incomingItems: RawIngredientItem[] = [];
    if (Array.isArray(body.allItems)) {
      incomingItems.push(...body.allItems);
    } else {
      if (Array.isArray(body.priorityIngredients)) incomingItems.push(...body.priorityIngredients);
      if (Array.isArray(body.otherIngredients)) incomingItems.push(...body.otherIngredients);
      if (Array.isArray(body.ingredients)) {
        for (const it of body.ingredients) {
          incomingItems.push(typeof it === 'string' ? { name: it } : it);
        }
      }
    }

    const explicitExpired: RawIngredientItem[] = Array.isArray(body.expiredIngredients)
      ? body.expiredIngredients
      : [];

    const fridgeName: string =
      typeof body.fridgeName === 'string' && body.fridgeName.trim()
        ? body.fridgeName.trim()
        : 'ตู้เย็นที่เลือก';

    const preferences: string[] = Array.isArray(body.preferences) ? body.preferences : ['easy'];
    const cookingTime: string = typeof body.cookingTime === 'string' ? body.cookingTime : 'any';
    const servings: string = typeof body.servings === 'string' ? body.servings : '2 คน';
    const previousRecipeNames: string[] = Array.isArray(body.previousRecipeNames)
      ? body.previousRecipeNames.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    // 1. กรองและจำแนกวัตถุดิบฝั่ง Backend ด้วย Asia/Bangkok Calendar Date (ไม่พึ่งพาแค่ Frontend/Prompt)
    const classified = classifyIngredients(incomingItems);
    const allExpired: RawIngredientItem[] = [...classified.expired, ...explicitExpired];

    if (classified.usable.length === 0) {
      const msg =
        allExpired.length > 0
          ? `วัตถุดิบในตู้เย็น "${fridgeName}" หมดอายุทั้งหมดแล้ว (${allExpired.length} รายการ) ระบบไม่อนุญาตให้นำของหมดอายุมาแนะนำเมนูอาหาร`
          : `ไม่มีวัตถุดิบที่พร้อมใช้งานในตู้เย็น "${fridgeName}" กรุณาเพิ่มวัตถุดิบก่อนสุ่มเมนู`;
      return NextResponse.json(
        {
          success: false,
          error: msg,
          excludedExpiredCount: allExpired.length,
        },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env.local กรุณาตั้งค่า API Key ก่อนใช้งานระบบแนะนำเมนู AI',
        },
        { status: 503 }
      );
    }

    // 2. Weighted Random Selection: ให้คะแนนสูงกับของใกล้หมดอายุ แต่ยังสุ่มผสมของสดใหม่เพื่อความหลากหลาย
    const focusCount = Math.min(classified.usable.length, Math.max(2, Math.min(5, classified.usable.length)));
    const weightedFocus = pickWeightedFocusIngredients(classified.usable, focusCount);

    const prefTexts: string[] = [];
    if (preferences.includes('easy')) prefTexts.push('ทำง่าย ไม่ซับซ้อน');
    if (preferences.includes('healthy')) prefTexts.push('เพื่อสุขภาพ ไขมันต่ำ แคลอรี่เหมาะสม');
    if (preferences.includes('budget')) prefTexts.push('ประหยัดงบ ใช้วัตถุดิบที่มีอยู่ให้คุ้มค่าที่สุด');
    if (preferences.includes('thai')) prefTexts.push('อาหารไทย');
    if (preferences.includes('fusion')) prefTexts.push('อาหารฟิวชั่นหรือนานาชาติทำเองได้ง่าย');

    if (cookingTime === '15') prefTexts.push('ใช้เวลาทำไม่เกิน 15 นาที');
    else if (cookingTime === '30') prefTexts.push('ใช้เวลาทำไม่เกิน 30 นาที');

    const prefPrompt =
      prefTexts.length > 0 ? prefTexts.join(', ') : 'อร่อย ทำได้จริงที่บ้าน และหลากหลาย';

    const expiringText =
      classified.expiringSoon.length > 0
        ? classified.expiringSoon
            .map(
              (i) =>
                `- ${i.name} (คงเหลือ ${i.quantity || 1} ${i.unit || 'ชิ้น'}, ${
                  i.daysLeft === 0 ? 'หมดอายุวันนี้' : `เหลือ ${i.daysLeft} วัน`
                })`
            )
            .join('\n')
        : '(ไม่มี)';

    const freshText =
      classified.fresh.length > 0
        ? classified.fresh
            .map((i) => `- ${i.name} (คงเหลือ ${i.quantity || 1} ${i.unit || 'ชิ้น'})`)
            .join('\n')
        : '(ไม่มี)';

    const focusNamesText = weightedFocus.map((i) => i.name).join(', ');
    const forbiddenExpiredText =
      allExpired.length > 0
        ? `\nวัตถุดิบที่หมดอายุแล้ว (ห้ามใช้และห้ามกล่าวถึงในสูตรอาหารเด็ดขาด): ${allExpired
            .map((e) => e.name)
            .join(', ')}`
        : '';

    const avoidRepeatText =
      previousRecipeNames.length > 0
        ? `\nห้ามซ้ำกับเมนูที่เพิ่งแนะนำไปก่อนหน้านี้: ${previousRecipeNames.slice(-8).join(', ')}`
        : '';

    const buildPrompt = (strictRetryNote = '') => `คุณคือเชฟมืออาชีพประจำแอป CheckTuYen ที่ช่วยสุ่มแนะนำเมนูอาหารจากวัตถุดิบที่ยังไม่หมดอายุจริงในตู้เย็น "${fridgeName}"

รายการวัตถุดิบที่ยังไม่หมดอายุและพร้อมใช้จริงในตู้เย็น "${fridgeName}":
[กลุ่มใกล้หมดอายุ — ให้ความสำคัญสูง แต่ไม่จำเป็นต้องบังคับใช้ทุกเมนู]:
${expiringText}

[กลุ่มยังสดใหม่ — สามารถใช้ร่วมกันหรือสุ่มทำเมนูหลากหลายได้]:
${freshText}

วัตถุดิบเด่นที่สุ่มได้สำหรับรอบนี้ (Weighted Random Focus): ${focusNamesText}
ขนาดสำหรับเสิร์ฟ: ${servings}
เงื่อนไขที่ผู้ใช้เลือก: ${prefPrompt}${forbiddenExpiredText}${avoidRepeatText}${strictRetryNote}

กฎเหล็ก (ห้ามละเมิดเด็ดขาด):
1. คิดสูตรอาหารที่ทำได้จริงและเข้ากันได้จริงจำนวน 2-3 เมนูที่มีความหลากหลาย (เช่น เมนูหนึ่งเน้นของใกล้หมดอายุ และอีกเมนูสามารถใช้วัตถุดิบสดใหม่หรือผสมกันได้)
2. ห้ามใช้วัตถุดิบที่หมดอายุแล้วเด็ดขาด!
3. ห้ามอ้างว่ามีวัตถุดิบใดในตู้เย็น หากวัตถุดิบนั้นไม่ได้อยู่ในรายการวัตถุดิบพร้อมใช้ด้านบน
4. ระบุ "inFridge": true เฉพาะวัตถุดิบที่มีอยู่ในรายการด้านบนเท่านั้น และระบุ "inFridge": false สำหรับเครื่องปรุงหรือวัตถุดิบที่ต้องซื้อเพิ่ม
5. ปริมาณวัตถุดิบในสูตรต้องเหมาะสมกับจำนวนคน (${servings}) และไม่เกินจริงจากที่มีอยู่

ตอบกลับเป็น JSON Array ล้วนๆ เท่านั้น ห้ามมีข้อความอื่น ห้ามใส่ markdown codeblock:
[
  {
    "id": "recipe-1",
    "name": "ชื่อเมนูภาษาไทย",
    "nameEn": "English Dish Name",
    "tag": "⭐ แนะนำสำหรับมื้อนี้",
    "time": "15 นาที",
    "difficulty": "ง่าย",
    "calories": "~320 kcal",
    "servings": "${servings}",
    "ingredients": [
      { "name": "ชื่อวัตถุดิบ", "amount": "ปริมาณที่แนะนำ", "inFridge": true }
    ],
    "steps": [
      "ขั้นตอนที่ 1 ...",
      "ขั้นตอนที่ 2 ...",
      "ขั้นตอนที่ 3 ..."
    ]
  }
]`;

    // 3. เรียก Gemini AI + ตรวจสอบผลลัพธ์หลังสร้าง (หากพบของหมดอายุ ให้ปฏิเสธและลองสร้างใหม่อัตโนมัติ 1 ครั้ง)
    let attempt = await callGeminiForRecipes(apiKey, buildPrompt(), 0.72);
    let validation = attempt.candidates
      ? validateGeneratedRecipes(attempt.candidates, classified.usable, allExpired, fridgeName, servings)
      : { validRecipes: [], rejectedCount: 0, rejectedReasons: [] };

    if (validation.validRecipes.length === 0 && validation.rejectedCount > 0) {
      const retryNote = `\nคำเตือนสำคัญมาก: รอบก่อนหน้าถูกปฏิเสธเพราะ (${validation.rejectedReasons.join(
        '; '
      )}) จงสร้างเมนูใหม่โดยใช้เฉพาะวัตถุดิบที่ยังไม่หมดอายุในรายการด้านบนเท่านั้น!`;
      attempt = await callGeminiForRecipes(apiKey, buildPrompt(retryNote), 0.5);
      validation = attempt.candidates
        ? validateGeneratedRecipes(attempt.candidates, classified.usable, allExpired, fridgeName, servings)
        : { validRecipes: [], rejectedCount: 0, rejectedReasons: [] };
    }

    if (validation.validRecipes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            validation.rejectedReasons.length > 0
              ? `ไม่สามารถสร้างเมนูที่ปลอดภัยได้ (${validation.rejectedReasons[0]}) กรุณาลองกดสุ่มใหม่อีกครั้ง`
              : `ไม่สามารถเชื่อมต่อ AI เพื่อคิดสูตรอาหารได้ในขณะนี้ (${attempt.lastError || 'timeout'}) กรุณาลองกดใหม่อีกครั้ง`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      recipes: validation.validRecipes,
      source: attempt.modelUsed,
      excludedExpiredCount: allExpired.length,
      focusIngredients: weightedFocus.map((i) => i.name),
    });
  } catch (error: unknown) {
    console.error('Recipe generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการคิดสูตรอาหาร',
      },
      { status: 500 }
    );
  }
}
