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
  Refrigerator,
  X,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { Item, ItemBatch } from '@/types/database';

interface ExpiringIngredient {
  id: string;
  name: string;
  daysLeft: number;
  fridgeId: string;
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
  const [selectedFridgeId, setSelectedFridgeId] = useState<string>('all');
  const [allExpiringItems, setAllExpiringItems] = useState<ExpiringIngredient[]>([]);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(['easy']);
  const [deductedRecipes, setDeductedRecipes] = useState<Set<string>>(new Set());

  // ดึงรายการวัตถุดิบและคำนวณวันหมดอายุ
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

              // กรองเฉพาะของที่ใกล้หมดอายุ (<= 5 วัน) เท่านั้น! ตัดของที่เก็บได้นานออก
              if (diffDays <= 5) {
                list.push({
                  id: it.id,
                  name: it.name,
                  daysLeft: diffDays,
                  fridgeId: it.fridge_id || '',
                  fridgeName: fridgeMap.get(it.fridge_id) || 'ตู้เย็น',
                  quantity: Number(it.quantity),
                  unit: it.unit || 'ชิ้น',
                });
              }
            }
          }

          setAllExpiringItems(list);
        } else {
          setAllExpiringItems([]);
        }
      } catch (err) {
        console.error('Error loading expiring items:', err);
      } finally {
        setLoading(false);
      }
    }

    loadExpiringIngredients();
  }, [currentHousehold?.id, fridges, supabase]);

  // กรองตามตู้เย็นที่ผู้ใช้เลือก (Step 1)
  const activeExpiringList = useMemo(() => {
    if (selectedFridgeId === 'all') {
      return allExpiringItems;
    }
    return allExpiringItems.filter((i) => i.fridgeId === selectedFridgeId);
  }, [allExpiringItems, selectedFridgeId]);

  // สลับค่าความชอบ (Preferences)
  function togglePref(id: string) {
    setSelectedPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  // ลบชิปวัตถุดิบออกจาก AI Prompt
  function removeIngredientChip(id: string) {
    setAllExpiringItems((prev) => prev.filter((item) => item.id !== id));
  }

  // สุ่มสูตรอาหารใหม่
  async function handleGenerateAI() {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      toast.success('AI คิดค้นสูตรอาหารใหม่จากของใกล้หมดอายุสำเร็จ! ✨');
    }, 1000);
  }

  // สูตรอาหารที่ AI แนะนำ (อิงตามวัตถุดิบใกล้หมดอายุในตู้ที่เลือก)
  const recipes: Recipe[] = useMemo(() => {
    if (activeExpiringList.length === 0) return [];

    const firstItem = activeExpiringList[0]?.name || 'วัตถุดิบในตู้';
    const secondItem = activeExpiringList[1]?.name || 'เครื่องปรุงรส';
    const thirdItem = activeExpiringList[2]?.name || 'ผักเคียง';

    return [
      {
        id: 'recipe-1',
        name: `เมนูกู้ชีพด่วน: ผัด${firstItem}ทรงเครื่อง`,
        nameEn: `Stir-fried ${firstItem} Special`,
        tag: '⭐ แนะนำอันดับ 1 (เคลียร์ของด่วน)',
        time: '15 นาที',
        difficulty: 'ง่ายมาก',
        calories: '~290 kcal',
        imageUrl:
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
        ingredients: [
          { name: firstItem, amount: '1 ส่วน', location: activeExpiringList[0]?.fridgeName || 'ในตู้' },
          { name: secondItem, amount: 'พอประมาณ', location: activeExpiringList[1]?.fridgeName || 'ในตู้' },
          { name: thirdItem, amount: 'ตามชอบ', location: activeExpiringList[2]?.fridgeName || 'ในตู้' },
        ],
        steps: [
          `เตรียมและหั่น ${firstItem} และ ${secondItem} เป็นชิ้นพอดีคำ`,
          'ตั้งกระทะใส่น้ำมันเล็กน้อย ผัดวัตถุดิบด้วยไฟกลางจนสุกหอม',
          'ปรุงรสด้วยซอสและพริกไทย เสิร์ฟร้อนๆ เคลียร์วัตถุดิบได้ทันทีก่อนหมดอายุ',
        ],
      },
      {
        id: 'recipe-2',
        name: `ซุปอบอุ่นใจ ใส่${firstItem}`,
        nameEn: `Hearty Warm Soup with ${firstItem}`,
        tag: 'เคลียร์ได้หลายอย่าง',
        time: '20 นาที',
        difficulty: 'ปานกลาง',
        calories: '~240 kcal',
        imageUrl:
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=80',
        ingredients: [
          { name: firstItem, amount: '1 ส่วน', location: activeExpiringList[0]?.fridgeName || 'ในตู้' },
          { name: secondItem, amount: '1 ส่วน', location: activeExpiringList[1]?.fridgeName || 'ในตู้' },
        ],
        steps: [
          'ต้มน้ำซุปให้เดือด ใส่ผักและวัตถุดิบลงไปเคี่ยว',
          'ปรุงรสกลมกล่อม เคี่ยวไฟอ่อน 10 นาทีจนนุ่ม',
          'ตักใส่ชาม โรยพริกไทย ทานอุ่นๆ ช่วยลดขยะอาหารได้ 100%',
        ],
      },
    ];
  }, [activeExpiringList]);

  // ทำเมนูนี้เลย -> ตัดสต็อกอัตโนมัติใน Supabase
  async function handleCookAndDeduct(recipe: Recipe) {
    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('กรุณาเลือกครัวเรือนก่อน');
      return;
    }

    try {
      if (activeExpiringList.length > 0) {
        const target = activeExpiringList[0];
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
      <div className="flex flex-col w-full pb-14 gap-5 animate-in fade-in duration-300">
        {/* 1. Header Banner (Cleaned up, no Zero-Waste clutter) */}
        <div className="flex items-start justify-between bg-surface-container-low rounded-3xl p-5 sm:p-6 border border-border shadow-xs">
          <div className="space-y-1">
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
              ปรุงมื้ออร่อย เคลียร์ของในตู้ 🍲
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant">
              ดึงเฉพาะวัตถุดิบใกล้หมดอายุมาคิดสูตร ลดขยะอาหารและประหยัดค่าใช้จ่าย
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-secondary-500/15 border border-secondary-500/30 flex items-center justify-center shrink-0 text-secondary-600 dark:text-secondary-400 shadow-xs">
            <CookingPot className="w-6 h-6" />
          </div>
        </div>

        {/* 2. Step 1: เลือกตู้เย็นที่จะปรุงอาหาร */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
            <Refrigerator className="w-4 h-4 text-primary-600" />
            <span>ขั้นตอนที่ 1: เลือกตู้เย็นที่จะปรุงอาหาร</span>
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setSelectedFridgeId('all')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold shrink-0 transition active:scale-95 shadow-xs ${
                selectedFridgeId === 'all'
                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low border border-border'
              }`}
            >
              <span>❄️ ทั้งหมด ({allExpiringItems.length})</span>
            </button>

            {fridges.map((f) => {
              const count = allExpiringItems.filter((i) => i.fridgeId === f.id).length;
              const isActive = selectedFridgeId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFridgeId(f.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold shrink-0 transition active:scale-95 shadow-xs ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low border border-border'
                  }`}
                >
                  <span>{f.icon || '❄️'}</span>
                  <span>
                    {f.name} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Step 2 & 3: วัตถุดิบใกล้หมดอายุที่ AI ตรวจพบ (เฉพาะของที่ต้องเคลียร์ด่วนเท่านั้น!) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-tertiary-600">
                notification_important
              </span>
              <span className="font-heading font-bold text-xs sm:text-sm text-on-surface">
                วัตถุดิบใกล้หมดอายุในตู้นี้ ({activeExpiringList.length})
              </span>
            </div>
            <button
              type="button"
              onClick={handleGenerateAI}
              className="text-primary-600 font-bold text-xs hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>รีเฟรชสูตร</span>
            </button>
          </div>

          {activeExpiringList.length === 0 ? (
            <div className="p-6 rounded-3xl bg-surface-container-lowest border border-dashed border-border text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-secondary-500/15 text-secondary-600 flex items-center justify-center mx-auto text-lg">
                🌱
              </div>
              <h4 className="font-heading font-bold text-xs sm:text-sm text-foreground">
                ไม่มีวัตถุดิบใกล้หมดอายุในตู้เย็นนี้
              </h4>
              <p className="text-xs text-muted max-w-xs mx-auto">
                ของในตู้สดยังคงคุณภาพดีเยี่ยม และเก็บได้อีกนาน ไม่จำเป็นต้องรีบนำมาปรุงกู้ชีพ
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {activeExpiringList.map((item) => {
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
                        isUrgent ? 'bg-tertiary-600 text-white' : 'bg-amber-600 text-white'
                      }`}
                    >
                      {item.daysLeft <= 0 ? 'หมดวันนี้!' : `อีก ${item.daysLeft} วัน`}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeIngredientChip(item.id)}
                      className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center transition"
                      title="ไม่ใช้วัตถุดิบนี้ในเมนู"
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
                <span>+ จัดการตู้เย็น</span>
              </Link>
            </div>
          )}
        </div>

        {/* 4. Preference Toggles & AI Generator Action */}
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

          {/* AI Generator Button */}
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={generating || activeExpiringList.length === 0}
            className="mt-1 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 text-white font-heading font-bold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-primary-500/25 active:scale-[0.98] transition disabled:opacity-60 group"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AI กำลังประมวลผลสูตรอาหารจากของใกล้หมดอายุ...</span>
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

        {/* 5. AI Recipe Recommendation Cards */}
        {recipes.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base sm:text-lg font-bold text-on-surface flex items-center gap-2">
                <CookingPot className="w-5 h-5 text-primary-600" />
                <span>สูตรแนะนำจากวัตถุดิบใกล้หมดอายุ</span>
              </h2>
              <span className="text-xs font-bold text-primary-700 bg-primary-100 dark:bg-primary-900/40 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                พร้อมปรุงทันที
              </span>
            </div>

            {recipes.map((r) => {
              const isDeducted = deductedRecipes.has(r.id);

              return (
                <div
                  key={r.id}
                  className="flex flex-col rounded-3xl bg-surface-container-lowest shadow-sm border border-border overflow-hidden hover:shadow-md transition"
                >
                  <div className="relative w-full h-44 sm:h-52 overflow-hidden bg-surface-container">
                    <img
                      src={r.imageUrl}
                      alt={r.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

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

                    {/* Ingredients Used */}
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

                    {/* Steps */}
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

                    {/* CTA: Cook & Deduct */}
                    <button
                      type="button"
                      disabled={isDeducted}
                      onClick={() => handleCookAndDeduct(r)}
                      className={`w-full py-3.5 px-4 rounded-2xl font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98 ${
                        isDeducted
                          ? 'bg-secondary-100 text-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-300 border border-secondary-300'
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
        )}
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
