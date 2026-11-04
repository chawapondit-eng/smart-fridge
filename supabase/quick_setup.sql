-- ============================================================
-- Smart Fridge — One-Click Master Setup SQL
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL Editor เพื่อแก้ปัญหาทั้งหมด:
-- 1. เพิ่มตู้เย็น (Fridges) ได้ 100%
-- 2. สร้างครัวเรือน (Households) ได้ 100%
-- 3. เพิ่มสินค้า (Items) และวันหมดอายุ (Item Batches) ได้ 100%
-- 4. ปลดล็อค RLS ทุกตาราง ไม่ติด Error Permission
-- ============================================================

-- 1. แก้ไขและเสริมตาราง households
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "households_all_access" ON public.households;
CREATE POLICY "households_all_access" ON public.households FOR ALL USING (true) WITH CHECK (true);

-- 2. แก้ไขและเสริมตาราง household_members
CREATE TABLE IF NOT EXISTS public.household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.household_members ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.household_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_all_access" ON public.household_members;
CREATE POLICY "members_all_access" ON public.household_members FOR ALL USING (true) WITH CHECK (true);

-- 3. แก้ไขและเสริมตาราง fridges (แก้ปัญหา เพิ่มตู้เย็นไม่ได้ 100%)
CREATE TABLE IF NOT EXISTS public.fridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '❄️',
    display_order INT NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.fridges ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '❄️';
ALTER TABLE public.fridges ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE public.fridges ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.fridges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.fridges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.fridges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fridges_all_access" ON public.fridges;
CREATE POLICY "fridges_all_access" ON public.fridges FOR ALL USING (true) WITH CHECK (true);

-- 4. ตาราง items (สินค้าในตู้เย็น)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fridge_id UUID NOT NULL REFERENCES public.fridges(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'ชิ้น',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'in_stock',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS added_by UUID;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_all_access" ON public.items;
CREATE POLICY "items_all_access" ON public.items FOR ALL USING (true) WITH CHECK (true);

-- 5. ตาราง item_batches (วันหมดอายุ)
CREATE TABLE IF NOT EXISTS public.item_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.item_batches ADD COLUMN IF NOT EXISTS added_by UUID;
ALTER TABLE public.item_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batches_all_access" ON public.item_batches;
CREATE POLICY "batches_all_access" ON public.item_batches FOR ALL USING (true) WITH CHECK (true);

-- 6. ตาราง activity_logs (ประวัติกิจกรรม)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    fridge_id UUID REFERENCES public.fridges(id) ON DELETE SET NULL,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    user_id UUID,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_all_access" ON public.activity_logs;
CREATE POLICY "activity_all_access" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);

-- 7. ตาราง invitations (รหัสคำเชิญ)
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_by UUID,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    max_uses INT NOT NULL DEFAULT 5,
    use_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invitations_all_access" ON public.invitations;
CREATE POLICY "invitations_all_access" ON public.invitations FOR ALL USING (true) WITH CHECK (true);

-- 8. ตาราง users ใน public schema
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_all_access" ON public.users;
CREATE POLICY "users_all_access" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- 9. กำหนดสิทธิ์ให้ anon และ authenticated อ่าน-เขียนได้ทั้งหมด
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- 10. บังคับให้ PostgREST โหลด Schema Cache ใหม่ทันที
NOTIFY pgrst, 'reload schema';
