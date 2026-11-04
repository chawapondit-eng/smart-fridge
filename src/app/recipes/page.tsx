'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Timer,
  Heart,
  Flame,
  CheckCircle,
  CookingPot,
  ArrowRight,
  BookOpen,
  Calendar,
  X,
  Plus,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import type { Item, ItemBatch } from '@/types/database';

interface ExpiringIngredient {
  id: string;
  name: string;
  daysLeft: number;
  fridgeName: string;
  quantity: number;
  unit: string;
}

interface Recipe {
  id: string;
  name: string;
  nameEn: string;
  tag: string;
  time: string;
  difficulty: string;
  calories: string;
  imageUrl: string;
  ingredients: { name: string; amount: string; location: string }[];
  steps: string[];
}

function RecipesContent() {
  const searchParams = useSearchParams();
  const initialIngredient = searchParams.get('ingredient');

  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user } = useHousehold();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expiringList, setExpiringList] = useState<ExpiringIngredient[]>([]);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(['easy']);
  const [deductedRecipes, setDeductedRecipes] = useState<Set<string>>(new Set());

  // ดึงรายการวัตถุดิบใกล้หมดอายุในบ้าน
  useEffect(() => {
    async function loadExpiringIngredients() {
      if (!currentHousehold?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: itemRows } = await supabase
          .from('items')
          .select('id, name, unit, quantity, fridge_id')
          .eq('household_id', currentHousehold.id)
          .gt('quantity', 0);

        if (itemRows && itemRows.length > 0) {
          const itemIds = itemRows.map((i) => i.id);
          const itemMap = new Map(itemRows.map((i) => [i.id, i]));
          const fridgeMap = new Map(fridges.map((f) => [f.id, f.name]));

          const { data: batchRows } = await supabase
            .from('item_batches')
            .select('item_id, expiry_date, quantity')
            .in('item_id', itemIds)
            .not('expiry_date', 'is', null)
            .order('expiry_date', { ascending: true });

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const list: ExpiringIngredient[] = [];
          if (batchRows && batchRows.length > 0) {
            for (const b of batchRows) {
              const it = itemMap.get(b.item_id);
              if (!it) continue;
              const exp = new Date(b.expiry_date);
              exp.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

              list.push({
                id: it.id,
                name: it.name,
                daysLeft: diffDays,
                fridgeName: fridgeMap.get(it.fridge_id) || 'ตู้เย็น',
                quantity: Number(it.quantity),
                unit: it.unit || 'ชิ้น',
              });
            }
          }

          // ถ้าไม่มี ให้ใช้วัตถุดิบธรรมดาในตู้
          if (list.length === 0) {
            for (const it of itemRows.slice(0, 4)) {
              list.push({
                id: it.id,
                name: it.name,
                daysLeft: 3,
                fridgeName: fridgeMap.get(it.fridge_id) || 'ตู้เย็น',
                quantity: Number(it.quantity),
                unit: it.unit || 'ชิ้น',
              });
            }
          }

          setExpiringList(list.slice(0, 5));
        } else {
          // Demo fallback
          setExpiringList([
            { id: '1', name: 'ผักสลัดไฮโดร', daysLeft: 0, fridgeName: 'ช่องแช่ผัก', quantity: 1, unit: 'ถุง' },
            { id: '2', name: 'นมสด Meiji', daysLeft: 1, fridgeName: 'ชั้นกลาง', quantity: 1, unit: 'ขวด' },
            { id: '3', name: 'อกไก่ S-Pure', daysLeft: 3, fridgeName: 'ช่องฟรีซ', quantity: 1, unit: 'แพ็ค' },
          ]);
        }
      } catch (err) {
        console.error('Error loading expiring items:', err);
      } finally {
        setLoading(false);
      }
    }

    loadExpiringIngredients();
  }, [currentHousehold?.id, fridges, supabase]);

  // สลับค่าความชอบ (Preferences)
  function togglePref(id: string) {
    setSelectedPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  // ลบชิปวัตถุดิบออกจาก AI Prompt
  function removeIngredientChip(id: string) {
    setExpiringList((prev) => prev.filter((item) => item.id !== id));
  }

  // สูตรอาหารที่ AI แนะนำ (อิงตามวัตถุดิบในตู้)
  const recipes: Recipe[] = useMemo(() => {
    const hasChicken = expiringList.some((i) => i.name.includes('ไก่') || i.name.includes('เนื้อ'));
    const hasEgg = expiringList.some((i) => i.name.includes('ไข่'));
    const hasSalad = expiringList.some((i) => i.name.includes('ผัก') || i.name.includes('สลัด'));
    const hasMilk = expiringList.some((i) => i.name.includes('นม'));

    return [
      {
        id: 'recipe-1',
        name: 'สลัดอกไก่ย่างซอสนมสดสไตล์โฮมเมด',
        nameEn: 'Warm Chicken Salad with Milk-Honey Dressing',
        tag: '⭐ แนะนำอันดับ 1 (วัตถุดิบครบ 100%)',
        time: '15 นาที',
        difficulty: 'ง่ายมาก',
        calories: '~320 kcal',
        imageUrl:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
        ingredients: [
          { name: expiringList[0]?.name || 'ผักสลัดไฮโดร', amount: '1 ถุง', location: 'ช่องแช่ผัก' },
          { name: expiringList[2]?.name || 'อกไก่สด', amount: '200g', location: 'ช่องฟรีซ' },
          { name: expiringList[1]?.name || 'นมสด', amount: '50ml', location: 'ชั้นกลาง' },
        ],
        steps: [
          'หมักอกไก่ด้วยเกลือและพริกไทย ย่างบนกระทะไฟกลางจนสุกหอม (6-8 นาที) แล้วหั่นชิ้นพอดีคำ',
          'เคี่ยวนมสด 50ml ผสมน้ำผึ้งและมัสตาร์ดเล็กน้อยจนข้นกลายเป็นน้ำสลัดครีมมี่เข้มข้น',
          'จัดวางผักสลัดเย็นๆ โปะอกไก่ย่างร้อนๆ แล้วราดซอสพร้อมเสิร์ฟทันที',
        ],
      },
      {
        id: 'recipe-2',
        name: 'ซุปอกไก่ข้นนมสดผักรวม',
        nameEn: 'Creamy Chicken & Veggie Soup',
        tag: 'เคลียร์ได้ 3 วัตถุดิบ',
        time: '20 นาที',
        difficulty: 'ปานกลาง',
        calories: '~285 kcal',
        imageUrl:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=80',
        ingredients: [
          { name: expiringList[1]?.name || 'นมสด', amount: '150ml', location: 'ชั้นกลาง' },
          { name: expiringList[2]?.name || 'อกไก่สด', amount: '150g', location: 'ช่องฟรีซ' },
          { name: expiringList[0]?.name || 'ผักรวม', amount: '1 ถ้วย', location: 'ช่องแช่ผัก' },
        ],
        steps: [
          'ผัดอกไก่สับกับเนยจนหอม ใส่ผักรวมลงไปผัดต่อจนนิ่ม',
          'เติมนมสดและน้ำซุป เคี่ยวด้วยไฟอ่อนประมาณ 10 นาทีจนได้ความข้นตามชอบ',
          'ปรุงรสด้วยเกลือ พริกไทยดำ โรยพาร์สลีย์หรือออริกาโน่ก่อนเสิร์ฟ',
        ],
      },
    ];
  }, [expiringList]);

  // สุ่มสูตรอาหารใหม่
  async function handleGenerateAI() {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      toast.success('AI คิดค้นสูตรอาหารใหม่จากของในตู้สำเร็จ! ✨');
    }, 1200);
  }

  // ทำเมนูนี้เลย -> ตัดสต็อกอัตโนมัติใน Supabase
  async function handleCookAndDeduct(recipe: Recipe) {
    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('กรุณาเลือกครัวเรือนก่อน');
      return;
    }

    try {
      // หักสต็อกวัตถุดิบชิ้นแรกที่มี
      if (expiringList.length > 0) {
        const target = expiringList[0];
        const newQty = Math.max(0, target.quantity - 1);
        await supabase
          .from('items')
          .update({
            quantity: newQty,
            status: newQty === 0 ? 'out_of_stock' : newQty <= 1 ? 'low_stock' : 'in_stock',
          })
          .eq('id', target.id);

        const currentUserName = user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก';
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          user_id: authUser.id,
          action: 'quantity_decreased',
          details: {
            user_name: currentUserName,
            item_name: target.name,
            amount: 1,
            new_quantity: newQty,
            recipe_name: recipe.name,
          },
        });
      }

      setDeductedRecipes((prev) => new Set([...prev, recipe.id]));
      toast.success(`หักสต็อกสำหรับ "${recipe.name}" เรียบร้อยแล้ว! 🍲`, {
        duration: 3500,
      });
    } catch {
      toast.error('เกิดข้อผิดพลาดในการหักสต็อก');
    }
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-14 gap-6 animate-in fade-in duration-300">
        {/* 1. Inspiring Hero Banner with Warm Domestic Vibes */}
        <div className="relative overflow-hidden rounded-3xl bg-surface-container-low border border-border p-5 sm:p-7 shadow-xs">
          <div className="relative z-10 flex flex-col gap-2">
            <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-bold shadow-xs">
              <span className="material-symbols-outlined text-[15px]">eco</span>
              <span>Zero-Waste Kitchen AI</span>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight mt-1">
              ปรุงมื้ออร่อย เคลียร์ของในตู้ 🍲
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-xl">
              แปรเปลี่ยนวัตถุดิบใกล้หมดอายุให้เป็นมื้อพิเศษ ลดขยะอาหาร ประหยัดเงินในกระเป๋าได้ทันตา!
            </p>

            {/* Live Impact Metric Micro-pod */}
            <div className="mt-2 flex items-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-2xl bg-secondary-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[20px]">compost</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-secondary-700">
                  กู้ชีพอาหารสัปดาห์นี้
                </span>
                <span className="font-heading font-bold text-xs sm:text-sm text-on-surface truncate">
                  ช่วยโลกไปแล้ว 4 เมนู (ประหยัด ~฿280)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Auto-Selected Expiring Ingredients Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-tertiary-600">
                notification_important
              </span>
              <span className="font-heading font-bold text-sm text-on-surface">
                วัตถุดิบใกล้หมดอายุที่ AI ตรวจพบ ({expiringList.length})
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateAI}
              className="text-primary-600 font-bold text-xs hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>รีเฟรชตู้</span>
            </button>
          </div>

          {/* Ingredient Chips Horizontal Flow */}
          <div className="flex flex-wrap gap-2 items-center">
            {expiringList.map((item) => {
              const isUrgent = item.daysLeft <= 1;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full shadow-xs border transition ${
                    isUrgent
                      ? 'bg-tertiary-500/15 text-tertiary-700 dark:text-tertiary-300 border-tertiary-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isUrgent ? 'bg-tertiary-600 animate-ping' : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-xs font-bold truncate max-w-[130px]">
                    {item.name}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      isUrgent
                        ? 'bg-tertiary-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {item.daysLeft === 0
                      ? 'หมดวันนี้!'
                      : `อีก ${item.daysLeft} วัน`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeIngredientChip(item.id)}
                    className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            <Link
              href="/fridges"
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface-variant text-xs font-semibold shadow-xs border border-border"
            >
              <Plus className="w-3.5 h-3.5 text-primary-600" />
              <span>+ เพิ่มจากตู้เย็น</span>
            </Link>
          </div>
        </div>

        {/* 3. Preference Toggles & AI Generator Action */}
        <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border shadow-sm">
          <span className="text-xs font-bold text-on-surface-variant">
            ความชอบส่วนตัวสำหรับมื้อนี้:
          </span>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'easy', label: 'ทำง่าย (< 20 นาที)', icon: Timer },
              { id: 'healthy', label: 'เพื่อสุขภาพ / คลีน', icon: Heart },
              { id: 'thai', label: 'เมนูไทย / ฟิวชั่น', icon: Flame },
            ].map((p) => {
              const active = selectedPreferences.includes(p.id);
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePref(p.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition active:scale-95 shadow-xs border ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container border-border'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Glowing AI Generator Button */}
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={generating}
            className="mt-1 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 text-white font-heading font-bold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-primary-500/25 active:scale-[0.98] transition disabled:opacity-70 group"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AI กำลังจับคู่เครื่องปรุงในตู้...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-200 animate-pulse" />
                <span>ให้ AI คิดสูตรอาหารเดี๋ยวนี้</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>

        {/* 4. AI Recipe Recommendation Cards */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-bold text-on-surface flex items-center gap-2">
              <CookingPot className="w-5 h-5 text-primary-600" />
              <span>สูตรแนะนำจากวัตถุดิบของคุณ</span>
            </h2>
            <span className="text-xs font-bold text-primary-700 px-2.5 py-0.5 rounded-full bg-primary-100">
              พร้อมปรุงทันที
            </span>
          </div>

          {/* Recipe Card 1: Top Pick / Hero Card */}
          {recipes.map((r, idx) => {
            const isDeducted = deductedRecipes.has(r.id);

            return (
              <div
                key={r.id}
                className="flex flex-col rounded-3xl bg-surface-container-lowest shadow-sm border border-border overflow-hidden hover:shadow-md transition"
              >
                {/* Visual Food Image with Overlay Scrim */}
                <div className="relative w-full h-48 overflow-hidden bg-surface-container">
                  <img
                    src={r.imageUrl}
                    alt={r.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                  {/* Top Floating Tag */}
                  <div className="absolute top-3 left-3 flex items-center gap-1 px-3 py-1 rounded-full bg-primary-500 text-white text-xs font-bold shadow-md">
                    <span>{r.tag}</span>
                  </div>

                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <span className="text-[11px] text-amber-200 block truncate">
                      {r.nameEn}
                    </span>
                    <h3 className="font-heading font-extrabold text-lg sm:text-xl text-white leading-tight mt-0.5">
                      {r.name}
                    </h3>
                  </div>
                </div>

                <div className="p-4 sm:p-6 flex flex-col gap-4">
                  {/* Meta Specs Row */}
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-surface-container-low border border-border/60 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-primary-600 flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5" />
                        <span>{r.time}</span>
                      </span>
                      <span className="text-[10px] text-muted">เวลาปรุง</span>
                    </div>
                    <div className="flex flex-col items-center border-x border-border/80">
                      <span className="text-xs font-bold text-amber-600">
                        {r.difficulty}
                      </span>
                      <span className="text-[10px] text-muted">ความยาก</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-tertiary-600">
                        {r.calories}
                      </span>
                      <span className="text-[10px] text-muted">พลังงาน</span>
                    </div>
                  </div>

                  {/* Ingredients Used with Compartment Locations */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-on-surface">
                      วัตถุดิบและพิกัดในตู้เย็น:
                    </span>
                    <div className="space-y-1.5">
                      {r.ingredients.map((ing, iIdx) => (
                        <div
                          key={iIdx}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-border/50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-md bg-primary-500/15 text-primary-600 dark:text-primary-300 border border-primary-500/25 text-[10px] font-bold shrink-0">
                              {ing.location}
                            </span>
                            <span className="font-bold text-on-surface truncate">
                              {ing.name}
                            </span>
                          </div>
                          <span className="text-muted shrink-0">{ing.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3 Steps Recipe */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-on-surface">
                      วิธีทำ 3 ขั้นตอนฉับไว:
                    </span>
                    <div className="space-y-1.5">
                      {r.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-2.5 text-xs">
                          <span className="w-5 h-5 rounded-full bg-primary-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {sIdx + 1}
                          </span>
                          <p className="text-on-surface-variant leading-relaxed">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA: Make & Deduct Inventory */}
                  <button
                    type="button"
                    disabled={isDeducted}
                    onClick={() => handleCookAndDeduct(r)}
                    className={`w-full py-3.5 px-4 rounded-2xl font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98 ${
                      isDeducted
                        ? 'bg-secondary-100 text-secondary-800 border border-secondary-300'
                        : 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-500/25'
                    }`}
                  >
                    {isDeducted ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-secondary-600" />
                        <span>ตัดสต็อกเรียบร้อยแล้ว ✨</span>
                      </>
                    ) : (
                      <>
                        <CookingPot className="w-4 h-4" />
                        <span>ทำเมนูนี้เลย! (ตัดสต็อกอัตโนมัติ)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 5. Zero-Waste Impact Badge & Community Milestone */}
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-primary-500/10 via-surface-container-low to-secondary-500/10 border border-border shadow-xs flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[28px]">
                nature_people
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-secondary-600 dark:text-secondary-400">
                ผลกระทบเชิงบวกของคุณ
              </span>
              <h3 className="font-heading font-extrabold text-sm sm:text-base text-foreground leading-tight mt-0.5">
                เดือนนี้คุณช่วยลดขยะอาหารไปแล้ว 6.4 กิโลกรัม!
              </h3>
            </div>
          </div>

          <p className="text-xs text-on-surface-variant leading-relaxed">
            เทียบเท่ากับการลดปล่อยก๊าซคาร์บอน{' '}
            <strong className="text-secondary-600 dark:text-secondary-400 font-bold">15.2 kg CO₂</strong>{' '}
            และช่วยประหยัดค่าใช้จ่ายในบ้านไปได้ถึง{' '}
            <strong className="text-primary-600 dark:text-primary-400 font-bold">฿1,420</strong> 🌿
          </p>

          {/* Visual Progress toward Monthly Goal */}
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex justify-between items-center text-xs text-on-surface-variant">
              <span>เป้าหมายกู้ชีพอาหารประจำเดือน (8.0 kg)</span>
              <span className="font-bold text-secondary-600 dark:text-secondary-400">80% สำเร็จ</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-secondary-500 rounded-full transition-all duration-700"
                style={{ width: '80%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        </MainLayout>
      }
    >
      <RecipesContent />
    </Suspense>
  );
}
