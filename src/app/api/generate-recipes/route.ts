import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface IngredientInput {
  name: string;
  quantity?: number;
  unit?: string;
  fridgeName?: string;
}

const CATEGORY_IMAGES: Record<string, string> = {
  'stir-fry': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=700&q=80',
  soup: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=700&q=80',
  curry: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=700&q=80',
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&q=80',
  rice: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=700&q=80',
  noodles: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=700&q=80',
  egg: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=700&q=80',
  default: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&q=80',
};

function getCategoryPhoto(category?: string, name?: string): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('stir') || cat.includes('ผัด')) return CATEGORY_IMAGES['stir-fry'];
  if (cat.includes('soup') || cat.includes('ต้ม') || cat.includes('แกงจืด')) return CATEGORY_IMAGES.soup;
  if (cat.includes('curry') || cat.includes('แกง')) return CATEGORY_IMAGES.curry;
  if (cat.includes('salad') || cat.includes('สลัด') || cat.includes('ยำ')) return CATEGORY_IMAGES.salad;
  if (cat.includes('rice') || cat.includes('ข้าว')) return CATEGORY_IMAGES.rice;
  if (cat.includes('noodle') || cat.includes('เส้น')) return CATEGORY_IMAGES.noodles;
  if (cat.includes('egg') || cat.includes('ไข่')) return CATEGORY_IMAGES.egg;

  // Fallback to name match
  const n = (name || '').toLowerCase();
  if (n.includes('ผัด') || n.includes('ทอด')) return CATEGORY_IMAGES['stir-fry'];
  if (n.includes('ต้ม') || n.includes('ซุป') || n.includes('แกงจืด')) return CATEGORY_IMAGES.soup;
  if (n.includes('แกง') || n.includes('พะแนง')) return CATEGORY_IMAGES.curry;
  if (n.includes('สลัด') || n.includes('ยำ')) return CATEGORY_IMAGES.salad;
  if (n.includes('ข้าว')) return CATEGORY_IMAGES.rice;
  if (n.includes('ก๋วยเตี๋ยว') || n.includes('เส้น') || n.includes('ผัดไทย')) return CATEGORY_IMAGES.noodles;
  if (n.includes('ไข่')) return CATEGORY_IMAGES.egg;

  return CATEGORY_IMAGES.default;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ingredients: (string | IngredientInput)[] = body.ingredients || [];
    const preferences: string[] = body.preferences || ['easy'];

    const ingredientNames = ingredients
      .map((i) => (typeof i === 'string' ? i.trim() : i.name?.trim()))
      .filter(Boolean);

    if (ingredientNames.length === 0) {
      return NextResponse.json(
        { error: 'กรุณาระบุวัตถุดิบเพื่อคิดค้นสูตรอาหาร' },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    const prefTexts: string[] = [];
    if (preferences.includes('easy')) prefTexts.push('ทำง่าย ไม่ซับซ้อน ใช้เวลาไม่เกิน 20 นาที');
    if (preferences.includes('healthy')) prefTexts.push('เน้นเพื่อสุขภาพ ใช้น้ำมันน้อย แคลอรี่ต่ำ');
    if (preferences.includes('thai')) prefTexts.push('รสชาติไทยจัดจ้าน หรือเมนูฟิวชั่นไทยยอดนิยม');
    const prefPrompt = prefTexts.length > 0 ? prefTexts.join(', ') : 'ทำง่าย รสชาติกลมกล่อม';

    const systemPrompt = `คุณคือยอดเชฟมืออาชีพและผู้ช่วยคิดเมนูอาหารประจำบ้าน CheckTuYen
ภารกิจ: คิดค้นสูตรอาหารไทยหรือฟิวชั่นที่ทำได้จริงและน่ารับประทานจำนวน 2-3 เมนู
โดย "ต้องใช้วัตถุดิบใกล้หมดอายุเหล่านี้เป็นหัวใจหลักของจาน": ${ingredientNames.join(', ')}
เงื่อนไขความต้องการ: ${prefPrompt}

ให้ตอบกลับเป็น JSON Array เท่านั้น ไม่มีข้อความเกริ่นหรือคำลงท้าย ห้ามใส่เครื่องหมายอื่นนอกจาก JSON
รูปแบบ JSON:
[
  {
    "id": "recipe-1",
    "name": "ชื่อเมนูภาษาไทย เช่น ผัดกะเพราหมูสับไข่ดาวกรอบ",
    "nameEn": "Stir-fried Basil Pork with Crispy Fried Egg",
    "tag": "⭐ แนะนำเคลียร์ของด่วน",
    "time": "15 นาที",
    "difficulty": "ง่ายมาก",
    "calories": "~350 kcal",
    "category": "stir-fry",
    "ingredients": [
      { "name": "${ingredientNames[0] || 'วัตถุดิบหลัก'}", "amount": "1 ส่วน", "location": "ในตู้เย็น" },
      { "name": "เครื่องปรุงรส (ซีอิ๊วขาว น้ำมันหอย)", "amount": "ตามชอบ", "location": "เครื่องปรุงในครัว" }
    ],
    "steps": [
      "ตั้งกระทะใส่น้ำมัน...",
      "ใส่วัตถุดิบลงไปผัดจนสุกหอม...",
      "ปรุงรสตามชอบ เสิร์ฟร้อนๆ"
    ]
  }
]`;

    let recipesData: any[] = [];

    if (apiKey) {
      const modelsToTry = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
      ];

      for (const model of modelsToTry) {
        try {
          const res = await fetch(
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
                    parts: [{ text: systemPrompt }],
                  },
                ],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                },
              }),
            }
          );

          if (!res.ok) {
            continue;
          }

          const raw = await res.json();
          const text = raw.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

          if (text) {
            let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const startIdx = clean.indexOf('[');
            const endIdx = clean.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
              clean = clean.substring(startIdx, endIdx + 1);
            }

            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed) && parsed.length > 0) {
              recipesData = parsed.map((item, idx) => ({
                id: item.id || `recipe-${idx + 1}`,
                name: String(item.name || 'เมนูชวนอร่อย').trim(),
                nameEn: String(item.nameEn || item.name || '').trim(),
                tag: String(item.tag || (idx === 0 ? '⭐ แนะนำเคลียร์ของด่วน' : 'ทำง่าย รสเด็ด')).trim(),
                time: String(item.time || '15-20 นาที').trim(),
                difficulty: String(item.difficulty || 'ง่าย').trim(),
                calories: String(item.calories || '~300 kcal').trim(),
                imageUrl: getCategoryPhoto(item.category, item.name),
                ingredients: Array.isArray(item.ingredients)
                  ? item.ingredients.map((ing: any) => ({
                      name: String(ing.name || '').trim(),
                      amount: String(ing.amount || 'ตามชอบ').trim(),
                      location: String(ing.location || 'ในตู้เย็น').trim(),
                    }))
                  : [
                      {
                        name: ingredientNames[0] || 'วัตถุดิบ',
                        amount: '1 ส่วน',
                        location: 'ในตู้เย็น',
                      },
                    ],
                steps: Array.isArray(item.steps)
                  ? item.steps.map((st: any) => String(st).trim()).filter(Boolean)
                  : ['ปรุงสุกด้วยความร้อนตามชอบ เสิร์ฟพร้อมทาน'],
              }));
              break;
            }
          }
        } catch (e) {
          console.error(`Gemini model ${model} failed for recipes:`, e);
        }
      }
    }

    // Fallback if AI didn't return valid recipes
    if (recipesData.length === 0) {
      const primary = ingredientNames[0] || 'ของสด';
      const secondary = ingredientNames[1] || 'ผักในตู้';
      recipesData = [
        {
          id: 'recipe-1',
          name: `ผัด${primary}กระเทียมพริกไทยหอมกรุ่น`,
          nameEn: `Stir-fried ${primary} with Garlic & Pepper`,
          tag: '⭐ แนะนำเคลียร์ของด่วน',
          time: '15 นาที',
          difficulty: 'ง่ายมาก',
          calories: '~280 kcal',
          imageUrl: getCategoryPhoto('stir-fry', primary),
          ingredients: [
            { name: primary, amount: '1-2 ส่วน', location: 'ตู้เย็นหลัก' },
            { name: secondary, amount: 'ตามชอบ', location: 'ตู้เย็น' },
            { name: 'กระเทียมสับและพริกไทยป่น', amount: '1 ช้อนโต๊ะ', location: 'เครื่องปรุง' },
          ],
          steps: [
            `หั่น ${primary} เป็นชิ้นพอดีคำ ล้างทำความสะอาด`,
            'เจียวกระเทียมสับในน้ำมันไฟกลางจนเหลืองหอมกรุ่น',
            `ใส่ ${primary} ลงไปผัด ปรุงรสด้วยซีอิ๊วขาวและซอสหอยนางรม`,
            'โรยพริกไทยป่น คลุกเคล้าให้เข้ากัน เสิร์ฟร้อนๆ ทันที',
          ],
        },
        {
          id: 'recipe-2',
          name: `แกงจืด${primary}เต้าหู้ไข่ซดคล่องคอ`,
          nameEn: `Clear Soup with ${primary} & Tofu`,
          tag: 'ซดร้อนๆ สบายท้อง',
          time: '20 นาที',
          difficulty: 'ง่าย',
          calories: '~190 kcal',
          imageUrl: getCategoryPhoto('soup', primary),
          ingredients: [
            { name: primary, amount: '1 ส่วน', location: 'ตู้เย็นหลัก' },
            { name: 'เต้าหู้ไข่หรือผักกาดขาว', amount: '1 หลอด', location: 'ตู้เย็น' },
            { name: 'ซุปก้อนหรือน้ำซุปกระดูก', amount: '1 ถ้วย', location: 'เครื่องปรุง' },
          ],
          steps: [
            'ต้มน้ำให้เดือด ใส่ซุปก้อนคนให้ละลาย',
            `ใส่ ${primary} และผักลงไปเคี่ยวด้วยไฟกลาง 5-7 นาที`,
            'ปรุงรสด้วยซีอิ๊วขาวเบาๆ ปิดท้ายด้วยเต้าหู้ไข่ ยกลงเสิร์ฟร้อนๆ',
          ],
        },
      ];
    }

    return NextResponse.json({
      success: true,
      recipes: recipesData,
      source: apiKey ? 'gemini-3.5' : 'curated',
    });
  } catch (error: any) {
    console.error('Recipe generation error:', error);
    return NextResponse.json(
      { error: error.message || 'เกิดข้อผิดพลาดในการคิดสูตรอาหาร' },
      { status: 500 }
    );
  }
}

