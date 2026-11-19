-- ============================================================
-- Smart Fridge — Member Permissions Migration (2026-11-20)
-- วัตถุประสงค์:
--   1. ขยาย CHECK constraint ของ household_members ให้รองรับบทบาท 'owner', 'admin', 'member'
--   2. เพิ่มคอลัมน์ permissions (JSONB) สำหรับเก็บสิทธิ์ละเอียด (can_view_items, can_add_items, can_edit_items, can_delete_items, can_manage_members)
--   3. ปรับ RLS Policies ให้ตรวจสอบสิทธิ์เฉพาะผู้มีสิทธิ์เท่านั้น
-- ============================================================

-- 1. ขยาย CHECK constraint บทบาทของสมาชิก
ALTER TABLE IF EXISTS public.household_members DROP CONSTRAINT IF EXISTS household_members_role_check;
ALTER TABLE IF EXISTS public.household_members ADD CONSTRAINT household_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member'));

-- 2. เพิ่มคอลัมน์ permissions สำหรับเก็บสิทธิ์กำหนดเองแบบ JSONB
ALTER TABLE IF EXISTS public.household_members 
  ADD COLUMN IF NOT EXISTS permissions JSONB 
  DEFAULT '{"can_view_items":true,"can_add_items":false,"can_edit_items":false,"can_delete_items":false,"can_manage_members":false}'::jsonb;

-- 3. กำหนดค่าเริ่มต้นให้กับแถวเดิม
UPDATE public.household_members
SET permissions = '{"can_view_items":true,"can_add_items":true,"can_edit_items":true,"can_delete_items":true,"can_manage_members":true}'::jsonb
WHERE role = 'owner' AND (permissions IS NULL OR permissions = '{}'::jsonb);

UPDATE public.household_members
SET permissions = '{"can_view_items":true,"can_add_items":true,"can_edit_items":true,"can_delete_items":true,"can_manage_members":false}'::jsonb
WHERE role = 'admin' AND (permissions IS NULL OR permissions = '{}'::jsonb);

UPDATE public.household_members
SET permissions = '{"can_view_items":true,"can_add_items":true,"can_edit_items":true,"can_delete_items":true,"can_manage_members":false}'::jsonb
WHERE role = 'member' AND (permissions IS NULL OR permissions = '{}'::jsonb);

-- 4. RLS Policy: อนุญาตให้ Owner เท่านั้นที่สามารถ UPDATE สิทธิ์ของสมาชิกในบ้านตนเอง
DROP POLICY IF EXISTS "members_update_owner_only" ON public.household_members;

CREATE POLICY "members_update_owner_only" ON public.household_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

-- 5. รีโหลด Schema Cache ของ PostgREST
NOTIFY pgrst, 'reload schema';
