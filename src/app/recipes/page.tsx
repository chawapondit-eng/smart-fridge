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
  Plus,
  Shuffle,
  Wallet,
  Globe,
  ShoppingBag,
  Users,
  ShieldAlert,
} from 'lucide-react';
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
  const { currentHousehold, fridges, authUser, user, canEditItems } = useHousehold();

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
    if (!canEditItems) {
      toast.error('คุณไม่มีสิทธิ์ตัดสต็อกวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }
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
        const { error: rpcError } = await supabase.rpc('update_item_quantity', {
          p_item_id: target.id,
          p_change: -1,
          p_user_id: authUser.id,
        });

        if (rpcError) {
          await supabase
            .from('items')
            .update({
              quantity: newQty,
              status: newQty === 0 ? 'out_of_stock' : newQty <= 1 ? 'low_stock' : 'in_stock',
              updated_at: new Date().toISOString(),
            })
            .eq('id', target.id);
        }

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
        {/* 1. Top Generator Card (PDF Page 4 — Warm Orange) */}
        <section className="ds-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-100 text-primary-700 dark:text-primary-200 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-primary-600" />
                <span>ผู้ช่วยทำอาหาร AI</span>
              </span>
              <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                สุ่มเมนูอาหารจากวัตถุดิบในตู้
              </h1>
              <p className="text-xs sm:text-sm text-muted">
                คิดเมนูจากวัตถุดิบที่มีในตู้ โดยเน้นของใกล้หมดอายุก่อน พร้อมตัดสต็อกอัตโนมัติ
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={generating || totalUsableSelected === 0}
              className="ds-btn-primary px-5 py-3 text-xs sm:text-sm font-heading shrink-0 flex items-center justify-center gap-2 shadow-[0_3px_12px_-2px_rgba(234,88,12,0.38)] disabled:opacity-60 cursor-pointer"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>กำลังคิดเมนู...</span>
                </>
              ) : (
                <>
                  <Shuffle className="w-4 h-4" />
                  <span>สุ่มเมนูใหม่ด้วย AI</span>
                </>
              )}
            </button>
          </div>

          {/* Inset Fridge Selector & Detected Ingredients Box */}
          <div className="rounded-2xl bg-surface-container-low border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {fridges.map((f) => {
                  const isActive = selectedFridgeId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFridgeId(f.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition cursor-pointer ${
                        isActive
                          ? 'bg-primary-600 text-white shadow-[0_2px_8px_-2px_rgba(234,88,12,0.35)]'
                          : 'bg-card text-muted hover:text-foreground border border-border'
                      }`}
                    >
                      <span>{f.icon || '❄️'}</span>
                      <span>{f.name}</span>
                    </button>
                  );
                })}
              </div>

              <Link
                href={selectedFridgeId ? `/fridges/${selectedFridgeId}` : '/fridges'}
                className="text-primary-600 font-semibold text-xs hover:underline flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>จัดการตู้นี้</span>
              </Link>
            </div>

            {loading ? (
              <div className="py-4 text-center text-xs text-muted">
                กำลังดึงข้อมูลวัตถุดิบจากตู้เย็น...
              </div>
            ) : fridgeItems.length === 0 ? (
              <div className="py-5 text-center space-y-1.5">
                <p className="font-heading font-semibold text-xs sm:text-sm text-foreground">
                  ยังไม่มีวัตถุดิบในตู้เย็น &quot;{selectedFridge?.name || 'นี้'}&quot;
                </p>
                <p className="text-xs text-muted">
                  เพิ่มวัตถุดิบหรือสแกนใบเสร็จเข้าตู้นี้ก่อน เพื่อให้ AI สุ่มเมนูจากของจริงในตู้ของคุณ
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-foreground">
                  วัตถุดิบใกล้หมดอายุและพร้อมใช้ที่ AI ตรวจพบใน &quot;{selectedFridge?.name}&quot; (แตะเพื่อยกเว้นได้):
                </p>

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
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition cursor-pointer ${
                          isExcluded
                            ? 'bg-card text-muted border-border line-through opacity-55'
                            : isHighlighted
                            ? 'bg-primary-100 text-primary-800 border-primary-500 font-bold ring-2 ring-primary-500/20'
                            : 'bg-card text-foreground border-border hover:border-primary-300 font-medium'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.daysLeft !== null && item.daysLeft <= 2 ? 'bg-rose-500' : 'bg-amber-500'
                          }`}
                        />
                        <span>{item.name}</span>
                        <span className="text-[11px] text-muted">
                          ({formatExpiryShortBadge(item.daysLeft)})
                        </span>
                      </button>
                    );
                  })}

                  {freshItems.map((item) => {
                    const isExcluded = excludedIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleIngredientInclude(item.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition cursor-pointer ${
                          isExcluded
                            ? 'bg-card text-muted border-border line-through opacity-55'
                            : 'bg-card text-foreground border-border hover:border-emerald-400 font-medium'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>{item.name}</span>
                        {item.daysLeft !== null && (
                          <span className="text-[11px] text-muted">({item.daysLeft} วัน)</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {expiredItems.length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 text-[11px] text-rose-600">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>ตัดของหมดอายุออกอัตโนมัติ {expiredItems.length} รายการ (ไม่นำมาคิดสูตร)</span>
                    </span>
                    <Link href="/expirations" className="font-semibold hover:underline">
                      จัดการของหมดอายุ →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preferences + Cooking Time + Servings Bar */}
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex flex-wrap gap-1.5">
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border cursor-pointer ${
                      active
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-surface-container-low text-muted hover:text-foreground border-border'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-surface-container-low border border-border">
                <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-primary-600" />
                  <span>เวลาปรุง</span>
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
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

              <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-surface-container-low border border-border">
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
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
          </div>
        </section>

        {/* Loading State */}
        {generating && (
          <div className="p-8 rounded-3xl bg-card border border-border flex flex-col items-center justify-center text-center gap-3 shadow-[var(--shadow-xs)]">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center text-2xl animate-bounce">
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
          <div className="p-8 rounded-3xl bg-card border border-border flex flex-col items-center justify-center text-center gap-3 shadow-[var(--shadow-xs)]">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center text-2xl">
              👨‍🍳
            </div>
            <div className="space-y-1">
              <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
                พร้อมสุ่มเมนูอาหารสำหรับมื้อนี้แล้วหรือยัง?
              </h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                กดปุ่ม &quot;สุ่มเมนูใหม่ด้วย AI&quot; ด้านบนเพื่อสร้างเมนูอร่อยจากของในตู้เย็น ({totalUsableSelected} วัตถุดิบพร้อมใช้)
              </p>
            </div>
          </div>
        )}

        {/* 2. Two-Column AI Recipe Cards (PDF Page 4 — Warm Orange) */}
        {!generating && recipes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {recipes.map((r) => {
              const isDeducted = deductedRecipes.has(r.id);
              const inFridgeIngredients = r.ingredients.filter((i) => i.inFridge);

              return (
                <article
                  key={r.id}
                  className="ds-card p-5 sm:p-6 flex flex-col justify-between gap-4 hover:border-primary-300 transition"
                >
                  <div className="space-y-4">
                    {/* Top Meta Bar: Icon + Tag + Time */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-base shrink-0">
                          🍲
                        </span>
                        <span className="px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-100/15 border border-primary-200 text-primary-700 dark:text-primary-200 text-xs font-semibold truncate">
                          {r.tag}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted shrink-0">
                        <span className="inline-flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5 text-primary-600" />
                          <span>{r.time}</span>
                        </span>
                        {r.calories && (
                          <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-surface-container text-[11px]">
                            {r.calories}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dish Title */}
                    <div className="space-y-0.5">
                      <h3 className="font-heading font-bold text-lg sm:text-xl text-foreground leading-snug">
                        {r.name}
                      </h3>
                      {r.nameEn && (
                        <p className="text-xs text-muted truncate">{r.nameEn}</p>
                      )}
                    </div>

                    {/* วัตถุดิบในตู้ที่ต้องหยิบ */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">
                        วัตถุดิบในตู้ที่ต้องหยิบ:
                      </p>
                      <div className="space-y-1.5">
                        {r.ingredients.map((ing, iIdx) => (
                          <div
                            key={iIdx}
                            className="flex items-center justify-between gap-2 py-1 text-xs sm:text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-primary-600 font-bold">•</span>
                              <span className="font-medium text-foreground truncate">
                                {ing.name} ({ing.amount})
                              </span>
                            </div>

                            {ing.inFridge ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-muted text-[11px] font-medium shrink-0">
                                📍 {ing.location}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[11px] font-semibold shrink-0">
                                <ShoppingBag className="w-3 h-3" />
                                ซื้อเพิ่ม
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ขั้นตอนการทำ Inset Cream Box */}
                    <div className="rounded-2xl bg-surface-container-low border border-border p-4 space-y-2">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span className="text-amber-500">🔥</span>
                        <span>ขั้นตอนการทำ:</span>
                      </p>
                      <div className="space-y-1.5 text-xs text-muted leading-relaxed">
                        {r.steps.map((step, sIdx) => (
                          <p key={sIdx}>
                            <span className="font-bold text-foreground mr-1">{sIdx + 1}.</span>
                            {step}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Full-width Warm Orange CTA */}
                  <button
                    type="button"
                    disabled={isDeducted || inFridgeIngredients.length === 0}
                    onClick={() => handleCookAndDeduct(r)}
                    className={`w-full py-3.5 px-4 rounded-xl font-heading font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer ${
                      isDeducted
                        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                        : 'ds-btn-primary shadow-[0_3px_10px_-2px_rgba(234,88,12,0.38)]'
                    }`}
                  >
                    {isDeducted ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>ตัดสต็อกเรียบร้อยแล้ว ✨</span>
                      </>
                    ) : (
                      <>
                        <CookingPot className="w-4 h-4" />
                        <span>✓ ทำเมนูนี้ (ตัดสต็อกอัตโนมัติ {inFridgeIngredients.length} รายการ)</span>
                      </>
                    )}
                  </button>
                </article>
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
