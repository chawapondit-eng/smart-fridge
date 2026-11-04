/**
 * Smart Fridge — Supabase Client (Browser)
 *
 * ใช้สำหรับ Client Components (use client)
 * ใช้ anon key — RLS ป้องกันข้อมูลข้ามครัวเรือนให้
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
