/**
 * Smart Fridge — Supabase Client (Server)
 *
 * ใช้สำหรับ Server Components, API Routes, Server Actions
 * อ่าน/เขียน cookies สำหรับ Auth Session
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll ถูกเรียกจาก Server Component ที่อ่าน cookies ได้อย่างเดียว
            // จะ throw error ได้ — ปลอดภัยที่จะ ignore เพราะ middleware จะ refresh session ให้
          }
        },
      },
    }
  );
}
