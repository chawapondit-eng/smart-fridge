'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Household, Fridge, MemberRole, User as DbUser } from '@/types/database';
import toast from 'react-hot-toast';

interface HouseholdWithRole extends Household {
  role: MemberRole;
}

interface HouseholdContextType {
  user: DbUser | null;
  authUser: { id: string; email?: string } | null;
  households: HouseholdWithRole[];
  currentHousehold: HouseholdWithRole | null;
  fridges: Fridge[];
  loading: boolean;
  setCurrentHousehold: (h: HouseholdWithRole) => void;
  createHousehold: (name: string) => Promise<Household | null>;
  deleteHousehold: (id: string) => Promise<boolean>;
  joinHousehold: (inviteCode: string) => Promise<boolean>;
  refreshHouseholds: () => Promise<void>;
  refreshFridges: () => Promise<void>;
  createFridge: (name: string, icon?: string) => Promise<Fridge | null>;
  updateFridge: (id: string, name: string, icon?: string) => Promise<boolean>;
  deleteFridge: (id: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

function getErrorMessage(err: unknown): string {
  if (!err) return 'เกิดข้อผิดพลาด';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error_description === 'string') return obj.error_description;
    if (typeof obj.details === 'string') return obj.details;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

const CURRENT_HOUSEHOLD_KEY = 'smart-fridge-current-household';

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();

  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const [user, setUser] = useState<DbUser | null>(null);
  const [households, setHouseholds] = useState<HouseholdWithRole[]>([]);
  const [currentHousehold, setCurrentHouseholdState] = useState<HouseholdWithRole | null>(null);
  const [fridges, setFridges] = useState<Fridge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. ตรวจสอบ Auth State
  useEffect(() => {
    async function initAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email });
        // โหลดข้อมูล public.users
        let { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!profile) {
          const autoProfile = {
            id: session.user.id,
            email: session.user.email || '',
            display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'สมาชิก',
          };
          await supabase.from('users').upsert(autoProfile);
          profile = autoProfile as DbUser;
        }

        if (profile) {
          setUser(profile as DbUser);
        }
      } else {
        setAuthUser(null);
        setUser(null);
      }
      setLoading(false);
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email });
        let { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!profile) {
          const autoProfile = {
            id: session.user.id,
            email: session.user.email || '',
            display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'สมาชิก',
          };
          await supabase.from('users').upsert(autoProfile);
          profile = autoProfile as DbUser;
        }

        if (profile) {
          setUser(profile as DbUser);
        }
      } else {
        setAuthUser(null);
        setUser(null);
        setHouseholds([]);
        setCurrentHouseholdState(null);
        setFridges([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // รีเฟรชข้อมูลโปรไฟล์ User
  const refreshUser = useCallback(async () => {
    if (!authUser?.id) return;
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
      if (profile) {
        setUser(profile as DbUser);
      }
    } catch (e) {
      console.warn('refreshUser failed:', e);
    }
  }, [authUser?.id, supabase]);

  // 2. ดึงรายการครัวเรือนที่ User สังกัด
  const fetchHouseholds = useCallback(async () => {
    if (!authUser?.id) return;

    try {
      // 1. ดึง household_members ของ user
      const { data: memberRows, error: mError } = await supabase
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', authUser.id);

      if (mError) {
        console.error('Error fetching household members:', getErrorMessage(mError));
        return;
      }

      if (!memberRows || memberRows.length === 0) {
        setHouseholds([]);
        setCurrentHouseholdState(null);
        setFridges([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(CURRENT_HOUSEHOLD_KEY);
        }
        return;
      }

      const householdIds = memberRows.map((m) => m.household_id);

      // 2. ดึงข้อมูล households ตาม IDs
      const { data: hData, error: hError } = await supabase
        .from('households')
        .select('*')
        .in('id', householdIds);

      if (hError) {
        console.error('Error fetching households by ids:', getErrorMessage(hError));
        return;
      }

      if (hData) {
        const roleMap = new Map(memberRows.map((m) => [m.household_id, m.role as MemberRole]));

        const list: HouseholdWithRole[] = hData.map((h) => ({
          ...h,
          role: roleMap.get(h.id) || 'member',
        }));

        setHouseholds(list);

        // เลือก Household ปัจจุบัน (ตรวจสอบว่ายังอยู่ใน list หรือไม่)
        const savedId =
          typeof window !== 'undefined' ? localStorage.getItem(CURRENT_HOUSEHOLD_KEY) : null;
        const matched = list.find((h) => h.id === savedId) || list[0] || null;

        if (savedId && !list.some((h) => h.id === savedId)) {
          if (typeof window !== 'undefined') {
            if (list[0]) {
              localStorage.setItem(CURRENT_HOUSEHOLD_KEY, list[0].id);
            } else {
              localStorage.removeItem(CURRENT_HOUSEHOLD_KEY);
            }
          }
        }

        setCurrentHouseholdState(matched);
      }
    } catch (err) {
      console.error('fetchHouseholds exception:', err);
    }
  }, [authUser?.id, supabase]);

  useEffect(() => {
    if (authUser?.id) {
      fetchHouseholds();
    }
  }, [authUser?.id, fetchHouseholds]);

  // Realtime listener & Window focus listener
  useEffect(() => {
    if (!authUser?.id) return;

    const channel = supabase
      .channel('realtime_household_membership')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_members',
        },
        () => {
          fetchHouseholds();
        }
      )
      .subscribe();

    const handleFocus = () => {
      fetchHouseholds();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [authUser?.id, fetchHouseholds, supabase]);

  // 3. ดึงรายการตู้เย็นของ Household ปัจจุบัน
  const fetchFridges = useCallback(async () => {
    if (!currentHousehold?.id || !authUser?.id) {
      setFridges([]);
      return;
    }

    // ตรวจสอบว่าตัวเองยังเป็นสมาชิกของครัวเรือนนี้อยู่หรือไม่ก่อนดึงตู้เย็น
    try {
      const { data: memberCheck } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', currentHousehold.id)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!memberCheck) {
        setFridges([]);
        fetchHouseholds();
        return;
      }

      const { data, error } = await supabase
        .from('fridges')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching fridges:', getErrorMessage(error));
        return;
      }

      if (data) {
        setFridges(data as Fridge[]);
      }
    } catch (err) {
      console.error('fetchFridges exception:', err);
    }
  }, [currentHousehold?.id, authUser?.id, fetchHouseholds, supabase]);

  useEffect(() => {
    fetchFridges();
  }, [fetchFridges]);

  // 4. สลับ Household
  function setCurrentHousehold(h: HouseholdWithRole) {
    setCurrentHouseholdState(h);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CURRENT_HOUSEHOLD_KEY, h.id);
    }
  }

  // 5. สร้าง Household ใหม่
  async function createHousehold(name: string): Promise<Household | null> {
    if (!authUser?.id) return null;

    try {
      // ตรวจสอบ / สร้าง Profile ใน public.users เพื่อไม่ให้ติด Foreign Key
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from('users').upsert({
          id: authUser.id,
          email: authUser.email || '',
          display_name: authUser.email?.split('@')[0] || 'User',
        });
      }

      // 1. สร้าง ID แบบ UUID ฝั่ง Client เพื่อไม่ต้อง .select() ทันทีที่ติด RLS
      const householdId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      // 2. สร้าง Household (ลองใส่ created_by ก่อน ถ้าไม่มี column ให้ลองแบบไม่มี)
      let hError = null;
      const res1 = await supabase.from('households').insert({
        id: householdId,
        name: name.trim(),
        created_by: authUser.id,
      });

      if (res1.error) {
        if (
          res1.error.message?.includes('created_by') ||
          res1.error.details?.includes('created_by') ||
          res1.error.code === 'PGRST204'
        ) {
          const res2 = await supabase.from('households').insert({
            id: householdId,
            name: name.trim(),
          });
          hError = res2.error;
        } else {
          hError = res1.error;
        }
      }

      if (hError) throw hError;

      // 3. เพิ่มตัวเองเป็น owner ใน household_members
      const { error: mError } = await supabase.from('household_members').insert({
        household_id: householdId,
        user_id: authUser.id,
        role: 'owner',
      });

      if (mError) {
        console.warn('household_members insert warning:', mError);
      }

      // 4. สร้างตู้เย็นเริ่มต้นให้ 1 ตู้ "ตู้เย็นหลัก" พร้อม ID
      const initialFridgeId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      try {
        const fRes = await supabase.from('fridges').insert({
          id: initialFridgeId,
          household_id: householdId,
          name: 'ตู้เย็นหลัก',
          icon: '❄️',
        });
        if (fRes.error && fRes.error.message?.includes('icon')) {
          await supabase.from('fridges').insert({
            id: initialFridgeId,
            household_id: householdId,
            name: 'ตู้เย็นหลัก',
          });
        }
      } catch (fErr) {
        console.warn('Initial fridge creation warning:', fErr);
      }

      toast.success(`สร้างครัวเรือน "${name}" สำเร็จ`);
      await fetchHouseholds();
      return {
        id: householdId,
        name: name.trim(),
        created_by: authUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Household;
    } catch (err: unknown) {
      console.error('createHousehold error:', getErrorMessage(err), err);
      const msg = getErrorMessage(err);
      toast.error(msg);
      return null;
    }
  }

  // ลบครัวเรือน (เฉพาะ Owner)
  async function deleteHousehold(householdId: string): Promise<boolean> {
    if (!authUser?.id) return false;
    try {
      const { error } = await supabase
        .from('households')
        .delete()
        .eq('id', householdId);

      if (error) throw error;

      toast.success('ลบครัวเรือนเรียบร้อยแล้ว');
      if (typeof window !== 'undefined' && localStorage.getItem(CURRENT_HOUSEHOLD_KEY) === householdId) {
        localStorage.removeItem(CURRENT_HOUSEHOLD_KEY);
      }
      await fetchHouseholds();
      return true;
    } catch (err: unknown) {
      console.error('deleteHousehold error:', err);
      const msg = err instanceof Error ? err.message : 'ลบครัวเรือนไม่สำเร็จ';
      toast.error(msg);
      return false;
    }
  }

  // 6. เข้าร่วม Household ด้วย Invite Code
  async function joinHousehold(inviteCode: string): Promise<boolean> {
    if (!authUser?.id) return false;

    try {
      const code = inviteCode.trim().toUpperCase();

      // ลองเรียก RPC function join_household_by_invite ก่อน
      const { data: rpcHouseholdId, error: rpcError } = await supabase.rpc(
        'join_household_by_invite',
        { p_invite_code: code }
      );

      if (!rpcError && rpcHouseholdId) {
        toast.success('เข้าร่วมครัวเรือนสำเร็จ');
        await fetchHouseholds();
        return true;
      }

      // 2. ค้นหา invitation จากตาราง invitations
      let targetHouseholdId: string | null = null;
      let targetInviteId: string | null = null;

      try {
        const { data: invite } = await supabase
          .from('invitations')
          .select('*')
          .eq('invite_code', code)
          .eq('is_active', true)
          .maybeSingle();

        if (invite) {
          if (new Date(invite.expires_at) < new Date()) {
            toast.error('รหัสคำเชิญนี้หมดอายุแล้ว');
            return false;
          }
          if (invite.use_count >= invite.max_uses) {
            toast.error('รหัสคำเชิญนี้ถูกใช้งานครบจำนวนครั้งแล้ว');
            return false;
          }
          targetHouseholdId = invite.household_id;
          targetInviteId = invite.id;
        }
      } catch (invErr) {
        console.warn('Invitations lookup warning:', invErr);
      }

      // 3. Fallback: ค้นหาจากรหัสครัวเรือนโดยตรง (รองรับ #TY-XXXXXX, TY-XXXXXX, HH-XXXXXX, หรือ UUID)
      if (!targetHouseholdId) {
        try {
          const cleanCode = code
            .replace(/^#?TY-/, '')
            .replace(/^HH-/, '')
            .replace(/^HOME-/, '')
            .replace(/-/g, '')
            .toLowerCase();
          const { data: hhList } = await supabase.from('households').select('id, name');
          const matched = (hhList || []).find(
            (h) =>
              h.id.toLowerCase() === code.toLowerCase() ||
              (cleanCode.length >= 6 &&
                h.id.replace(/-/g, '').toLowerCase().startsWith(cleanCode)) ||
              h.name.trim().toLowerCase() === code.toLowerCase()
          );
          if (matched) {
            targetHouseholdId = matched.id;
          }
        } catch (hhErr) {
          console.warn('Household lookup fallback warning:', hhErr);
        }
      }

      if (!targetHouseholdId) {
        toast.error('รหัสคำเชิญไม่ถูกต้องหรือหมดอายุแล้ว');
        return false;
      }

      // ตรวจสอบว่าเคยเป็นสมาชิกอยู่แล้วหรือไม่
      const { data: existing } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', targetHouseholdId)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existing) {
        toast('คุณเป็นสมาชิกของครัวเรือนนี้อยู่แล้ว');
        await fetchHouseholds();
        return true;
      }

      // เพิ่มเข้า household_members
      const { error: joinError } = await supabase
        .from('household_members')
        .insert({
          household_id: targetHouseholdId,
          user_id: authUser.id,
          role: 'member',
        });

      if (joinError) throw joinError;

      // เพิ่ม use_count ถ้ามี invite row
      if (targetInviteId) {
        try {
          await supabase
            .from('invitations')
            .update({ use_count: 1 })
            .eq('id', targetInviteId);
        } catch {}
      }

      // บันทึก Activity
      try {
        await supabase.from('activity_logs').insert({
          household_id: targetHouseholdId,
          user_id: authUser.id,
          action: 'member_joined',
          details: { method: 'invite_code' },
        });
      } catch {
        // ignore
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(CURRENT_HOUSEHOLD_KEY, targetHouseholdId);
      }

      toast.success('เข้าร่วมครัวเรือนสำเร็จ! สลับมาที่บ้านนี้เรียบร้อย 🎉');
      await fetchHouseholds();
      return true;
    } catch (err: unknown) {
      console.error('joinHousehold error:', err);
      const msg = err instanceof Error ? err.message : 'เข้าร่วมครัวเรือนไม่สำเร็จ';
      toast.error(msg);
      return false;
    }
  }

  // 7. จัดการตู้เย็น
  async function createFridge(name: string, icon = '❄️'): Promise<Fridge | null> {
    if (!currentHousehold?.id || !authUser?.id) return null;

    try {
      // 1. สร้าง ID แบบ UUID ฝั่ง Client เพื่อไม่ต้องพึ่ง default และป้องกัน RLS select fail
      const fridgeId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      // 2. ลอง insert พร้อม icon ก่อน
      let res = await supabase.from('fridges').insert({
        id: fridgeId,
        household_id: currentHousehold.id,
        name: name.trim(),
        icon,
      });

      // ถ้าตารางไม่มีคอลัมน์ icon ให้ retry โดยไม่มี icon
      if (res.error && (res.error.message?.includes('icon') || res.error.code === 'PGRST204')) {
        res = await supabase.from('fridges').insert({
          id: fridgeId,
          household_id: currentHousehold.id,
          name: name.trim(),
        });
      }

      // ถ้าตารางบังคับ created_by ให้ใส่เพิ่ม
      if (res.error && res.error.message?.includes('created_by')) {
        res = await supabase.from('fridges').insert({
          id: fridgeId,
          household_id: currentHousehold.id,
          name: name.trim(),
          created_by: authUser.id,
        });
      }

      if (res.error) throw res.error;

      // 3. บันทึก Activity Log (ถ้ามีตาราง)
      try {
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          fridge_id: fridgeId,
          user_id: authUser.id,
          action: 'fridge_created',
          details: { name: name.trim() },
        });
      } catch {
        // ignore activity logs error
      }

      const createdFridge: Fridge = {
        id: fridgeId,
        household_id: currentHousehold.id,
        name: name.trim(),
        icon,
        display_order: 0,
        created_by: authUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      toast.success(`เพิ่มตู้เย็น "${name}" แล้ว`);
      await fetchFridges();
      return createdFridge;
    } catch (err: unknown) {
      console.error('createFridge error:', getErrorMessage(err), err);
      const msg = getErrorMessage(err);
      toast.error(msg);
      return null;
    }
  }

  async function updateFridge(id: string, name: string, icon = '❄️'): Promise<boolean> {
    if (!currentHousehold?.id || !authUser?.id) return false;

    try {
      let { error } = await supabase
        .from('fridges')
        .update({
          name: name.trim(),
          icon,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error && (error.message.includes('updated_at') || error.message.includes('icon'))) {
        const retry = await supabase
          .from('fridges')
          .update({
            name: name.trim(),
          })
          .eq('id', id);
        error = retry.error;
      }

      if (error) throw error;

      toast.success('แก้ไขข้อมูลตู้เย็นสำเร็จ');
      await fetchFridges();
      return true;
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      toast.error(msg);
      return false;
    }
  }

  async function deleteFridge(id: string): Promise<boolean> {
    if (!currentHousehold?.id || !authUser?.id) return false;

    try {
      const { error } = await supabase
        .from('fridges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('ลบตู้เย็นเรียบร้อย');
      await fetchFridges();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ลบตู้เย็นไม่สำเร็จ';
      toast.error(msg);
      return false;
    }
  }

  return (
    <HouseholdContext.Provider
      value={{
        user,
        authUser,
        households,
        currentHousehold,
        fridges,
        loading,
        setCurrentHousehold,
        createHousehold,
        deleteHousehold,
        joinHousehold,
        refreshHouseholds: fetchHouseholds,
        refreshFridges: fetchFridges,
        createFridge,
        updateFridge,
        deleteFridge,
        refreshUser,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold ต้องถูกเรียกใช้ภายใน HouseholdProvider');
  }
  return context;
}
