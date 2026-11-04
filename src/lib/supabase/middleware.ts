/**
 * Smart Fridge — Supabase Middleware
 *
 * Refresh auth session ทุก request เพื่อไม่ให้ session หมดอายุ
 * ตรวจสอบ auth state และ redirect ไปหน้า login ถ้ายังไม่ล็อกอิน
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes ที่ไม่ต้อง login
const PUBLIC_ROUTES = ['/login', '/register', '/reset-password', '/auth/callback'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // สำคัญ: ต้องเรียก getUser() เพื่อ refresh session
  // ห้ามใช้ getSession() เพราะไม่ validate token กับ Supabase Auth server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

  // ถ้ายังไม่ล็อกอินและไม่ได้อยู่หน้า public → redirect ไป login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // ถ้าล็อกอินแล้วแต่อยู่หน้า login/register → redirect ไป dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
