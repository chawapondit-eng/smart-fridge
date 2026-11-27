'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import toast from 'react-hot-toast';
import {
  Home,
  UserPlus,
  User,
  Copy,
  Check,
  Trash2,
  KeyRound,
  X,
  AlertCircle,
  ArrowRight,
  Crown,
  ShieldCheck,
  Sliders,
  Eye,
} from 'lucide-react';
import type { MemberRole, MemberPermissions } from '@/types/database';
import { MemberPermissionsModal } from '@/components/household/MemberPermissionsModal';
import { resolveMemberPermissions } from '@/lib/permissions';

interface MemberDetail {
  id: string;
  user_id: string;
  role: MemberRole;
  permissions?: MemberPermissions;
  joined_at: string;
  users: {
    id: string;
    email: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export default function HouseholdPage() {
  const supabase = createClient();
  const {
    currentHousehold,
    households,
    setCurrentHousehold,
    deleteHousehold,
    joinHousehold,
    authUser,
    user,
  } = useHousehold();

  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Join Modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);

  // Remove member modal
  const [removingMember, setRemovingMember] = useState<MemberDetail | null>(null);
  const [removing, setRemoving] = useState(false);

  // Edit Member Permissions Modal (Owner only)
  const [editingPermissionsMember, setEditingPermissionsMember] = useState<MemberDetail | null>(null);

  // Delete Household modal
  const [deletingHousehold, setDeletingHousehold] = useState<{ id: string; name: string } | null>(
    null
  );
  const [deletingHh, setDeletingHh] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!currentHousehold?.id) return;
    setLoading(true);
    try {
      // 1. ดึง household_members แบบปลอดภัยด้วย select('*')
      const { data: memberRows, error: mErr } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', currentHousehold.id);

      if (mErr) throw mErr;
      if (!memberRows || memberRows.length === 0) {
        setMembers([]);
        return;
      }

      // 2. ดึง user profiles
      const userIds = memberRows.map((m) => m.user_id);
      const { data: userProfiles } = await supabase
        .from('users')
        .select('id, email, display_name, avatar_url')
        .in('id', userIds);

      const userMap = new Map((userProfiles || []).map((u) => [u.id, u]));

      // ถ้า user ปัจจุบันยังไม่มีโปรไฟล์ในตาราง public.users ให้สร้างทันที
      if (authUser && !userMap.has(authUser.id)) {
        const selfProfile = {
          id: authUser.id,
          email: authUser.email || '',
          display_name: user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก',
          avatar_url: user?.avatar_url || null,
        };
        userMap.set(authUser.id, selfProfile);
        try {
          await supabase.from('users').upsert(selfProfile);
        } catch {
          // ignore
        }
      }

      const combined: MemberDetail[] = memberRows
        .sort((a, b) => {
          if (a.role === 'owner') return -1;
          if (b.role === 'owner') return 1;
          if (a.role === 'admin') return -1;
          if (b.role === 'admin') return 1;
          return 0;
        })
        .map((m, index) => {
          const profile = userMap.get(m.user_id);
          const isSelf = m.user_id === authUser?.id;
          const resolved = resolveMemberPermissions(
            m.role,
            m.permissions,
            currentHousehold.id,
            m.user_id
          );

          return {
            id: (m.id as string) || `${m.household_id}_${m.user_id}` || String(index),
            user_id: m.user_id,
            role: resolved.role,
            permissions: resolved.permissions,
            joined_at: (m.joined_at as string) || (m.created_at as string) || '',
            users: profile || {
              id: m.user_id,
              email: isSelf ? authUser?.email || '' : '',
              display_name: isSelf
                ? user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก'
                : 'สมาชิก',
              avatar_url: isSelf ? user?.avatar_url || null : null,
            },
          };
        });

      setMembers(combined);
    } catch (err) {
      console.error('Error fetching household members:', (err as { message?: string })?.message || err);
    } finally {
      setLoading(false);
    }
  }, [currentHousehold?.id, authUser, user, supabase]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Generate Invite Code
  async function generateInvite() {
    if (!currentHousehold?.id || !authUser?.id) return;
    setGeneratingCode(true);
    try {
      // 1. ตรวจสอบและสร้าง Profile ใน public.users เพื่อให้ Foreign Key ผ่าน 100%
      try {
        await supabase.from('users').upsert({
          id: authUser.id,
          email: authUser.email || '',
          display_name: user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก',
          avatar_url: user?.avatar_url || null,
        });
      } catch (uErr) {
        console.warn('Upsert user warning:', uErr);
      }

      // สร้าง Code สุ่ม 8 หลัก
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const code = `FRIDGE-${randomStr}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // มีอายุ 7 วัน

      const inviteId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      // 2. ลอง insert เข้า invitations พร้อม id
      const payload: Record<string, unknown> = {
        id: inviteId,
        household_id: currentHousehold.id,
        invite_code: code,
        created_by: authUser.id,
        expires_at: expiresAt.toISOString(),
        max_uses: 5,
        use_count: 0,
        is_active: true,
      };

      let res = await supabase.from('invitations').insert(payload);

      // ถ้าไม่สำเร็จ ลอง retry แบบ minimal
      if (res.error) {
        console.warn('First insert attempt error:', res.error);
        // ลองคง created_by ไว้แต่ตัดคอลัมน์เสริม
        let retry = await supabase.from('invitations').insert({
          id: inviteId,
          household_id: currentHousehold.id,
          invite_code: code,
          created_by: authUser.id,
          expires_at: expiresAt.toISOString(),
        });

        // ถ้ายังติด (เช่น created_by ไม่มีใน schema หรือติด foreign key) ลองตัด created_by
        if (retry.error) {
          retry = await supabase.from('invitations').insert({
            id: inviteId,
            household_id: currentHousehold.id,
            invite_code: code,
            expires_at: expiresAt.toISOString(),
          });
        }

        res = retry;
      }

      // 3. ถ้า invitations table ไม่มีใน Supabase หรือติด Permission RLS
      // ให้ใช้ Direct Household Code สำรอง เพื่อให้ใช้งานได้ทันที 100%
      if (res.error) {
        console.warn('Invitations insert failed, using Direct Household Code:', res.error);
        const directCode = `HH-${currentHousehold.id.replace(/-/g, '').substring(0, 8).toUpperCase()}`;
        setInviteCode(directCode);
        setShowInviteModal(true);
        toast.success('สร้างรหัสคำเชิญเข้าครัวเรือนสำเร็จ!');
        return;
      }

      setInviteCode(code);
      setShowInviteModal(true);
      toast.success('สร้างรหัสคำเชิญสำเร็จ!');
    } catch (err: unknown) {
      console.error('generateInvite catch:', err);
      // Fallback เผื่อไว้เสมอ ไม่ให้ผู้ใช้ติดบล็อก
      const directCode = `HH-${currentHousehold.id.replace(/-/g, '').substring(0, 8).toUpperCase()}`;
      setInviteCode(directCode);
      setShowInviteModal(true);
      toast.success('สร้างรหัสคำเชิญเข้าครัวเรือนสำเร็จ!');
    } finally {
      setGeneratingCode(false);
    }
  }

  function handleCopyInvite() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success('คัดลอกรหัสคำเชิญแล้ว');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = joinCodeInput.trim();
    if (!clean) return;
    setJoining(true);
    try {
      const ok = await joinHousehold(clean);
      if (ok) {
        setShowJoinModal(false);
        setJoinCodeInput('');
        fetchMembers();
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleRemoveMemberConfirm() {
    if (!removingMember || !currentHousehold?.id) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', currentHousehold.id)
        .eq('user_id', removingMember.user_id);

      if (error) throw error;

      toast.success('นำสมาชิกออกจากครัวเรือนแล้ว');
      setRemovingMember(null);
      fetchMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'นำสมาชิกออกไม่สำเร็จ';
      toast.error(msg);
    } finally {
      setRemoving(false);
    }
  }

  async function handleDeleteHouseholdConfirm() {
    if (!deletingHousehold) return;
    setDeletingHh(true);
    try {
      await deleteHousehold(deletingHousehold.id);
      setDeletingHousehold(null);
    } finally {
      setDeletingHh(false);
    }
  }

  const isOwner = currentHousehold?.role === 'owner';

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {/* Header */}
        <div className="ds-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading text-xl sm:text-2xl font-semibold text-foreground">
                {currentHousehold?.name || 'จัดการครัวเรือน'}
              </h1>
              <p className="text-xs text-muted mt-0.5">
                สมาชิกทั้งหมด {members.length} คน
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setJoinCodeInput('');
                setShowJoinModal(true);
              }}
              className="p-3 sm:px-4 rounded-xl bg-surface-container-low hover:bg-surface-container border border-border flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-2 transition active:scale-95 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-surface-container text-primary-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <span className="font-heading font-semibold text-xs sm:text-sm text-foreground block">
                  เข้าร่วมด้วยรหัส
                </span>
                <span className="text-[10px] text-muted hidden sm:block">
                  กรอกรหัสคำเชิญ
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={generateInvite}
              disabled={generatingCode}
              className="p-3 sm:px-4 rounded-xl bg-primary-100 hover:bg-primary-200/70 border border-primary-600/20 flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-2 transition active:scale-95 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <span className="font-heading font-semibold text-xs sm:text-sm text-primary-700 dark:text-primary-200 block">
                  เชิญสมาชิกเข้าบ้าน
                </span>
                <span className="text-[10px] text-muted hidden sm:block">
                  สร้างรหัสคำเชิญ
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Banner if user is in an accidentally generated HH- household */}
        {currentHousehold?.name.startsWith('HH-') && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  คุณกำลังอยู่ในครัวเรือน &quot;{currentHousehold.name}&quot; ซึ่งเป็นบ้านที่สร้างแยกไว้
                </p>
                <p className="text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  หากต้องการเข้าร่วมบ้านหลักเพื่อแชร์ตู้เย็นร่วมกับครอบครัว กรุณากดปุ่มด้านขวาเพื่อกรอกรหัสคำเชิญ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setJoinCodeInput(currentHousehold.name);
                setShowJoinModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl font-bold bg-amber-500 text-white hover:bg-amber-600 transition shrink-0 self-end sm:self-auto"
            >
              เข้าร่วมบ้านหลัก
            </button>
          </div>
        )}

        {/* Switch Household section if multiple */}
        {households.length > 1 && (
          <div className="ds-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                ครัวเรือนทั้งหมดของคุณ ({households.length} ครัวเรือน)
              </h2>
              <span className="text-xs text-muted">คลิกเพื่อสลับบ้าน</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {households.map((h) => {
                const isCurrent = h.id === currentHousehold?.id;
                return (
                  <div
                    key={h.id}
                    onClick={() => {
                      if (!isCurrent) {
                        setCurrentHousehold(h);
                        toast.success(`สลับไปยังบ้าน "${h.name}" แล้ว`);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition ${
                      isCurrent
                        ? 'border-primary-600 bg-primary-100/70'
                        : 'border-border bg-surface-container-low hover:bg-surface-container cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-card border border-border text-primary-600 flex items-center justify-center shrink-0">
                        <Home className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-heading text-sm font-semibold text-foreground block truncate">
                          {h.name}
                        </span>
                        <span className="text-[11px] text-muted">
                          {h.role === 'owner' ? 'เจ้าของ' : 'สมาชิก'}
                        </span>
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className="text-xs font-semibold text-primary-700 dark:text-primary-200 bg-card border border-primary-600/20 px-2.5 py-1 rounded-xl shrink-0">
                        ใช้งานอยู่ ✓
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentHousehold(h);
                            toast.success(`สลับไปยังบ้าน "${h.name}" แล้ว`);
                          }}
                          className="text-xs text-primary-700 dark:text-primary-200 hover:bg-primary-100 bg-card border border-border px-2.5 py-1.5 rounded-xl flex items-center gap-1 font-semibold transition cursor-pointer"
                        >
                          <span>สลับมาบ้านนี้</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {h.role === 'owner' && (
                          <button
                            type="button"
                            onClick={() => setDeletingHousehold({ id: h.id, name: h.name })}
                            className="p-1.5 rounded-xl text-muted hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                            title="ลบครัวเรือนที่ไม่ใช้งานนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Member List Section */}
        <div className="ds-card p-5 sm:p-6 space-y-4">
          <h2 className="font-heading text-base font-semibold text-foreground">
            รายชื่อสมาชิกในครอบครัว
          </h2>

          {loading ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => {
                const isSelf = m.user_id === authUser?.id;
                const name = m.users?.display_name || m.users?.email?.split('@')[0] || 'สมาชิก';

                return (
                  <div
                    key={m.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-bold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden shadow-xs">
                        {m.users?.avatar_url?.startsWith('data:image') || m.users?.avatar_url?.startsWith('http') ? (
                          <img src={m.users.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : m.users?.avatar_url ? (
                          <span className="text-lg">{m.users.avatar_url}</span>
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {name}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/50 text-primary-600 font-medium">
                              คุณ
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted block truncate">
                          {m.users?.email}
                        </span>

                        {/* Summary of member permissions */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {m.role === 'owner' ? (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              👑 สิทธิ์สูงสุด ดูแลสมาชิกและจัดการตู้เย็นได้ทั้งหมด
                            </span>
                          ) : m.role === 'admin' ? (
                            <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                              🛡️ ผู้ดูแล • จัดการของในตู้เย็นได้ทั้งหมด
                            </span>
                          ) : (
                            <>
                              {m.permissions?.can_add_items ||
                              m.permissions?.can_edit_items ||
                              m.permissions?.can_delete_items ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-muted font-medium mr-0.5">สิทธิ์:</span>
                                  {m.permissions?.can_add_items && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                                      + เพิ่มของ
                                    </span>
                                  )}
                                  {m.permissions?.can_edit_items && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                                      ✏️ แก้ไข
                                    </span>
                                  )}
                                  {m.permissions?.can_delete_items && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20">
                                      🗑️ ลบ
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                                  <Eye className="w-3 h-3 text-muted" />
                                  <span>ดูข้อมูลอย่างเดียว</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Role Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          m.role === 'owner'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                            : m.role === 'admin'
                            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20'
                            : 'bg-muted/15 text-muted border border-border'
                        }`}
                      >
                        {m.role === 'owner' ? (
                          <>
                            <Crown className="w-3 h-3 text-amber-500" />
                            <span>เจ้าของ</span>
                          </>
                        ) : m.role === 'admin' ? (
                          <>
                            <ShieldCheck className="w-3 h-3 text-sky-500" />
                            <span>ผู้ดูแล</span>
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3" />
                            <span>สมาชิก</span>
                          </>
                        )}
                      </span>

                      {/* Manage Permissions Button (Owner only, cannot edit self) */}
                      {isOwner && !isSelf && (
                        <button
                          type="button"
                          onClick={() => setEditingPermissionsMember(m)}
                          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-primary-700 dark:text-primary-200 bg-primary-100 hover:bg-primary-200/70 border border-primary-600/20 transition active:scale-95 cursor-pointer"
                          title="กำหนดสิทธิ์การใช้งานของสมาชิกคนนี้"
                        >
                          <Sliders className="w-3.5 h-3.5 text-primary-600 dark:text-primary-300" />
                          <span className="hidden sm:inline">กำหนดสิทธิ์</span>
                        </button>
                      )}

                      {/* Remove Button (Owner only, cannot remove self) */}
                      {isOwner && !isSelf && (
                        <button
                          type="button"
                          onClick={() => setRemovingMember(m)}
                          className="p-1.5 rounded-xl text-muted hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                          title="นำออกจากครัวเรือน"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] relative animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              เชิญสมาชิกเข้าครัวเรือน 🎉
            </h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              ส่งรหัสคำเชิญนี้ให้สมาชิกในบ้าน เพื่อให้นำไปกรอกเข้าร่วมครัวเรือน &quot;{currentHousehold?.name}&quot;
            </p>

            <div className="my-5 p-4 rounded-2xl border border-dashed border-primary-600/40 bg-primary-100/60 text-center">
              <span className="text-xs text-muted block mb-1">รหัสคำเชิญของคุณ:</span>
              <div className="text-2xl font-bold font-mono tracking-widest text-primary-700 dark:text-primary-200">
                {inviteCode}
              </div>
              <span className="text-[11px] text-muted block mt-1">
                (ใช้ได้ 5 ครั้ง • หมดอายุใน 7 วัน)
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="ds-btn-primary flex-1 py-2.5 px-4 text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'คัดลอกสำเร็จ!' : 'คัดลอกรหัสคำเชิญ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Household Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] relative animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowJoinModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              เข้าร่วมครัวเรือนด้วยรหัสคำเชิญ 🔑
            </h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              กรอกรหัสคำเชิญที่ได้รับจากคนในบ้าน เพื่อเข้าร่วมบ้านเดียวกันและแชร์ตู้เย็นร่วมกัน
            </p>

            <form onSubmit={handleJoinSubmit} className="space-y-4 my-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                  รหัสคำเชิญ (Invite Code)
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="เช่น #TY-6C70F4 หรือ FRIDGE-XXXXXX"
                  required
                  autoFocus
                  className="ds-input w-full px-3.5 py-2.5 text-sm uppercase tracking-widest font-mono"
                />
                <p className="text-[11px] text-muted mt-1">
                  * สามารถกรอกรหัสขึ้นต้นด้วย #TY- หรือ HH- หรือ FRIDGE- หรือชื่อบ้านก็ได้
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={joining || !joinCodeInput.trim()}
                  className="ds-btn-primary px-5 py-2 text-xs disabled:opacity-50 cursor-pointer"
                >
                  {joining ? 'กำลังตรวจสอบ...' : 'เข้าร่วมครัวเรือน ➔'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Permissions Management Modal (Owner only) */}
      <MemberPermissionsModal
        isOpen={Boolean(editingPermissionsMember)}
        onClose={() => setEditingPermissionsMember(null)}
        member={editingPermissionsMember}
        householdId={currentHousehold?.id || ''}
        householdName={currentHousehold?.name}
        isCurrentUserOwner={isOwner}
        operatorName={user?.display_name || authUser?.email?.split('@')[0] || 'เจ้าของบ้าน'}
        onSuccess={(updatedRole, updatedPermissions) => {
          if (editingPermissionsMember) {
            setMembers((prev) =>
              prev.map((item) =>
                item.user_id === editingPermissionsMember.user_id
                  ? { ...item, role: updatedRole, permissions: updatedPermissions }
                  : item
              )
            );
          }
          fetchMembers();
        }}
      />

      {/* Remove Member Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(removingMember)}
        onClose={() => setRemovingMember(null)}
        onConfirm={handleRemoveMemberConfirm}
        title="ยืนยันการนำสมาชิกออก"
        description={`คุณแน่ใจหรือไม่ว่าต้องการนำสมาชิก "${removingMember?.users?.display_name}" ออกจากครัวเรือน?`}
        confirmLabel="นำสมาชิกออก"
        isDanger
        loading={removing}
      />

      {/* Delete Household Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingHousehold)}
        onClose={() => setDeletingHousehold(null)}
        onConfirm={handleDeleteHouseholdConfirm}
        title="ยืนยันการลบครัวเรือน"
        description={`คุณแน่ใจหรือไม่ว่าต้องการลบครัวเรือน "${deletingHousehold?.name}"? ข้อมูลตู้เย็นและสมาชิกในบ้านหลังนี้จะถูกลบทั้งหมด`}
        confirmLabel="ลบครัวเรือนนี้"
        isDanger
        loading={deletingHh}
      />
    </MainLayout>
  );
}

