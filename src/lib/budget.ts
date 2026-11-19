import { SupabaseClient } from '@supabase/supabase-js';

export function getWeeklyBudget(householdId: string): number {
  if (typeof localStorage === 'undefined') return 3000;
  const key = `smart_fridge_weekly_budget_${householdId}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = parseFloat(saved);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3000;
}

export function setWeeklyBudget(householdId: string, amount: number): void {
  if (typeof localStorage === 'undefined') return;
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

export interface ExpenseRecord {
  id: string;
  created_at: string;
  store_name: string;
  total_price: number;
  items_count?: number;
  user_name?: string;
  items?: { name: string; price: number | null; quantity?: number; unit?: string }[];
}

export interface WeeklyBudgetSummary {
  budget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  receiptCount: number;
  supermarketSpent: number;
  deliverySpent: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  overBudgetAmount: number;
  history: ExpenseRecord[];
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

  // คำนวณวันจันทร์ของสัปดาห์ปัจจุบัน (Monday 00:00:00 เวลาท้องถิ่น)
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
  const history: ExpenseRecord[] = [];

  try {
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', householdId)
      .eq('action', 'receipt_scanned')
      .order('created_at', { ascending: false });

    if (logs && logs.length > 0) {
      for (const log of logs) {
        const details = log.details as Record<string, unknown> | null;
        const price = Number(details?.total_price) || 0;
        const store = String(details?.store_name || 'ใบเสร็จสินค้า').trim();
        const logDate = new Date(log.created_at);

        // เก็บประวัติค่าใช้จ่าย
        history.push({
          id: log.id,
          created_at: log.created_at,
          store_name: store,
          total_price: price,
          items_count: typeof details?.items_count === 'number' ? details.items_count : undefined,
          user_name: typeof details?.user_name === 'string' ? details.user_name : undefined,
          items: Array.isArray(details?.items) ? (details.items as ExpenseRecord['items']) : undefined,
        });

        // เฉพาะสัปดาห์นี้
        if (logDate >= startOfWeek) {
          receiptCount++;
          totalSpent += price;

          const lowerStore = store.toLowerCase();
          if (
            lowerStore.includes('grab') ||
            lowerStore.includes('line man') ||
            lowerStore.includes('shopee') ||
            lowerStore.includes('food') ||
            lowerStore.includes('delivery')
          ) {
            deliverySpent += price;
          } else {
            supermarketSpent += price;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const remaining = Math.max(0, budget - totalSpent);
  const overBudgetAmount = Math.max(0, totalSpent - budget);
  const percentUsed = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;
  const isOverBudget = totalSpent > budget;
  const isNearLimit = !isOverBudget && percentUsed >= 80;

  return {
    budget,
    totalSpent,
    remaining,
    percentUsed,
    receiptCount,
    supermarketSpent,
    deliverySpent,
    isOverBudget,
    isNearLimit,
    overBudgetAmount,
    history,
  };
}

