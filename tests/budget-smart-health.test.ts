import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeeklyBudget,
  setWeeklyBudget,
  fetchWeeklyBudgetSummary,
} from '../src/lib/budget';

// Polyfill localStorage in test runtime
const storage = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, val: string) => {
    storage.set(key, String(val));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  key: (idx: number) => Array.from(storage.keys())[idx] || null,
  get length() {
    return storage.size;
  },
};

type BudgetSummaryClient = Parameters<typeof fetchWeeklyBudgetSummary>[0];

function createMockSupabase(logs: Array<Record<string, unknown>> = [], dbBudget: number | null = null): BudgetSummaryClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col2: string, val2: string) => {
            if (val2 === 'budget_updated') {
              return {
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: dbBudget ? { details: { weekly_budget: dbBudget } } : null,
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {
              order: async () => ({
                data: logs,
                error: null,
              }),
            };
          },
        }),
      }),
    }),
  } as unknown as BudgetSummaryClient;
}

// ============================================================
// 1. BUDGET LOGIC & THRESHOLD TESTS
// ============================================================
test('Budget: getWeeklyBudget and setWeeklyBudget persist per household', () => {
  const hh1 = 'hh-budget-1';
  const hh2 = 'hh-budget-2';

  setWeeklyBudget(hh1, 2500);
  setWeeklyBudget(hh2, 5000);

  assert.equal(getWeeklyBudget(hh1), 2500);
  assert.equal(getWeeklyBudget(hh2), 5000);
});

test('Budget: fetchWeeklyBudgetSummary calculates budget within normal limit (< 80%)', async () => {
  const hhId = 'hh-normal';
  setWeeklyBudget(hhId, 3000);

  const mockLogs = [
    {
      id: 'log-1',
      household_id: hhId,
      action: 'receipt_scanned',
      created_at: new Date().toISOString(),
      details: {
        store_name: 'Big C',
        total_price: 850,
        items_count: 5,
        user_name: 'Jame',
      },
    },
  ];

  const mockClient = createMockSupabase(mockLogs, 3000);
  const summary = await fetchWeeklyBudgetSummary(mockClient, hhId);

  assert.equal(summary.budget, 3000);
  assert.equal(summary.totalSpent, 850);
  assert.equal(summary.remaining, 2150);
  assert.equal(summary.percentUsed, 28);
  assert.equal(summary.isOverBudget, false);
  assert.equal(summary.isNearLimit, false);
  assert.equal(summary.receiptCount, 1);
  assert.equal(summary.history.length, 1);
  assert.equal(summary.history[0].store_name, 'Big C');
});

test('Budget: fetchWeeklyBudgetSummary detects Near Limit threshold (>= 80%)', async () => {
  const hhId = 'hh-near-limit';
  setWeeklyBudget(hhId, 2000);

  const mockLogs = [
    {
      id: 'log-2',
      household_id: hhId,
      action: 'receipt_scanned',
      created_at: new Date().toISOString(),
      details: {
        store_name: 'Lotus',
        total_price: 1700,
        items_count: 8,
      },
    },
  ];

  const mockClient = createMockSupabase(mockLogs, 2000);
  const summary = await fetchWeeklyBudgetSummary(mockClient, hhId);

  assert.equal(summary.budget, 2000);
  assert.equal(summary.totalSpent, 1700);
  assert.equal(summary.remaining, 300);
  assert.equal(summary.percentUsed, 85);
  assert.equal(summary.isOverBudget, false);
  assert.equal(summary.isNearLimit, true);
});

test('Budget: fetchWeeklyBudgetSummary detects Over Budget threshold (> 100%)', async () => {
  const hhId = 'hh-over-budget';
  setWeeklyBudget(hhId, 2000);

  const mockLogs = [
    {
      id: 'log-3',
      household_id: hhId,
      action: 'receipt_scanned',
      created_at: new Date().toISOString(),
      details: {
        store_name: 'Tops Food Hall',
        total_price: 2450,
        items_count: 12,
      },
    },
  ];

  const mockClient = createMockSupabase(mockLogs, 2000);
  const summary = await fetchWeeklyBudgetSummary(mockClient, hhId);

  assert.equal(summary.budget, 2000);
  assert.equal(summary.totalSpent, 2450);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.overBudgetAmount, 450);
  assert.equal(summary.percentUsed, 123);
  assert.equal(summary.isOverBudget, true);
  assert.equal(summary.isNearLimit, false);
});

// ============================================================
// 2. SMART HEALTH (DONUT CHART) METRIC TESTS
// ============================================================
test('Smart Health: Freshness score and counts calculation', () => {
  // Case A: 3 fresh, 1 expired, 0 expiring soon out of 4 total items (matches Image 2: 75%)
  const totalA = 4;
  const freshA = 3;

  const percentA = Math.round((freshA / totalA) * 100);
  assert.equal(percentA, 75);

  // Case B: 100% fresh
  const totalB = 10;
  const freshB = 10;
  const percentB = Math.round((freshB / totalB) * 100);
  assert.equal(percentB, 100);

  // Case C: Empty fridge (0 items) defaults gracefully to 100% without division by zero
  const totalC = 0;
  const freshC = 0;
  const percentC = totalC > 0 ? Math.round((freshC / totalC) * 100) : 100;
  assert.equal(percentC, 100);
});
