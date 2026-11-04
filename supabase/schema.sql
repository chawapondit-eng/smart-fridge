-- ============================================================
-- Smart Fridge — Database Schema
-- ============================================================
-- วันที่สร้าง: 2026-11-01
-- Database: Supabase PostgreSQL
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. TABLES
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 users — ข้อมูลโปรไฟล์ผู้ใช้ (เสริมจาก auth.users)
-- ------------------------------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'ข้อมูลโปรไฟล์ผู้ใช้เพิ่มเติมจาก Supabase Auth';

-- ------------------------------------------------------------
-- 2.2 households — ครัวเรือน
-- ------------------------------------------------------------
CREATE TABLE public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.households IS 'ครัวเรือน — หน่วยหลักในการจัดการตู้เย็นร่วมกัน';

-- ------------------------------------------------------------
-- 2.3 household_members — สมาชิกครัวเรือน
-- ------------------------------------------------------------
CREATE TABLE public.household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(household_id, user_id)
);

COMMENT ON TABLE public.household_members IS 'ความสัมพันธ์ระหว่างผู้ใช้กับครัวเรือน พร้อมระบุบทบาท';

CREATE INDEX idx_hm_user_id ON public.household_members(user_id);
CREATE INDEX idx_hm_household_id ON public.household_members(household_id);

-- ------------------------------------------------------------
-- 2.4 invitations — คำเชิญเข้าครัวเรือน
-- ------------------------------------------------------------
CREATE TABLE public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES public.users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    use_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invitations IS 'Invite Code สำหรับเชิญสมาชิกเข้าครัวเรือน';

CREATE INDEX idx_inv_code ON public.invitations(invite_code) WHERE is_active = TRUE;
CREATE INDEX idx_inv_household ON public.invitations(household_id);

-- ------------------------------------------------------------
-- 2.5 fridges — ตู้เย็น
-- ------------------------------------------------------------
CREATE TABLE public.fridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '❄️',
    display_order INT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.fridges IS 'ตู้เย็นแต่ละตู้ภายในครัวเรือน';

CREATE INDEX idx_fridges_household ON public.fridges(household_id);

-- ------------------------------------------------------------
-- 2.6 categories — หมวดหมู่สินค้า
-- ------------------------------------------------------------
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.categories IS 'หมวดหมู่สินค้า — มีทั้ง Default (ระบบ) และ Custom (ครัวเรือน)';

-- ------------------------------------------------------------
-- 2.7 items — สินค้าในตู้เย็น
-- ------------------------------------------------------------
CREATE TABLE public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fridge_id UUID NOT NULL REFERENCES public.fridges(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit TEXT NOT NULL DEFAULT 'ชิ้น',
    image_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'in_stock'
        CHECK (status IN ('in_stock', 'low_stock', 'out_of_stock')),
    added_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.items IS 'สินค้าแต่ละรายการในตู้เย็น — quantity เป็นผลรวมจาก item_batches';

CREATE INDEX idx_items_fridge ON public.items(fridge_id);
CREATE INDEX idx_items_household ON public.items(household_id);
CREATE INDEX idx_items_status ON public.items(status);
CREATE INDEX idx_items_name ON public.items(household_id, name);

-- ------------------------------------------------------------
-- 2.8 item_batches — Batch ตามวันหมดอายุ
-- ------------------------------------------------------------
CREATE TABLE public.item_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity >= 0),
    expiry_date DATE,
    added_by UUID NOT NULL REFERENCES public.users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

COMMENT ON TABLE public.item_batches IS 'Batch ของสินค้า — รองรับสินค้าชนิดเดียวกันที่มีวันหมดอายุต่างกัน';

CREATE INDEX idx_batches_item ON public.item_batches(item_id);
CREATE INDEX idx_batches_expiry ON public.item_batches(expiry_date) WHERE expiry_date IS NOT NULL;

-- ------------------------------------------------------------
-- 2.9 activity_logs — ประวัติการใช้งาน
-- ------------------------------------------------------------
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    fridge_id UUID REFERENCES public.fridges(id) ON DELETE SET NULL,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users(id),
    action TEXT NOT NULL CHECK (action IN (
        'item_added',
        'item_removed',
        'item_updated',
        'quantity_increased',
        'quantity_decreased',
        'fridge_created',
        'fridge_updated',
        'fridge_deleted',
        'member_joined',
        'member_removed',
        'receipt_scanned'
    )),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.activity_logs IS 'ประวัติการดำเนินการทั้งหมดในครัวเรือน';

CREATE INDEX idx_activity_household_time ON public.activity_logs(household_id, created_at DESC);
CREATE INDEX idx_activity_fridge_time ON public.activity_logs(fridge_id, created_at DESC)
    WHERE fridge_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2.10 receipts — ใบเสร็จ (Phase 2)
-- ------------------------------------------------------------
CREATE TABLE public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.users(id),
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    ocr_raw_data JSONB,
    target_fridge_id UUID REFERENCES public.fridges(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.receipts IS 'ใบเสร็จที่อัปโหลด — Phase 2';

-- ------------------------------------------------------------
-- 2.11 receipt_items — รายการสินค้าจากใบเสร็จ (Phase 2)
-- ------------------------------------------------------------
CREATE TABLE public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1,
    unit TEXT DEFAULT 'ชิ้น',
    confidence NUMERIC(3, 2),
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.receipt_items IS 'รายการสินค้าที่อ่านจากใบเสร็จผ่าน OCR — Phase 2';


-- ============================================================
-- 3. DEFAULT CATEGORIES (ข้อมูลหมวดหมู่เริ่มต้น)
-- ============================================================
INSERT INTO public.categories (name, icon, is_default, display_order) VALUES
    ('อาหาร', '🍱', TRUE, 1),
    ('เครื่องดื่ม', '🥤', TRUE, 2),
    ('ผัก-ผลไม้', '🥬', TRUE, 3),
    ('เนื้อสัตว์', '🥩', TRUE, 4),
    ('นม-ผลิตภัณฑ์นม', '🥛', TRUE, 5),
    ('ขนม', '🍪', TRUE, 6),
    ('เครื่องปรุง', '🧂', TRUE, 7),
    ('อื่นๆ', '📦', TRUE, 8);


-- ============================================================
-- 4. FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 อัปเดตจำนวนสินค้า — Concurrency Safe
-- ------------------------------------------------------------
-- ใช้ FOR UPDATE เพื่อ Lock แถวระหว่างอัปเดต
-- ป้องกัน Race Condition เมื่อหลายคนกดพร้อมกัน
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_item_quantity(
    p_item_id UUID,
    p_change NUMERIC,
    p_user_id UUID,
    p_batch_id UUID DEFAULT NULL
)
RETURNS TABLE(new_quantity NUMERIC, new_status TEXT) AS $$
DECLARE
    v_current_qty NUMERIC;
    v_new_qty NUMERIC;
    v_new_status TEXT;
    v_item_name TEXT;
    v_household_id UUID;
    v_fridge_id UUID;
    v_batch_qty NUMERIC;
    v_target_batch_id UUID;
BEGIN
    -- 1. Lock item row เพื่อป้องกัน Concurrent Update
    SELECT i.quantity, i.name, i.household_id, i.fridge_id
    INTO v_current_qty, v_item_name, v_household_id, v_fridge_id
    FROM public.items i
    WHERE i.id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบสินค้า (item_id: %)', p_item_id;
    END IF;

    -- 2. คำนวณจำนวนใหม่
    v_new_qty := v_current_qty + p_change;

    IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'จำนวนสินค้าไม่สามารถติดลบได้ (ปัจจุบัน: %, ลด: %)', v_current_qty, ABS(p_change);
    END IF;

    -- 3. จัดการ Batch
    IF p_change < 0 THEN
        -- ลดจำนวน: ใช้ FIFO (หมดอายุเร็วสุดก่อน, NULL expiry ลดท้ายสุด)
        IF p_batch_id IS NOT NULL THEN
            -- ลดจาก Batch ที่ระบุ
            SELECT ib.quantity INTO v_batch_qty
            FROM public.item_batches ib
            WHERE ib.id = p_batch_id AND ib.item_id = p_item_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'ไม่พบ Batch ที่ระบุ';
            END IF;

            IF v_batch_qty + p_change < 0 THEN
                RAISE EXCEPTION 'จำนวนใน Batch ไม่เพียงพอ';
            END IF;

            UPDATE public.item_batches
            SET quantity = quantity + p_change
            WHERE id = p_batch_id;

            -- ลบ Batch ที่จำนวนเป็น 0
            DELETE FROM public.item_batches WHERE id = p_batch_id AND quantity = 0;
        ELSE
            -- ลดแบบ FIFO: เรียงตามวันหมดอายุ (ใกล้หมดก่อน, NULL ทีหลัง)
            DECLARE
                v_remaining NUMERIC := ABS(p_change);
                batch_rec RECORD;
            BEGIN
                FOR batch_rec IN
                    SELECT ib.id, ib.quantity
                    FROM public.item_batches ib
                    WHERE ib.item_id = p_item_id AND ib.quantity > 0
                    ORDER BY
                        CASE WHEN ib.expiry_date IS NULL THEN 1 ELSE 0 END,
                        ib.expiry_date ASC
                    FOR UPDATE
                LOOP
                    IF v_remaining <= 0 THEN EXIT; END IF;

                    IF batch_rec.quantity <= v_remaining THEN
                        v_remaining := v_remaining - batch_rec.quantity;
                        DELETE FROM public.item_batches WHERE id = batch_rec.id;
                    ELSE
                        UPDATE public.item_batches
                        SET quantity = quantity - v_remaining
                        WHERE id = batch_rec.id;
                        v_remaining := 0;
                    END IF;
                END LOOP;
            END;
        END IF;
    ELSIF p_change > 0 THEN
        -- เพิ่มจำนวน: สร้าง Batch ใหม่หรือเพิ่มใน Batch ที่ระบุ
        IF p_batch_id IS NOT NULL THEN
            UPDATE public.item_batches
            SET quantity = quantity + p_change
            WHERE id = p_batch_id AND item_id = p_item_id;
        ELSE
            -- เพิ่มใน Batch ที่ไม่มีวันหมดอายุ (ถ้ามี) หรือสร้างใหม่
            SELECT ib.id INTO v_target_batch_id
            FROM public.item_batches ib
            WHERE ib.item_id = p_item_id AND ib.expiry_date IS NULL
            LIMIT 1
            FOR UPDATE;

            IF v_target_batch_id IS NOT NULL THEN
                UPDATE public.item_batches
                SET quantity = quantity + p_change
                WHERE id = v_target_batch_id;
            ELSE
                INSERT INTO public.item_batches (item_id, quantity, added_by)
                VALUES (p_item_id, p_change, p_user_id);
            END IF;
        END IF;
    END IF;

    -- 4. กำหนดสถานะ
    v_new_status := CASE
        WHEN v_new_qty = 0 THEN 'out_of_stock'
        WHEN v_new_qty <= 1 THEN 'low_stock'
        ELSE 'in_stock'
    END;

    -- 5. อัปเดต Item
    UPDATE public.items
    SET quantity = v_new_qty,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = p_item_id;

    -- 6. บันทึก Activity Log
    INSERT INTO public.activity_logs (household_id, fridge_id, item_id, user_id, action, details)
    VALUES (
        v_household_id,
        v_fridge_id,
        p_item_id,
        p_user_id,
        CASE WHEN p_change > 0 THEN 'quantity_increased' ELSE 'quantity_decreased' END,
        jsonb_build_object(
            'item_name', v_item_name,
            'change', p_change,
            'previous_quantity', v_current_qty,
            'new_quantity', v_new_qty
        )
    );

    -- 7. คืนค่า
    new_quantity := v_new_qty;
    new_status := v_new_status;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4.2 Sync items.quantity จาก SUM ของ batches (Trigger)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_item_quantity_from_batches()
RETURNS TRIGGER AS $$
DECLARE
    v_total NUMERIC;
    v_new_status TEXT;
    v_item_id_to_sync UUID;
BEGIN
    -- กำหนด item_id ที่ต้อง sync
    IF TG_OP = 'DELETE' THEN
        v_item_id_to_sync := OLD.item_id;
    ELSE
        v_item_id_to_sync := NEW.item_id;
    END IF;

    -- คำนวณ Total จาก Batches
    SELECT COALESCE(SUM(ib.quantity), 0)
    INTO v_total
    FROM public.item_batches ib
    WHERE ib.item_id = v_item_id_to_sync;

    -- กำหนดสถานะ
    v_new_status := CASE
        WHEN v_total = 0 THEN 'out_of_stock'
        WHEN v_total <= 1 THEN 'low_stock'
        ELSE 'in_stock'
    END;

    -- อัปเดต Item
    UPDATE public.items
    SET quantity = v_total,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_item_id_to_sync;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: เมื่อ Batch เปลี่ยนแปลง → Sync quantity กลับไปที่ Item
-- หมายเหตุ: ปิด Trigger นี้ไว้เพื่อไม่ให้ conflict กับ update_item_quantity function
-- เปิดใช้เฉพาะเมื่อต้องการ sync จาก direct batch manipulation เท่านั้น
-- CREATE TRIGGER trg_sync_item_qty
--     AFTER INSERT OR UPDATE OR DELETE ON public.item_batches
--     FOR EACH ROW
--     EXECUTE FUNCTION public.sync_item_quantity_from_batches();

-- ------------------------------------------------------------
-- 4.3 Auto-create user profile on signup
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: เมื่อสมัครสมาชิก → สร้าง Profile อัตโนมัติ
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 4.4 Updated_at auto-update
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_households_updated_at
    BEFORE UPDATE ON public.households
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_fridges_updated_at
    BEFORE UPDATE ON public.fridges
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_items_updated_at
    BEFORE UPDATE ON public.items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ============================================================
-- Helper function: ตรวจสอบว่า User เป็นสมาชิกของ Household หรือไม่
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_household_member(p_household_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = p_household_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_household_owner(p_household_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = p_household_id
            AND user_id = auth.uid()
            AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 5.1 users RLS
-- ------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own"
    ON public.users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "users_select_household_members"
    ON public.users FOR SELECT
    USING (
        id IN (
            SELECT hm2.user_id FROM public.household_members hm1
            JOIN public.household_members hm2 ON hm1.household_id = hm2.household_id
            WHERE hm1.user_id = auth.uid()
        )
    );

CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "users_insert_own"
    ON public.users FOR INSERT
    WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------
-- 5.2 households RLS
-- ------------------------------------------------------------
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "households_select_member"
    ON public.households FOR SELECT
    USING (public.is_household_member(id) OR created_by = auth.uid());

CREATE POLICY "households_insert"
    ON public.households FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "households_update_owner"
    ON public.households FOR UPDATE
    USING (public.is_household_owner(id));

CREATE POLICY "households_delete_owner"
    ON public.households FOR DELETE
    USING (public.is_household_owner(id));

-- ------------------------------------------------------------
-- 5.3 household_members RLS
-- ------------------------------------------------------------
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hm_select_member"
    ON public.household_members FOR SELECT
    USING (public.is_household_member(household_id));

CREATE POLICY "hm_insert_owner"
    ON public.household_members FOR INSERT
    WITH CHECK (
        public.is_household_owner(household_id)
        OR user_id = auth.uid()  -- ตัวเองเข้าร่วมผ่าน invite
    );

CREATE POLICY "hm_delete_owner_or_self"
    ON public.household_members FOR DELETE
    USING (
        public.is_household_owner(household_id)
        OR user_id = auth.uid()  -- ออกจากครัวเรือนด้วยตัวเอง
    );

-- ------------------------------------------------------------
-- 5.4 invitations RLS
-- ------------------------------------------------------------
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select_member"
    ON public.invitations FOR SELECT
    USING (public.is_household_member(household_id));

CREATE POLICY "inv_insert_owner"
    ON public.invitations FOR INSERT
    WITH CHECK (public.is_household_owner(household_id));

-- ทุกคนสามารถอ่าน invite_code เพื่อ join ได้ (ผ่าน function แทน direct query)

-- ------------------------------------------------------------
-- 5.5 fridges RLS
-- ------------------------------------------------------------
ALTER TABLE public.fridges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fridges_select_member"
    ON public.fridges FOR SELECT
    USING (public.is_household_member(household_id));

CREATE POLICY "fridges_insert_member"
    ON public.fridges FOR INSERT
    WITH CHECK (public.is_household_member(household_id));

CREATE POLICY "fridges_update_member"
    ON public.fridges FOR UPDATE
    USING (public.is_household_member(household_id));

CREATE POLICY "fridges_delete_owner"
    ON public.fridges FOR DELETE
    USING (public.is_household_owner(household_id));

-- ------------------------------------------------------------
-- 5.6 categories RLS
-- ------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select"
    ON public.categories FOR SELECT
    USING (
        is_default = TRUE
        OR (household_id IS NOT NULL AND public.is_household_member(household_id))
    );

CREATE POLICY "categories_insert_member"
    ON public.categories FOR INSERT
    WITH CHECK (
        household_id IS NOT NULL AND public.is_household_member(household_id)
    );

-- ------------------------------------------------------------
-- 5.7 items RLS
-- ------------------------------------------------------------
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_select_member"
    ON public.items FOR SELECT
    USING (public.is_household_member(household_id));

CREATE POLICY "items_insert_member"
    ON public.items FOR INSERT
    WITH CHECK (public.is_household_member(household_id));

CREATE POLICY "items_update_member"
    ON public.items FOR UPDATE
    USING (public.is_household_member(household_id));

CREATE POLICY "items_delete_owner_or_creator"
    ON public.items FOR DELETE
    USING (
        public.is_household_owner(household_id)
        OR added_by = auth.uid()
    );

-- ------------------------------------------------------------
-- 5.8 item_batches RLS
-- ------------------------------------------------------------
ALTER TABLE public.item_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches_select_member"
    ON public.item_batches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.items i
            WHERE i.id = item_id AND public.is_household_member(i.household_id)
        )
    );

CREATE POLICY "batches_insert_member"
    ON public.item_batches FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.items i
            WHERE i.id = item_id AND public.is_household_member(i.household_id)
        )
    );

CREATE POLICY "batches_update_member"
    ON public.item_batches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.items i
            WHERE i.id = item_id AND public.is_household_member(i.household_id)
        )
    );

CREATE POLICY "batches_delete_member"
    ON public.item_batches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.items i
            WHERE i.id = item_id AND public.is_household_member(i.household_id)
        )
    );

-- ------------------------------------------------------------
-- 5.9 activity_logs RLS
-- ------------------------------------------------------------
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_select_member"
    ON public.activity_logs FOR SELECT
    USING (public.is_household_member(household_id));

-- Insert ผ่าน SECURITY DEFINER functions เท่านั้น (ไม่ให้ Client insert ตรง)
CREATE POLICY "activity_insert_via_function"
    ON public.activity_logs FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5.10 receipts RLS (Phase 2)
-- ------------------------------------------------------------
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_select_member"
    ON public.receipts FOR SELECT
    USING (public.is_household_member(household_id));

CREATE POLICY "receipts_insert_member"
    ON public.receipts FOR INSERT
    WITH CHECK (public.is_household_member(household_id));

ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipt_items_select"
    ON public.receipt_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts r
            WHERE r.id = receipt_id AND public.is_household_member(r.household_id)
        )
    );


-- ============================================================
-- 6. UTILITY FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- 6.1 เข้าร่วมครัวเรือนด้วย Invite Code
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_household_by_invite(p_invite_code TEXT)
RETURNS UUID AS $$
DECLARE
    v_invitation RECORD;
    v_user_id UUID := auth.uid();
    v_already_member BOOLEAN;
BEGIN
    -- 1. ค้นหา Invite Code ที่ยังใช้ได้
    SELECT * INTO v_invitation
    FROM public.invitations
    WHERE invite_code = p_invite_code
        AND is_active = TRUE
        AND expires_at > NOW()
        AND use_count < max_uses
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'รหัสเชิญไม่ถูกต้อง หมดอายุ หรือถูกใช้งานแล้ว';
    END IF;

    -- 2. ตรวจว่าเป็นสมาชิกอยู่แล้วหรือไม่
    SELECT EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = v_invitation.household_id AND user_id = v_user_id
    ) INTO v_already_member;

    IF v_already_member THEN
        RAISE EXCEPTION 'คุณเป็นสมาชิกของครัวเรือนนี้อยู่แล้ว';
    END IF;

    -- 3. เพิ่มสมาชิก
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (v_invitation.household_id, v_user_id, 'member');

    -- 4. อัปเดต use_count
    UPDATE public.invitations
    SET use_count = use_count + 1,
        is_active = CASE WHEN use_count + 1 >= max_uses THEN FALSE ELSE TRUE END
    WHERE id = v_invitation.id;

    -- 5. บันทึก Log
    INSERT INTO public.activity_logs (household_id, user_id, action, details)
    VALUES (
        v_invitation.household_id,
        v_user_id,
        'member_joined',
        jsonb_build_object('invite_code', p_invite_code)
    );

    RETURN v_invitation.household_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 6.2 สร้าง Invite Code
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invite_code(
    p_household_id UUID,
    p_max_uses INT DEFAULT 1,
    p_expires_hours INT DEFAULT 24
)
RETURNS TEXT AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    -- ตรวจสอบว่าเป็น Owner
    IF NOT public.is_household_owner(p_household_id) THEN
        RAISE EXCEPTION 'เฉพาะเจ้าของครัวเรือนเท่านั้นที่สามารถสร้างรหัสเชิญได้';
    END IF;

    -- สร้าง Code 6 ตัว (ตัวอักษรพิมพ์ใหญ่ + ตัวเลข)
    LOOP
        v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        SELECT EXISTS (SELECT 1 FROM public.invitations WHERE invite_code = v_code) INTO v_exists;
        EXIT WHEN NOT v_exists;
    END LOOP;

    INSERT INTO public.invitations (household_id, invite_code, created_by, expires_at, max_uses)
    VALUES (p_household_id, v_code, auth.uid(), NOW() + (p_expires_hours || ' hours')::INTERVAL, p_max_uses);

    RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
