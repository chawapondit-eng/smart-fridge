'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  User,
  Crown,
  Check,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import type { MemberRole, MemberPermissions } from '@/types/database';
import {
  ROLE_DEFINITIONS,
  PERMISSION_DEFINITIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveMemberPermissions,
  updateHouseholdMemberPermissions,
} from '@/lib/permissions';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export interface MemberDetailForPermissions {
  id: string;
  user_id: string;
  role: MemberRole;
  permissions?: MemberPermissions;
  users?: {
    id: string;
    email?: string;
    display_name?: string;
    avatar_url?: string | null;
  } | null;
}

interface MemberPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberDetailForPermissions | null;
  householdId: string;
  householdName?: string;
  isCurrentUserOwner: boolean;
  operatorName?: string;
  onSuccess: (updatedRole: MemberRole, updatedPermissions: MemberPermissions) => void;
}

export function MemberPermissionsModal({
  isOpen,
  onClose,
  member,
  householdId,
  isCurrentUserOwner,
  operatorName = 'เจ้าของบ้าน',
  onSuccess,
}: MemberPermissionsModalProps) {
  const supabase = createClient();

  const [selectedRole, setSelectedRole] = useState<MemberRole>('member');
  const [permissions, setPermissions] = useState<MemberPermissions>({
    ...DEFAULT_ROLE_PERMISSIONS.member,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member && isOpen) {
      const resolved = resolveMemberPermissions(
        member.role,
        member.permissions,
        householdId,
        member.user_id
      );
      setSelectedRole(resolved.role);
      setPermissions(resolved.permissions);
    }
  }, [member, isOpen, householdId]);

  if (!isOpen || !member) return null;

  const memberName =
    member.users?.display_name || member.users?.email?.split('@')[0] || 'สมาชิก';
  const memberEmail = member.users?.email || '';

  // เมื่อผู้ใช้เปลี่ยนระดับสิทธิ์
  function handleRoleChange(newRole: MemberRole) {
    setSelectedRole(newRole);
    if (newRole === 'owner') {
      setPermissions({ ...DEFAULT_ROLE_PERMISSIONS.owner });
    } else if (newRole === 'admin') {
      setPermissions({ ...DEFAULT_ROLE_PERMISSIONS.admin });
    } else {
      setPermissions((prev) => ({
        ...DEFAULT_ROLE_PERMISSIONS.member,
        can_add_items: prev.can_add_items,
        can_edit_items: prev.can_edit_items,
        can_delete_items: prev.can_delete_items,
      }));
    }
  }

  // เมื่อกดเปิด/ปิดสิทธิ์แต่ละรายการ
  function togglePermission(key: keyof MemberPermissions) {
    if (selectedRole === 'owner') return; // Owner ปิดไม่ได้
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  async function handleSave() {
    if (!isCurrentUserOwner) {
      toast.error('เฉพาะเจ้าของบ้านเท่านั้นที่สามารถเปลี่ยนสิทธิ์ได้');
      return;
    }

    setSaving(true);
    try {
      const res = await updateHouseholdMemberPermissions(
        supabase,
        householdId,
        member!.user_id,
        selectedRole,
        permissions,
        operatorName
      );

      if (!res.success) {
        throw new Error(res.error || 'ไม่สามารถบันทึกสิทธิ์ได้');
      }

      toast.success(`อัปเดตสิทธิ์ของ "${memberName}" สำเร็จ!`);
      onSuccess(selectedRole, permissions);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 id="perm-modal-title" className="font-heading font-bold text-base sm:text-lg text-foreground">
                กำหนดสิทธิ์การใช้งาน
              </h2>
              <p className="text-xs text-muted">
                จัดการบทบาทและสิทธิ์ของสมาชิกในครัวเรือน
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full text-muted hover:text-foreground hover:bg-surface-container flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto no-scrollbar py-4 space-y-5 flex-1 pr-1">
          {/* Member Profile Snapshot Card */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low border border-border/70 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary-500/15 text-primary-600 font-bold text-base flex items-center justify-center shrink-0 overflow-hidden shadow-2xs border border-primary-500/20">
              {member.users?.avatar_url?.startsWith('data:') || member.users?.avatar_url?.startsWith('http') ? (
                <img src={member.users.avatar_url} alt={memberName} className="w-full h-full object-cover" />
              ) : member.users?.avatar_url ? (
                <span className="text-xl">{member.users.avatar_url}</span>
              ) : (
                memberName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-sm text-foreground truncate">
                  {memberName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-surface-container border border-border text-muted">
                  {ROLE_DEFINITIONS.find((r) => r.role === member.role)?.badge || 'สมาชิก'}
                </span>
              </div>
              <span className="text-xs text-muted block truncate mt-0.5">
                {memberEmail}
              </span>
            </div>
          </div>

          {/* 1. เลือกระดับสิทธิ์หลัก (Role Selection) */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-foreground block">
              1. เลือกระดับสิทธิ์หลัก
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {ROLE_DEFINITIONS.map((r) => {
                const isSelected = selectedRole === r.role;
                return (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => handleRoleChange(r.role)}
                    className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? `${r.colorClass} border-2 shadow-xs`
                        : 'border-border bg-surface-container-lowest hover:bg-surface-container-low text-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-xl shrink-0 mt-0.5">{r.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-xs sm:text-sm text-foreground">
                            {r.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                          {r.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                        isSelected
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-muted/50 bg-surface-container'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. กำหนดสิทธิ์แบบละเอียด (Granular Toggles) */}
          <div className="space-y-3 pt-2 border-t border-border/70">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-foreground block">
                  2. กำหนดสิทธิ์การใช้งานของสมาชิก
                </label>
                <p className="text-[11px] text-muted">
                  เปิด/ปิดสิทธิ์แต่ละรายการได้อย่างอิสระ
                </p>
              </div>
              {selectedRole === 'owner' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25">
                  <Lock className="w-3 h-3" />
                  <span>สิทธิ์ทั้งหมด</span>
                </span>
              )}
            </div>

            <div className="space-y-2">
              {PERMISSION_DEFINITIONS.map((perm) => {
                const isEnabled = permissions[perm.id];
                const isLocked = selectedRole === 'owner';

                return (
                  <div
                    key={perm.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isEnabled
                        ? 'bg-surface-container-lowest border-border'
                        : 'bg-surface-container-low/50 border-border/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{perm.icon}</span>
                      <div className="min-w-0">
                        <span className="font-heading font-bold text-xs sm:text-sm text-foreground block truncate">
                          {perm.title}
                        </span>
                        <p className="text-[11px] text-muted truncate">
                          {perm.description}
                        </p>
                      </div>
                    </div>

                    {/* Modern iOS-Style Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      disabled={isLocked}
                      onClick={() => togglePermission(perm.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        isLocked ? 'cursor-not-allowed opacity-75' : ''
                      } ${isEnabled ? 'bg-primary-600' : 'bg-surface-container-high'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              สิทธิ์ที่ตั้งค่าจะมีผลทันทีต่อการเพิ่ม แก้ไข ลบ วัตถุดิบในตู้เย็นของสมาชิกคนนี้บนทุกอุปกรณ์
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-surface-container transition active:scale-95 cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition active:scale-95 shadow-sm shadow-primary-600/30 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>บันทึกการเปลี่ยนแปลง</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
