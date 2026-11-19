import { SupabaseClient } from '@supabase/supabase-js';

export function getWeeklyBudget(householdId: string): number {
  if (typeof window === 'undefined') return 3000;
  const key = `smart_fridge_weekly_budget_${householdId}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = parseFloat(saved);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

export function setWeeklyBudget(householdId: string, amount: number): void {
  if (typeof window === 'undefined') return;
  const key = `smart_fridge_weekly_budget_${householdId}`;
  localStorage.setItem(key, String(amount));
}

export async function saveWeeklyBudgetToDb(
  supabase: SupabaseClient,
  householdId: string,
  userId: string | undefined,
  amount: number
): Promise<void> {
  setWeeklyBudget(householdId, amount);
  try {
    await supabase.from('activity_logs').insert({
      household_id: householdId,
      user_id: userId || null,
      action: 'budget_updated',
      details: {
        weekly_budget: amount,
      },
    });
  } catch {
    // fallback already saved in localStorage
  }
}

export interface WeeklyBudgetSummary {
  budget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  receiptCount: number;
  supermarketSpent: number;
  deliverySpent: number;
}

export async function fetchWeeklyBudgetSummary(
  supabase: SupabaseClient,
  householdId: string
): Promise<WeeklyBudgetSummary> {
  let budget = getWeeklyBudget(householdId);

  // ดึงงบประมาณล่าสุดของครัวเรือนจาก Supabase (ซิงค์ร่วมกันทุกสมาชิกในบ้าน)
  try {
    const { data: latestBudgetLog } = await supabase
      .from('activity_logs')
      .select('details')
      .eq('household_id', householdId)
      .eq('action', 'budget_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dbBudget = Number(
      (latestBudgetLog?.details as Record<string, unknown> | null)?.weekly_budget
    );
    if (!isNaN(dbBudget) && dbBudget > 0) {
      budget = dbBudget;
      setWeeklyBudget(householdId, dbBudget);
    }
  } catch {
    // ignore
  }

  // คำนวณวันจันทร์ของสัปดาห์ปัจจุบัน (Monday 00:00:00)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon, ...
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - distanceToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  let totalSpent = 0;
  let supermarketSpent = 0;
  let deliverySpent = 0;
  let receiptCount = 0;

  try {
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', householdId)
      .eq('action', 'receipt_scanned')
      .gte('created_at', startOfWeek.toISOString());

    if (logs && logs.length > 0) {
      receiptCount = logs.length;
      for (const log of logs) {
        const details = log.details as Record<string, unknown> | null;
        const price = Number(details?.total_price) || 0;
        const store = String(details?.store_name || '').toLowerCase();

        totalSpent += price;
        if (
          store.includes('grab') ||
          store.includes('line man') ||
          store.includes('shopee') ||
          store.includes('food') ||
          store.includes('delivery')
        ) {
          deliverySpent += price;
        } else {
          supermarketSpent += price;
        }
      }
    }
  } catch {
    // ignore
  }

  const remaining = Math.max(0, budget - totalSpent);
  const percentUsed = budget > 0 ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0;

  return {
    budget,
    totalSpent,
    remaining,
    percentUsed,
    receiptCount,
    supermarketSpent,
    deliverySpent,
  };
}

