-- ============================================================
-- Smart Fridge — Safe Non-Destructive Migration (2026-11-18)
-- วัตถุประสงค์:
--   1. เพิ่มคอลัมน์ที่จำเป็นแบบ IF NOT EXISTS (ไม่ลบหรือทำให้ข้อมูลเดิมสูญหาย)
--   2. เพิ่มดัชนี (Indexes) สำหรับการค้นหาตาม household_id / fridge_id / expiry_date
--   3. ปรับปรุง RLS Policies ให้สมาชิกเข้าถึงได้เฉพาะข้อมูลของครัวเรือนตนเอง
--   4. เพิ่ม RPC `join_household_by_invite` รองรับรหัส #TY-, HH-, FRIDGE- และ UUID
-- ============================================================

-- 1. ตรวจสอบและเพิ่มคอลัมน์เสริมแบบปลอดภัย (ไม่กระทบข้อมูลเดิม)
ALTER TABLE IF EXISTS public.households ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE IF EXISTS public.households ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.fridges ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '❄️';
ALTER TABLE IF EXISTS public.fridges ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE IF EXISTS public.fridges ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE IF EXISTS public.fridges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE IF EXISTS public.items ADD COLUMN IF NOT EXISTS added_by UUID;
ALTER TABLE IF EXISTS public.items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS public.items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_stock';
ALTER TABLE IF EXISTS public.items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.item_batches ADD COLUMN IF NOT EXISTS added_by UUID;
ALTER TABLE IF EXISTS public.item_batches ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. เพิ่ม Indexes เพื่อประสิทธิภาพในการแยกข้อมูลตามตู้เย็นและวันหมดอายุ
CREATE INDEX IF NOT EXISTS idx_fridges_household_id ON public.fridges(household_id);
CREATE INDEX IF NOT EXISTS idx_items_fridge_id ON public.items(fridge_id);
CREATE INDEX IF NOT EXISTS idx_items_household_id ON public.items(household_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_item_id ON public.item_batches(item_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_expiry_date ON public.item_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_activity_logs_household_created ON public.activity_logs(household_id, created_at DESC);

-- 3. Helper function ตรวจสอบความเป็นสมาชิกครัวเรือน (SECURITY DEFINER เพื่อไม่ติด RLS loop)
CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
  );
$$;

-- 4. RPC สำหรับเข้าร่วมครัวเรือนด้วยรหัสคำเชิญหรือรหัสบ้าน (#TY-XXXXXX, HH-XXXXXX, FRIDGE-XXXXXX, UUID)
CREATE OR REPLACE FUNCTION public.join_household_by_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_code TEXT := UPPER(TRIM(p_invite_code));
  v_clean TEXT;
  v_household_id UUID;
  v_invite_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนเข้าร่วมครัวเรือน';
  END IF;

  -- 1) ค้นหาจากตาราง invitations ที่ยังไม่หมดอายุ
  SELECT id, household_id
  INTO v_invite_id, v_household_id
  FROM public.invitations
  WHERE UPPER(invite_code) = v_code
    AND is_active = TRUE
    AND expires_at > NOW()
    AND use_count < max_uses
  LIMIT 1;

  -- 2) Fallback: ค้นหาจากรหัสบ้าน #TY-XXXXXX / HH-XXXXXX / UUID
  IF v_household_id IS NULL THEN
    v_clean := LOWER(
      REPLACE(
        REGEXP_REPLACE(v_code, '^(#?TY-|HH-|HOME-)', '', 'i'),
        '-',
        ''
      )
    );

    IF LENGTH(v_clean) >= 6 THEN
      SELECT id INTO v_household_id
      FROM public.households
      WHERE LOWER(id::TEXT) = LOWER(v_code)
         OR REPLACE(LOWER(id::TEXT), '-', '') LIKE v_clean || '%'
      LIMIT 1;
    END IF;
  END IF;

  IF v_household_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- เพิ่มเป็นสมาชิกหากยังไม่ได้เป็น
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'member')
  ON CONFLICT DO NOTHING;

  -- อัปเดตจำนวนการใช้ invite ถ้าใช้จากตาราง invitations
  IF v_invite_id IS NOT NULL THEN
    UPDATE public.invitations
    SET use_count = use_count + 1
    WHERE id = v_invite_id;
  END IF;

  RETURN v_household_id;
END;
$$;

-- 5. ปรับปรุง RLS Policies ให้ปลอดภัยตามสิทธิ์ของแต่ละ Household
-- (ผู้ที่ไม่ได้เป็นสมาชิกของบ้านนั้นจะไม่สามารถดูหรือแก้ไขข้อมูลของบ้านอื่นได้)

-- households
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "households_all_access" ON public.households;
DROP POLICY IF EXISTS "households_member_select" ON public.households;
DROP POLICY IF EXISTS "households_auth_insert" ON public.households;
DROP POLICY IF EXISTS "households_owner_update" ON public.households;
DROP POLICY IF EXISTS "households_owner_delete" ON public.households;

CREATE POLICY "households_member_select" ON public.households
  FOR SELECT TO authenticated
  USING (public.is_household_member(id) OR created_by = auth.uid());

CREATE POLICY "households_auth_insert" ON public.households
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "households_owner_update" ON public.households
  FOR UPDATE TO authenticated
  USING (public.is_household_member(id));

CREATE POLICY "households_owner_delete" ON public.households
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

-- household_members
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_all_access" ON public.household_members;
DROP POLICY IF EXISTS "members_select" ON public.household_members;
DROP POLICY IF EXISTS "members_insert_self" ON public.household_members;
DROP POLICY IF EXISTS "members_delete_owner_or_self" ON public.household_members;

CREATE POLICY "members_select" ON public.household_members
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id) OR user_id = auth.uid());

CREATE POLICY "members_insert_self" ON public.household_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "members_delete_owner_or_self" ON public.household_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

-- fridges
ALTER TABLE public.fridges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fridges_all_access" ON public.fridges;
DROP POLICY IF EXISTS "fridges_member_all" ON public.fridges;

CREATE POLICY "fridges_member_all" ON public.fridges
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_all_access" ON public.items;
DROP POLICY IF EXISTS "items_member_all" ON public.items;

CREATE POLICY "items_member_all" ON public.items
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- item_batches
ALTER TABLE public.item_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batches_all_access" ON public.item_batches;
DROP POLICY IF EXISTS "batches_member_all" ON public.item_batches;

CREATE POLICY "batches_member_all" ON public.item_batches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = item_batches.item_id
        AND public.is_household_member(i.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items i
      WHERE i.id = item_batches.item_id
        AND public.is_household_member(i.household_id)
    )
  );

-- activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_all_access" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_member_all" ON public.activity_logs;

CREATE POLICY "activity_member_all" ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invitations_all_access" ON public.invitations;
DROP POLICY IF EXISTS "invitations_member_manage" ON public.invitations;
DROP POLICY IF EXISTS "invitations_auth_read_active" ON public.invitations;

CREATE POLICY "invitations_auth_read_active" ON public.invitations
  FOR SELECT TO authenticated
  USING (is_active = TRUE OR public.is_household_member(household_id));

CREATE POLICY "invitations_member_manage" ON public.invitations
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_all_access" ON public.users;
DROP POLICY IF EXISTS "users_authenticated_select" ON public.users;
DROP POLICY IF EXISTS "users_self_write" ON public.users;

CREATE POLICY "users_authenticated_select" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "users_self_write" ON public.users
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- โหลด schema cache ใหม่
NOTIFY pgrst, 'reload schema';
