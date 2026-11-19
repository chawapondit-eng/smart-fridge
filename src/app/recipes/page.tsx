'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
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
  Refrigerator,
  Plus,
  Shuffle,
  Wallet,
  Globe,
  AlarmClock,
  ShoppingBag,
  Check,
  Users,
  ShieldAlert,
  Leaf,
} from 'lucide-react';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import {
  getDaysUntilExpiry,
  normalizeDateString,
  formatExpiryShortBadge,
} from '@/lib/date';
import {
  classifyIngredients,
  ingredientNamesMatch,
  type RawIngredientItem,
  type VerifiedRecipe,
} from '@/lib/recipeEngine';

interface FridgeIngredient extends RawIngredientItem {
  id: string;
  name: string;
  daysLeft: number | null;
  expiryDate: string | null;
  fridgeId: string;
  fridgeName: string;
  quantity: number;
  unit: string;
}

function RecipesContent() {
  const searchParams = useSearchParams();
  const initialIngredient = searchParams.get('ingredient');
  const initialFridgeParam = searchParams.get('fridgeId');

  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user } = useHousehold();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedFridgeId, setSelectedFridgeId] = useState<string>(initialFridgeParam || '');
  const [fridgeItems, setFridgeItems] = useState<FridgeIngredient[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // ตัวเลือกการปรุง (PART 4.4)
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(['easy']);
  const [cookingTime, setCookingTime] = useState<'any' | '15' | '30'>('any');
  const [servings, setServings] = useState<string>('2 คน');

  const [previousRecipeNames, setPreviousRecipeNames] = useState<string[]>([]);
  const [deductedRecipes, setDeductedRecipes] = useState<Set<string>>(new Set());
  const [recipes, setRecipes] = useState<VerifiedRecipe[]>([]);

  // เลือกตู้เย็นเริ่มต้นเมื่อโหลดรายการตู้เย็นเสร็จ (บังคับเลือกเฉพาะตู้ ไม่ปะปนกัน)
  useEffect(() => {
    if (fridges.length === 0) {
      setSelectedFridgeId('');
      setLoading(false);
      return;
    }
    if (initialFridgeParam && fridges.some((f) => f.id === initialFridgeParam)) {
      setSelectedFridgeId(initialFridgeParam);
    } else if (!selectedFridgeId || !fridges.some((f) => f.id === selectedFridgeId)) {
      setSelectedFridgeId(fridges[0].id);
    }
  }, [fridges, initialFridgeParam, selectedFridgeId]);

  const selectedFridge = useMemo(
    () => fridges.find((f) => f.id === selectedFridgeId) || null,
    [fridges, selectedFridgeId]
  );

  // ดึงวัตถุดิบทั้งหมดเฉพาะจากตู้เย็นที่เลือกเท่านั้น และคำนวณวันหมดอายุแบบ Asia/Bangkok Calendar Date
  const loadFridgeIngredients = useCallback(async () => {
    if (!currentHousehold?.id || !selectedFridgeId) {
      setFridgeItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('id, name, unit, quantity, fridge_id')
        .eq('household_id', currentHousehold.id)
        .eq('fridge_id', selectedFridgeId)
        .gt('quantity', 0);

      if (itemError) throw itemError;

      if (!itemRows || itemRows.length === 0) {
        setFridgeItems([]);
        return;
      }

      const itemIds = itemRows.map((i) => i.id);
      const { data: batchRows } = await supabase
        .from('item_batches')
        .select('item_id, expiry_date, quantity')
        .in('item_id', itemIds)
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true });

      const earliestBatchMap = new Map<string, string>();
      if (batchRows) {
        for (const b of batchRows) {
          const cleanDate = normalizeDateString(b.expiry_date);
          if (Number(b.quantity) > 0 && cleanDate && !earliestBatchMap.has(b.item_id)) {
            earliestBatchMap.set(b.item_id, cleanDate);
          }
        }
      }

      const fridgeName = selectedFridge?.name || 'ตู้เย็น';

      const combined: FridgeIngredient[] = itemRows.map((it) => {
        const expStr = earliestBatchMap.get(it.id) || null;
        const daysLeft = getDaysUntilExpiry(expStr);

        return {
          id: it.id,
          name: it.name,
          daysLeft,
          expiryDate: expStr,
          fridgeId: it.fridge_id,
          fridgeName,
          quantity: Number(it.quantity),
          unit: it.unit || 'ชิ้น',
        };
      });

      setFridgeItems(combined);
      setExcludedIds(new Set());
    } catch (err) {
      console.error('Error loading fridge items:', err);
      toast.error('ไม่สามารถโหลดวัตถุดิบจากตู้เย็นนี้ได้');
    } finally {
      setLoading(false);
    }
  }, [currentHousehold?.id, selectedFridgeId, selectedFridge?.name, supabase]);

  useEffect(() => {
    setRecipes([]);
    setPreviousRecipeNames([]);
    setDeductedRecipes(new Set());
    loadFridgeIngredients();
  }, [loadFridgeIngredients]);

  // จำแนกวัตถุดิบเป็น 3 กลุ่มตาม PART 5.1: หมดอายุแล้ว (ตัดออก) / ใกล้หมดอายุ / ยังสดใหม่
  const classified = useMemo(() => classifyIngredients(fridgeItems), [fridgeItems]);

  const expiredItems = classified.expired as FridgeIngredient[];
  const expiringSoonItems = classified.expiringSoon as FridgeIngredient[];
  const freshItems = classified.fresh as FridgeIngredient[];

  const activeExpiringItems = useMemo(
    () => expiringSoonItems.filter((i) => !excludedIds.has(i.id)),
    [expiringSoonItems, excludedIds]
  );

  const activeFreshItems = useMemo(
    () => freshItems.filter((i) => !excludedIds.has(i.id)),
    [freshItems, excludedIds]
  );

  const totalUsableSelected = activeExpiringItems.length + activeFreshItems.length;

  function togglePref(id: string) {
    setSelectedPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleIngredientInclude(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // เรียก AI สุ่มเมนูแบบ Weighted Random (ไม่ส่งของหมดอายุเข้าสูตรเด็ดขาด)
  async function handleGenerateAI() {
    if (!selectedFridgeId || !selectedFridge) {
      toast.error('กรุณาเลือกตู้เย็นก่อนให้ AI สุ่มเมนูอาหาร');
      return;
    }

    if (totalUsableSelected === 0) {
      toast.error(
        expiredItems.length > 0
          ? 'ไม่มีวัตถุดิบที่ยังไม่หมดอายุเหลืออยู่ให้ AI แนะนำเมนู'
          : 'กรุณาเลือกวัตถุดิบอย่างน้อย 1 อย่างในตู้เย็นนี้'
      );
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/generate-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fridgeName: selectedFridge.name,
          allItems: [...activeExpiringItems, ...activeFreshItems].map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            expiryDate: i.expiryDate,
            daysLeft: i.daysLeft,
            fridgeId: i.fridgeId,
            fridgeName: i.fridgeName,
          })),
          expiredIngredients: expiredItems.map((e) => ({
            name: e.name,
            expiryDate: e.expiryDate,
            daysLeft: e.daysLeft,
          })),
          preferences: selectedPreferences,
          cookingTime,
          servings,
          previousRecipeNames,
        }),
      });

      const data = await res.json();
      if (res.ok && data.recipes && Array.isArray(data.recipes) && data.recipes.length > 0) {
        const nextRecipes = data.recipes as VerifiedRecipe[];
        setRecipes(nextRecipes);
        setPreviousRecipeNames((prev) => [
          ...prev.slice(-6),
          ...nextRecipes.map((r) => r.name),
        ]);
        setDeductedRecipes(new Set());
        toast.success(`AI สุ่มเมนูจากตู้ "${selectedFridge.name}" สำเร็จ! ✨`);
      } else {
        toast.error(data.error || 'ไม่สามารถสร้างสูตรอาหารได้ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err) {
      console.error('Error generating recipes:', err);
      toast.error('ไม่สามารถติดต่อ AI เพื่อคิดสูตรอาหารได้');
    } finally {
      setGenerating(false);
    }
  }

  // ตัดสต็อกจริงเฉพาะวัตถุดิบที่ยังไม่หมดอายุในตู้เย็นที่เลือกซึ่งถูกใช้ในเมนูนี้
  async function handleCookAndDeduct(recipe: VerifiedRecipe) {
    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('กรุณาเลือกครัวเรือนก่อน');
      return;
    }

    try {
      const usablePool = [...expiringSoonItems, ...freshItems];
      const usedRealItems = usablePool.filter((fi) =>
        recipe.ingredients.some(
          (ing) => ing.inFridge && ingredientNamesMatch(ing.name, fi.name)
        )
      );

      if (usedRealItems.length === 0) {
        toast.error('ไม่พบวัตถุดิบที่พร้อมใช้ในตู้เย็นนี้เพื่อตัดสต็อก');
        return;
      }

      const currentUserName =
        user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก';

      for (const target of usedRealItems) {
        const newQty = Math.max(0, target.quantity - 1);
        await supabase
          .from('items')
          .update({
            quantity: newQty,
            status: newQty === 0 ? 'out_of_stock' : newQty <= 1 ? 'low_stock' : 'in_stock',
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.id);

        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          fridge_id: target.fridgeId,
          item_id: target.id,
          user_id: authUser.id,
          action: 'quantity_decreased',
          details: {
            user_name: currentUserName,
            item_name: target.name,
            amount: 1,
            new_quantity: newQty,
            unit: target.unit,
            recipe_name: recipe.name,
          },
        });
      }

      setDeductedRecipes((prev) => new Set([...prev, recipe.id]));
      toast.success(
        `ตัดสต็อก ${usedRealItems.length} รายการสำหรับ "${recipe.name}" เรียบร้อยแล้ว! 🍲`,
        { duration: 3500 }
      );
      loadFridgeIngredients();
    } catch {
      toast.error('เกิดข้อผิดพลาดในการหักสต็อก');
    }
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-14 gap-5 animate-in fade-in duration-300">
        {/* 1. Compact Header */}
        <div className="flex items-start justify-between bg-surface-container-low rounded-3xl p-4 sm:p-5 border border-border shadow-xs">
          <div className="space-y-1">
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
              ผู้ช่วยสุ่มเมนู AI 🍲
            </h1>
            <p className="text-xs sm:text-sm text-muted">
              สุ่มเมนูหลากหลายจากวัตถุดิบที่ยังไม่หมดอายุจริงในตู้เย็น โดยให้ความสำคัญกับของใกล้หมดอายุก่อน
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-secondary-500/15 border border-secondary-500/30 flex items-center justify-center shrink-0 text-secondary-600 dark:text-secondary-400 shadow-xs">
            <CookingPot className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Step 1: เลือกตู้เย็นที่จะปรุงอาหาร */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
            <Refrigerator className="w-4 h-4 text-primary-600" />
            <span>ขั้นตอนที่ 1: เลือกตู้เย็นที่ต้องการใช้วัตถุดิบ</span>
          </label>
          {fridges.length === 0 ? (
            <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border text-xs text-muted">
              ยังไม่มีตู้เย็นในบ้านนี้ กรุณาสร้างตู้เย็นและเพิ่มวัตถุดิบก่อนใช้งาน AI
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {fridges.map((f) => {
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
                    <span>{f.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Step 2: ตรวจสอบวัตถุดิบ 3 กลุ่ม (ใกล้หมดอายุ / สดใหม่ / หมดอายุแล้วถูกตัดออก) */}
        <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-primary-600" />
              <span className="font-heading font-bold text-xs sm:text-sm text-on-surface">
                ขั้นตอนที่ 2: วัตถุดิบใน &quot;{selectedFridge?.name || 'ตู้เย็น'}&quot; (พร้อมใช้ {classified.usable.length} รายการ)
              </span>
            </div>
            <Link
              href={selectedFridgeId ? `/fridges/${selectedFridgeId}` : '/fridges'}
              className="text-primary-600 font-bold text-xs hover:underline flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>จัดการตู้นี้</span>
            </Link>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-muted">
              กำลังดึงข้อมูลวัตถุดิบจากตู้เย็น...
            </div>
          ) : fridgeItems.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface-container-low border border-dashed border-border text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-surface-container text-muted flex items-center justify-center mx-auto text-lg">
                🧊
              </div>
              <h4 className="font-heading font-bold text-xs sm:text-sm text-foreground">
                ยังไม่มีวัตถุดิบในตู้เย็น &quot;{selectedFridge?.name}&quot;
              </h4>
              <p className="text-xs text-muted max-w-xs mx-auto">
                เพิ่มวัตถุดิบหรือสแกนใบเสร็จเข้าตู้นี้ก่อน เพื่อให้ AI สุ่มเมนูจากของจริงในตู้ของคุณ
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* กลุ่มที่ 1: ใกล้หมดอายุ (0-5 วัน — คะแนนความสำคัญสูง) */}
              {expiringSoonItems.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlarmClock className="w-3.5 h-3.5" />
                    <span>ใกล้หมดอายุ — ให้ความสำคัญสูง ({expiringSoonItems.length})</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {expiringSoonItems.map((item) => {
                      const isExcluded = excludedIds.has(item.id);
                      const isHighlighted =
                        Boolean(initialIngredient) &&
                        ingredientNamesMatch(item.name, initialIngredient || '');
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleIngredientInclude(item.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                            isExcluded
                              ? 'bg-surface-container-low text-muted border-border line-through opacity-60'
                              : isHighlighted
                              ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300 border-primary-500 font-bold ring-2 ring-primary-500/20'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 font-bold'
                          }`}
                          title={isExcluded ? 'คลิกเพื่อนำกลับมาใช้' : 'คลิกเพื่อยกเว้นวัตถุดิบนี้'}
                        >
                          <span>{getAutoEmoji(item.name)}</span>
                          <span className="truncate max-w-[140px]">
                            {item.name} ({item.quantity} {item.unit})
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-600 text-white">
                            {formatExpiryShortBadge(item.daysLeft)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* กลุ่มที่ 2: วัตถุดิบที่ยังสดใหม่ (รวมสุ่มเพื่อความหลากหลาย) */}
              {freshItems.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <span className="text-xs font-bold text-secondary-600 dark:text-secondary-400 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5" />
                    <span>วัตถุดิบยังสดใหม่ — ร่วมสุ่มเพื่อความหลากหลาย ({freshItems.length})</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {freshItems.map((item) => {
                      const isExcluded = excludedIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleIngredientInclude(item.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                            isExcluded
                              ? 'bg-surface-container-low text-muted border-border line-through opacity-60'
                              : 'bg-secondary-500/10 text-secondary-700 dark:text-secondary-300 border-secondary-500/30 font-semibold'
                          }`}
                          title={isExcluded ? 'คลิกเพื่อนำกลับมาใช้' : 'คลิกเพื่อยกเว้นวัตถุดิบนี้'}
                        >
                          <span>{getAutoEmoji(item.name)}</span>
                          <span className="truncate max-w-[140px]">
                            {item.name} ({item.quantity} {item.unit})
                          </span>
                          {item.daysLeft !== null && (
                            <span className="text-[10px] text-muted">
                              (เหลือ {item.daysLeft} วัน)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* กลุ่มที่ 3: หมดอายุแล้ว (ถูกตัดออกอัตโนมัติ ห้ามนำมาคิดสูตรเด็ดขาด) */}
              {expiredItems.length > 0 && (
                <div className="p-3 rounded-2xl bg-tertiary-500/10 border border-tertiary-500/25 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-tertiary-700 dark:text-tertiary-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        ตัดออกอัตโนมัติ: วัตถุดิบหมดอายุแล้ว ({expiredItems.length}) — จะไม่ถูกนำมาแนะนำเมนู
                      </span>
                    </span>
                    <Link
                      href="/expirations"
                      className="text-[11px] font-bold text-tertiary-600 hover:underline shrink-0"
                    >
                      จัดการของหมดอายุ
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {expiredItems.map((item) => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-card/80 border border-tertiary-500/30 text-[11px] text-tertiary-700 dark:text-tertiary-300 line-through"
                      >
                        <span>{getAutoEmoji(item.name)}</span>
                        <span>{item.name}</span>
                        <span className="no-underline font-bold">
                          ({formatExpiryShortBadge(item.daysLeft)})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {classified.usable.length === 0 && expiredItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-surface-container-low border border-border text-center text-xs text-muted">
                  ตู้เย็นนี้เหลือเฉพาะวัตถุดิบที่หมดอายุแล้ว จึงไม่สามารถสร้างสูตรอาหารได้ กรุณาเพิ่มวัตถุดิบใหม่
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Step 3: ตัวเลือกประเภทอาหาร, เวลา, จำนวนคน และปุ่มสุ่มเมนู */}
        <div className="flex flex-col gap-3.5 p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border shadow-sm">
          <span className="text-xs font-bold text-on-surface-variant">
            ขั้นตอนที่ 3: ปรับเงื่อนไขเมนูที่ต้องการ
          </span>

          {/* ประเภทอาหาร / สไตล์ */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'easy', label: 'ทำง่าย', icon: Sparkles },
              { id: 'thai', label: 'อาหารไทย', icon: Flame },
              { id: 'fusion', label: 'ฟิวชั่น / นานาชาติ', icon: Globe },
              { id: 'healthy', label: 'เพื่อสุขภาพ / คลีน', icon: Heart },
              { id: 'budget', label: 'ประหยัดงบ', icon: Wallet },
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

          {/* เวลาทำอาหาร & จำนวนคน (PART 4.4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-surface-container-low border border-border/70">
              <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-primary-600" />
                <span>เวลาทำอาหาร</span>
              </span>
              <div className="flex items-center gap-1">
                {[
                  { id: '15', label: '≤ 15 น.' },
                  { id: '30', label: '≤ 30 น.' },
                  { id: 'any', label: 'ไม่จำกัด' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCookingTime(opt.id as 'any' | '15' | '30')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      cookingTime === opt.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-card text-muted hover:text-foreground border border-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-surface-container-low border border-border/70">
              <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary-600" />
                <span>จำนวนคน</span>
              </span>
              <div className="flex items-center gap-1">
                {['1-2 คน', '3-4 คน', '5+ คน'].map((srv) => (
                  <button
                    key={srv}
                    type="button"
                    onClick={() => setServings(srv)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      servings === srv
                        ? 'bg-primary-600 text-white'
                        : 'bg-card text-muted hover:text-foreground border border-border'
                    }`}
                  >
                    {srv}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Weighted Random AI Button */}
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={generating || totalUsableSelected === 0}
            className="mt-1 w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 text-white font-heading font-bold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-primary-500/25 active:scale-[0.98] transition disabled:opacity-60 group"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AI กำลังสุ่มเมนูปลอดภัยจาก &quot;{selectedFridge?.name}&quot;...</span>
              </>
            ) : (
              <>
                <Shuffle className="w-4 h-4 text-amber-100" />
                <span>
                  {recipes.length > 0
                    ? `สุ่มเมนูใหม่อีกครั้ง (${totalUsableSelected} วัตถุดิบพร้อมใช้)`
                    : `สุ่มเมนูอาหารด้วย AI (${totalUsableSelected} วัตถุดิบพร้อมใช้)`}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Loading State */}
        {generating && (
          <div className="p-8 rounded-3xl bg-surface-container-low border border-border flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/15 text-primary-600 flex items-center justify-center text-2xl animate-bounce">
              🍳
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
                กำลังวิเคราะห์วัตถุดิบที่ยังไม่หมดอายุ...
              </h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                คัดกรองของหมดอายุออก 100% และจัดสูตรให้เหมาะสมสำหรับ {servings}
              </p>
            </div>
          </div>
        )}

        {/* Ready State */}
        {!generating && recipes.length === 0 && (
          <div className="p-8 rounded-3xl bg-surface-container-low border border-border flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/15 text-primary-600 flex items-center justify-center text-2xl">
              👨‍🍳
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
                พร้อมสุ่มเมนูอาหารสำหรับมื้อนี้แล้วหรือยัง?
              </h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                เลือกตู้เย็นและเงื่อนไขด้านบน แล้วกดปุ่ม &quot;สุ่มเมนูอาหารด้วย AI&quot; (กดสุ่มใหม่ได้เรื่อย ๆ เพื่อเมนูที่หลากหลาย)
              </p>
            </div>
          </div>
        )}

        {/* AI Recipe Cards (Responsive Grid on Large Screens) */}
        {!generating && recipes.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-base sm:text-lg font-bold text-on-surface flex items-center gap-2">
                <CookingPot className="w-5 h-5 text-primary-600" />
                <span>เมนูแนะนำจากตู้ &quot;{selectedFridge?.name}&quot;</span>
              </h2>
              <button
                type="button"
                onClick={handleGenerateAI}
                className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>สุ่มเมนูใหม่</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
              {recipes.map((r) => {
                const isDeducted = deductedRecipes.has(r.id);
                const inFridgeIngredients = r.ingredients.filter((i) => i.inFridge);
                const needToBuyIngredients = r.ingredients.filter((i) => !i.inFridge);

                return (
                  <div
                    key={r.id}
                    className="flex flex-col rounded-3xl bg-surface-container-lowest shadow-sm border border-border overflow-hidden hover:shadow-md transition"
                  >
                    {/* Recipe Flow Diagram Visual Header */}
                    <div className="bg-gradient-to-br from-surface-container-high/80 via-surface-container-low to-surface-container-lowest border-b border-border/80 p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-full bg-primary-500 text-white text-xs font-semibold shadow-xs">
                          {r.tag}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-secondary-600 bg-secondary-500/10 border border-secondary-500/25 px-2.5 py-1 rounded-full">
                            มีแล้ว {inFridgeIngredients.length}
                          </span>
                          {needToBuyIngredients.length > 0 && (
                            <span className="text-[11px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full">
                              ซื้อเพิ่ม {needToBuyIngredients.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        {r.nameEn && (
                          <span className="text-xs text-muted block truncate font-sans">
                            {r.nameEn}
                          </span>
                        )}
                        <h3 className="font-heading font-bold text-xl text-foreground leading-snug">
                          {r.name}
                        </h3>
                      </div>

                      {/* Recipe Flow Diagram */}
                      <div className="p-3 rounded-2xl bg-surface-container/70 border border-border/70 space-y-2">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1.5">
                          <span>🔄</span>
                          <span>แผนภาพผสมผสานวัตถุดิบ:</span>
                        </span>
                        <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                          {r.ingredients.map((ing, iIdx) => (
                            <React.Fragment key={iIdx}>
                              <div
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-medium ${
                                  ing.inFridge
                                    ? 'bg-secondary-500/10 border-secondary-500/35 text-foreground'
                                    : 'bg-surface-container-lowest border-border/80 text-muted'
                                }`}
                              >
                                <span className="text-sm">{getAutoEmoji(ing.name)}</span>
                                <span className="truncate max-w-[120px]">{ing.name}</span>
                              </div>
                              {iIdx < r.ingredients.length - 1 && (
                                <span className="text-primary-500 font-bold text-xs select-none">+</span>
                              )}
                            </React.Fragment>
                          ))}
                          <span className="text-primary-500 font-bold text-sm select-none px-0.5">➔</span>
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary-500/15 border border-primary-500/35 text-xs font-semibold text-primary-500">
                            <span>🍳</span>
                            <span>{r.name.length > 20 ? r.name.slice(0, 18) + '...' : r.name}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-4">
                      <div className="space-y-4">
                        {/* Meta Specs Row */}
                        <div className="grid grid-cols-4 gap-1.5 p-2.5 rounded-2xl bg-surface-container-low border border-border/60 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-primary-600">{r.time}</span>
                            <span className="text-[10px] text-muted">เวลาปรุง</span>
                          </div>
                          <div className="flex flex-col items-center border-x border-border/80">
                            <span className="text-xs font-bold text-amber-600">{r.difficulty}</span>
                            <span className="text-[10px] text-muted">ความยาก</span>
                          </div>
                          <div className="flex flex-col items-center border-r border-border/80">
                            <span className="text-xs font-bold text-secondary-600">{r.servings}</span>
                            <span className="text-[10px] text-muted">สำหรับ</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-tertiary-600">{r.calories}</span>
                            <span className="text-[10px] text-muted">พลังงาน</span>
                          </div>
                        </div>

                        {/* Ingredients: Available vs Buy More */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-on-surface">
                            ส่วนผสม (ตรวจยืนยันกับสต็อกจริงแล้ว):
                          </span>
                          <div className="space-y-1.5">
                            {r.ingredients.map((ing, iIdx) => (
                              <div
                                key={iIdx}
                                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-low border border-border/50 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {ing.inFridge ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary-500/15 text-secondary-700 dark:text-secondary-300 border border-secondary-500/30 text-[10px] font-bold shrink-0">
                                      <Check className="w-3 h-3" />
                                      <span>{ing.location}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                                      <ShoppingBag className="w-3 h-3" />
                                      <span>ต้องซื้อเพิ่ม</span>
                                    </span>
                                  )}
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
                            ขั้นตอนการทำอาหาร:
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
                      </div>

                      {/* CTA: Cook & Deduct */}
                      <button
                        type="button"
                        disabled={isDeducted || inFridgeIngredients.length === 0}
                        onClick={() => handleCookAndDeduct(r)}
                        className={`w-full py-3.5 px-4 rounded-2xl font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98 disabled:opacity-60 ${
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
                            <span>
                              ทำเมนูนี้เลย! (ตัดสต็อก {inFridgeIngredients.length} รายการจากตู้นี้)
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
