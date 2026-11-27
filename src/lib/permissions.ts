import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberRole, MemberPermissions } from '../types/database';

export const DEFAULT_ROLE_PERMISSIONS: Record<MemberRole, MemberPermissions> = {
  owner: {
    can_view_items: true,
    can_add_items: true,
    can_edit_items: true,
    can_delete_items: true,
    can_manage_members: true,
  },
  admin: {
    can_view_items: true,
    can_add_items: true,
    can_edit_items: true,
    can_delete_items: true,
    can_manage_members: false,
  },
  member: {
    can_view_items: true,
    can_add_items: false,
    can_edit_items: false,
    can_delete_items: false,
    can_manage_members: false,
  },
};

export interface PermissionDefinition {
  id: keyof MemberPermissions;
  title: string;
  description: string;
  icon: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    id: 'can_view_items',
    title: 'ดูข้อมูลตู้เย็น',
    description: 'ดูรายการวัตถุดิบ วันหมดอายุ และสต็อกทั้งหมดในตู้เย็น',
    icon: '👁️',
  },
  {
    id: 'can_add_items',
    title: 'เพิ่มวัตถุดิบ',
    description: 'เพิ่มของเข้าตู้เย็น และบันทึกจากการสแกนใบเสร็จ OCR',
    icon: '➕',
  },
  {
    id: 'can_edit_items',
    title: 'แก้ไขวัตถุดิบ',
    description: 'ปรับเปลี่ยนชื่อ จำนวน วันหมดอายุ หรือย้ายตำแหน่งตู้เย็น',
    icon: '✏️',
  },
  {
    id: 'can_delete_items',
    title: 'ลบวัตถุดิบ',
    description: 'ลบรายการของ หรือนำของที่หมดอายุออกจากตู้เย็น',
    icon: '🗑️',
  },
  {
    id: 'can_manage_members',
    title: 'จัดการสมาชิก',
    description: 'เชิญสมาชิกใหม่เข้าร่วมบ้าน และช่วยจัดการสมาชิกทั่วไป',
    icon: '👥',
  },
];

export interface RoleDefinition {
  role: MemberRole;
  title: string;
  badge: string;
  description: string;
  icon: string;
  colorClass: string;
  badgeClass: string;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'owner',
    title: 'เจ้าของบ้าน (Owner)',
    badge: 'เจ้าของบ้าน',
    description: 'สิทธิ์สูงสุด ควบคุมการจัดการสมาชิก ตู้เย็น และการตั้งค่าทั้งหมดภายในบ้าน',
    icon: '👑',
    colorClass: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  },
  {
    role: 'admin',
    title: 'ผู้ดูแลบ้าน (Admin)',
    badge: 'ผู้ดูแลบ้าน',
    description: 'ดู เพิ่ม แก้ไข และลบวัตถุดิบได้เต็มที่ แต่ไม่สามารถเปลี่ยนหรือลบเจ้าของบ้านได้',
    icon: '🛡️',
    colorClass: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  },
  {
    role: 'member',
    title: 'สมาชิกทั่วไป (Member)',
    badge: 'สมาชิกทั่วไป',
    description: 'สามารถดูข้อมูลในตู้เย็นได้ และเพิ่ม/แก้ไข/ลบวัตถุดิบตามที่เจ้าของบ้านกำหนด',
    icon: '👥',
    colorClass: 'border-stone-400 bg-stone-100 dark:bg-stone-900/40 text-stone-700 dark:text-stone-300',
    badgeClass: 'bg-surface-container text-muted border border-border',
  },
];

const LOCAL_STORAGE_PERMISSIONS_PREFIX = 'smart_fridge_member_perms_';

/**
 * ดึงสิทธิ์ที่ถูกแคชไว้ใน LocalStorage ต่อครัวเรือนและสมาชิก
 */
export function getLocalMemberPermissions(
  householdId: string,
  userId: string
): { role: MemberRole; permissions: MemberPermissions } | null {
  if (typeof localStorage === 'undefined' || !householdId || !userId) return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PERMISSIONS_PREFIX}${householdId}_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * บันทึกสิทธิ์ลงใน LocalStorage สำหรับการแคชและตอบสนองแบบเรียลไทม์
 */
export function saveLocalMemberPermissions(
  householdId: string,
  userId: string,
  role: MemberRole,
  permissions: MemberPermissions
): void {
  if (typeof localStorage === 'undefined' || !householdId || !userId) return;
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_PERMISSIONS_PREFIX}${householdId}_${userId}`,
      JSON.stringify({ role, permissions, updated_at: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

/**
 * คำนวณและประมวลผลสิทธิ์ที่แท้จริงของสมาชิก
 * - เจ้าของบ้าน (owner): สิทธิ์เป็น true ทุกรายการเสมอ
 * - ผู้ดูแล (admin): สิทธิ์จัดการวัตถุดิบเป็น true
 * - สมาชิกทั่วไป (member): สิทธิ์ตามที่ได้รับอนุญาตจริง
 */
export function resolveMemberPermissions(
  rawRole?: string | null,
  rawPermissions?: Partial<MemberPermissions> | null,
  householdId?: string,
  userId?: string
): { role: MemberRole; permissions: MemberPermissions } {
  let role: MemberRole = 'member';
  if (rawRole === 'owner') role = 'owner';
  else if (rawRole === 'admin') role = 'admin';

  // รองรับกรณีฐานข้อมูลเดิมเก็บ effective_role ไว้ใน permissions JSON
  const effectiveRole = (rawPermissions as { effective_role?: string } | null | undefined)?.effective_role;
  if (role !== 'owner') {
    if (effectiveRole === 'admin') role = 'admin';
    else if (effectiveRole === 'member') role = 'member';
  }

  // ตรวจสอบจาก LocalStorage เฉพาะเมื่อไม่มี permissions จากฐานข้อมูลหรือซิงค์บนเซิร์ฟเวอร์
  if (householdId && userId && !rawPermissions) {
    const cached = getLocalMemberPermissions(householdId, userId);
    if (cached) {
      if (rawRole !== 'owner') {
        role = cached.role || role;
      }
      rawPermissions = cached.permissions;
    }
  }

  // หากเป็น owner จะได้สิทธิ์ทุกอย่าง 100%
  if (role === 'owner') {
    return {
      role: 'owner',
      permissions: { ...DEFAULT_ROLE_PERMISSIONS.owner },
    };
  }

  const base = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.member;
  const merged: MemberPermissions = {
    can_view_items: rawPermissions?.can_view_items !== undefined ? Boolean(rawPermissions.can_view_items) : base.can_view_items,
    can_add_items: rawPermissions?.can_add_items !== undefined ? Boolean(rawPermissions.can_add_items) : base.can_add_items,
    can_edit_items: rawPermissions?.can_edit_items !== undefined ? Boolean(rawPermissions.can_edit_items) : base.can_edit_items,
    can_delete_items: rawPermissions?.can_delete_items !== undefined ? Boolean(rawPermissions.can_delete_items) : base.can_delete_items,
    can_manage_members: rawPermissions?.can_manage_members !== undefined ? Boolean(rawPermissions.can_manage_members) : base.can_manage_members,
  };

  // แอดมินต้องมีสิทธิ์จัดการวัตถุดิบพื้นฐานเป็น true
  if (role === 'admin') {
    merged.can_view_items = true;
    merged.can_add_items = true;
    merged.can_edit_items = true;
    merged.can_delete_items = true;
  }

  return { role, permissions: merged };
}

export interface SyncedMemberPermissionEntry {
  role: MemberRole;
  permissions: MemberPermissions;
}

function isMissingColumnError(
  error: { code?: string; message?: string; details?: string } | null | undefined,
  columnName: string
): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  const col = columnName.toLowerCase();
  return (
    msg.includes(`'${col}'`) ||
    msg.includes(`"${col}"`) ||
    (msg.includes(col) && (msg.includes('schema cache') || msg.includes('does not exist')))
  );
}

function isRoleConstraintError(
  error: { code?: string; message?: string; details?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '23514') return true;
  const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return msg.includes('check constraint') || msg.includes('household_members_role_check');
}

/**
 * ดึงข้อมูลสิทธิ์สมาชิกล่าสุดที่ซิงค์ผ่าน activity_logs
 * ใช้เป็นแหล่งข้อมูลกลางข้ามอุปกรณ์เมื่อตาราง household_members ยังไม่มีคอลัมน์ permissions
 */
export async function fetchSyncedMemberPermissionsMap(
  supabase: SupabaseClient,
  householdIds: string[]
): Promise<Map<string, SyncedMemberPermissionEntry>> {
  const result = new Map<string, SyncedMemberPermissionEntry>();
  if (!householdIds.length) return result;

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('household_id, details, created_at')
      .in('household_id', householdIds)
      .eq('action', 'item_updated')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) return result;

    for (const row of data as Array<{
      household_id?: string;
      details?: {
        target_user_id?: string;
        new_role?: MemberRole;
        permissions?: Partial<MemberPermissions>;
      } | null;
    }>) {
      const hhId = row.household_id;
      const targetUserId = row.details?.target_user_id;
      const rawPerms = row.details?.permissions;
      if (!hhId || !targetUserId || !rawPerms) continue;

      const key = `${hhId}:${targetUserId}`;
      if (result.has(key)) continue;

      const rawRole: MemberRole =
        row.details?.new_role === 'owner'
          ? 'owner'
          : row.details?.new_role === 'admin'
            ? 'admin'
            : 'member';
      const base = DEFAULT_ROLE_PERMISSIONS[rawRole];

      result.set(key, {
        role: rawRole,
        permissions: {
          can_view_items:
            rawPerms.can_view_items !== undefined ? Boolean(rawPerms.can_view_items) : base.can_view_items,
          can_add_items:
            rawPerms.can_add_items !== undefined ? Boolean(rawPerms.can_add_items) : base.can_add_items,
          can_edit_items:
            rawPerms.can_edit_items !== undefined ? Boolean(rawPerms.can_edit_items) : base.can_edit_items,
          can_delete_items:
            rawPerms.can_delete_items !== undefined ? Boolean(rawPerms.can_delete_items) : base.can_delete_items,
          can_manage_members:
            rawPerms.can_manage_members !== undefined
              ? Boolean(rawPerms.can_manage_members)
              : base.can_manage_members,
        },
      });
    }
  } catch {
    // ignore sync query errors and rely on household_members / localStorage
  }

  return result;
}

/**
 * บันทึกการเปลี่ยนแปลงสิทธิ์สมาชิกไปยัง Supabase ฐานข้อมูลจริง
 */
export async function updateHouseholdMemberPermissions(
  supabase: SupabaseClient,
  householdId: string,
  targetUserId: string,
  newRole: MemberRole,
  newPermissions: MemberPermissions,
  operatorName = 'เจ้าของบ้าน'
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!householdId || !targetUserId) {
      return { success: false, error: 'ข้อมูลครัวเรือนหรือผู้ใช้ไม่ถูกต้อง' };
    }

    // เจ้าของบ้านต้องมีสิทธิ์ทั้งหมดเสมอ
    const finalPermissions: MemberPermissions =
      newRole === 'owner' ? { ...DEFAULT_ROLE_PERMISSIONS.owner } : { ...newPermissions };

    // 1. ลองอัปเดตแบบเต็ม (role + permissions) ใน public.household_members
    let { error } = await supabase
      .from('household_members')
      .update({
        role: newRole,
        permissions: finalPermissions,
      })
      .eq('household_id', householdId)
      .eq('user_id', targetUserId);

    // หากฐานข้อมูลเดิมติด CHECK constraint (role IN ('owner', 'member'))
    // ให้บันทึก role เป็น 'member' ในตารางแต่เก็บสิทธิ์และ effective_role ใน permissions JSON
    if (isRoleConstraintError(error)) {
      const retry = await supabase
        .from('household_members')
        .update({
          role: newRole === 'admin' ? 'member' : newRole,
          permissions: { ...finalPermissions, effective_role: newRole },
        })
        .eq('household_id', householdId)
        .eq('user_id', targetUserId);
      error = retry.error;
    }

    // หาก PostgREST แจ้งว่ายังไม่มีคอลัมน์ 'permissions' ใน schema cache (PGRST204)
    // ให้อัปเดต role ใน household_members และจัดเก็บ permissions ผ่าน activity_logs + localStorage แทน
    if (isMissingColumnError(error, 'permissions')) {
      const roleOnly = await supabase
        .from('household_members')
        .update({ role: newRole })
        .eq('household_id', householdId)
        .eq('user_id', targetUserId);
      error = roleOnly.error;

      if (isRoleConstraintError(error)) {
        const legacyRole = await supabase
          .from('household_members')
          .update({ role: newRole === 'admin' ? 'member' : newRole })
          .eq('household_id', householdId)
          .eq('user_id', targetUserId);
        error = legacyRole.error;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    // 2. แคชผลลัพธ์ลง LocalStorage ให้ซิงค์ทันที
    saveLocalMemberPermissions(householdId, targetUserId, newRole, finalPermissions);

    // 3. บันทึกลง Activity Logs เพื่อซิงค์ข้ามอุปกรณ์และเก็บประวัติ
    try {
      await supabase.from('activity_logs').insert({
        household_id: householdId,
        action: 'item_updated',
        details: {
          user_name: operatorName,
          item_name: `สิทธิ์สมาชิก (${ROLE_DEFINITIONS.find((r) => r.role === newRole)?.badge || newRole})`,
          permission_sync: true,
          target_user_id: targetUserId,
          new_role: newRole,
          permissions: finalPermissions,
        },
      });
    } catch {
      // ignore log failure
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์',
    };
  }
}

/**
 * ฟังก์ชันตรวจสอบว่าผู้ใช้มีสิทธิ์ทำงานตาม Action ที่ระบุหรือไม่
 */
export function checkUserPermission(
  action: 'view' | 'add' | 'edit' | 'delete' | 'manage_members',
  role?: MemberRole,
  permissions?: MemberPermissions
): boolean {
  if (role === 'owner') return true;
  if (!permissions) {
    if (role === 'admin') return action !== 'manage_members';
    return action === 'view';
  }

  switch (action) {
    case 'view':
      return permissions.can_view_items;
    case 'add':
      return permissions.can_add_items;
    case 'edit':
      return permissions.can_edit_items;
    case 'delete':
      return permissions.can_delete_items;
    case 'manage_members':
      return permissions.can_manage_members;
    default:
      return false;
  }
}
