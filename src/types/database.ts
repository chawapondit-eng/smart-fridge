/**
 * Smart Fridge — Database Types
 *
 * TypeScript types ที่ตรงกับ Database Schema
 * ใช้เป็น Single Source of Truth สำหรับ type safety ทั้งโปรเจกต์
 */

// ============================================================
// Base Types
// ============================================================

export type UUID = string;
export type Timestamp = string; // ISO 8601

// ============================================================
// User
// ============================================================

export interface User {
  id: UUID;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserInsert {
  id: UUID;
  email: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface UserUpdate {
  display_name?: string;
  avatar_url?: string | null;
}

// ============================================================
// Household
// ============================================================

export interface Household {
  id: UUID;
  name: string;
  created_by: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface HouseholdInsert {
  name: string;
  created_by: UUID;
}

export interface HouseholdUpdate {
  name?: string;
}

// ============================================================
// Household Member & Permissions
// ============================================================

export type MemberRole = 'owner' | 'admin' | 'member';

export interface MemberPermissions {
  can_view_items: boolean;
  can_add_items: boolean;
  can_edit_items: boolean;
  can_delete_items: boolean;
  can_manage_members: boolean;
}

export interface HouseholdMember {
  id: UUID;
  household_id: UUID;
  user_id: UUID;
  role: MemberRole;
  permissions?: MemberPermissions;
  joined_at: Timestamp;
}

/** Household Member พร้อมข้อมูล User (สำหรับแสดง Member List) */
export interface HouseholdMemberWithUser extends HouseholdMember {
  user: Pick<User, 'id' | 'display_name' | 'avatar_url' | 'email'>;
}

// ============================================================
// Invitation
// ============================================================

export interface Invitation {
  id: UUID;
  household_id: UUID;
  invite_code: string;
  created_by: UUID;
  expires_at: Timestamp;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  created_at: Timestamp;
}

// ============================================================
// Fridge
// ============================================================

export interface Fridge {
  id: UUID;
  household_id: UUID;
  name: string;
  icon?: string;
  display_order?: number;
  created_by?: UUID;
  created_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface FridgeInsert {
  household_id: UUID;
  name: string;
  icon?: string;
  display_order?: number;
  created_by: UUID;
}

export interface FridgeUpdate {
  name?: string;
  icon?: string;
  display_order?: number;
}

/** Fridge พร้อมจำนวนสินค้า (สำหรับ Dashboard) */
export interface FridgeWithStats extends Fridge {
  item_count: number;
  expiring_count: number;
  out_of_stock_count: number;
}

// ============================================================
// Category
// ============================================================

export interface Category {
  id: UUID;
  household_id: UUID | null;
  name: string;
  icon: string | null;
  is_default: boolean;
  display_order: number;
}

// ============================================================
// Item (สินค้า)
// ============================================================

export type ItemStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface Item {
  id: UUID;
  fridge_id: UUID;
  household_id: UUID;
  category_id: UUID | null;
  name: string;
  quantity: number;
  unit: string;
  image_url: string | null;
  notes: string | null;
  status: ItemStatus;
  added_by: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ItemInsert {
  fridge_id: UUID;
  household_id: UUID;
  category_id?: UUID | null;
  name: string;
  quantity: number;
  unit?: string;
  image_url?: string | null;
  notes?: string | null;
  added_by: UUID;
}

export interface ItemUpdate {
  name?: string;
  category_id?: UUID | null;
  unit?: string;
  image_url?: string | null;
  notes?: string | null;
  fridge_id?: UUID;
}

/** Item พร้อมข้อมูลเสริม (สำหรับแสดงใน Inventory) */
export interface ItemWithDetails extends Item {
  category: Category | null;
  added_by_user: Pick<User, 'id' | 'display_name' | 'avatar_url'>;
  batches: ItemBatch[];
  fridge: Pick<Fridge, 'id' | 'name' | 'icon'>;
  nearest_expiry: string | null; // วันหมดอายุที่ใกล้ที่สุด
}

// ============================================================
// Item Batch (Batch ตามวันหมดอายุ)
// ============================================================

export interface ItemBatch {
  id: UUID;
  item_id: UUID;
  quantity: number;
  expiry_date: string | null; // YYYY-MM-DD
  added_by: UUID;
  added_at: Timestamp;
  notes: string | null;
}

export interface ItemBatchInsert {
  item_id: UUID;
  quantity: number;
  expiry_date?: string | null;
  added_by: UUID;
  notes?: string | null;
}

/** Batch พร้อมสถานะวันหมดอายุ */
export type ExpiryStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface ItemBatchWithStatus extends ItemBatch {
  expiry_status: ExpiryStatus;
  days_until_expiry: number | null;
}

// ============================================================
// Activity Log
// ============================================================

export type ActivityAction =
  | 'item_added'
  | 'item_removed'
  | 'item_updated'
  | 'quantity_increased'
  | 'quantity_decreased'
  | 'fridge_created'
  | 'fridge_updated'
  | 'fridge_deleted'
  | 'member_joined'
  | 'member_removed'
  | 'receipt_scanned';

export interface ActivityLog {
  id: UUID;
  household_id: UUID;
  fridge_id: UUID | null;
  item_id: UUID | null;
  user_id: UUID;
  action: ActivityAction;
  details: Record<string, unknown> | null;
  created_at: Timestamp;
}

/** Activity Log พร้อมข้อมูล User (สำหรับแสดง History) */
export interface ActivityLogWithUser extends ActivityLog {
  user: Pick<User, 'id' | 'display_name' | 'avatar_url'>;
}

// ============================================================
// Receipt (Phase 2)
// ============================================================

export type ReceiptStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Receipt {
  id: UUID;
  household_id: UUID;
  uploaded_by: UUID;
  image_url: string;
  status: ReceiptStatus;
  ocr_raw_data: Record<string, unknown> | null;
  target_fridge_id: UUID | null;
  created_at: Timestamp;
  processed_at: Timestamp | null;
}

export interface ReceiptItem {
  id: UUID;
  receipt_id: UUID;
  name: string;
  quantity: number;
  unit: string;
  confidence: number | null;
  is_confirmed: boolean;
  item_id: UUID | null;
  created_at: Timestamp;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================
// Form Types (สำหรับ UI Forms)
// ============================================================

export interface QuickAddItemForm {
  name: string;
  quantity: number;
  unit: string;
  fridge_id: UUID;
}

export interface FullAddItemForm extends QuickAddItemForm {
  category_id: UUID | null;
  expiry_date: string | null;
  notes: string | null;
  image: File | null;
}

export interface QuantityChangeRequest {
  item_id: UUID;
  change: number; // +N หรือ -N
  batch_id?: UUID | null;
}

export interface CreateHouseholdForm {
  name: string;
}

export interface JoinHouseholdForm {
  invite_code: string;
}

export interface CreateFridgeForm {
  name: string;
  icon: string;
}

export interface UpdateFridgeForm {
  name?: string;
  icon?: string;
}

// ============================================================
// Theme
// ============================================================

export type ThemeMode = 'light' | 'dark' | 'system';

// ============================================================
// Unit Options (สำหรับ Dropdown)
// ============================================================

export const UNIT_OPTIONS = [
  { value: 'ชิ้น', label: 'ชิ้น' },
  { value: 'ขวด', label: 'ขวด' },
  { value: 'กล่อง', label: 'กล่อง' },
  { value: 'แพ็ก', label: 'แพ็ก' },
  { value: 'ถุง', label: 'ถุง' },
  { value: 'กระป๋อง', label: 'กระป๋อง' },
  { value: 'กิโลกรัม', label: 'กก.' },
  { value: 'กรัม', label: 'ก.' },
  { value: 'ลิตร', label: 'ล.' },
  { value: 'มิลลิลิตร', label: 'มล.' },
  { value: 'โหล', label: 'โหล' },
] as const;

export const FRIDGE_ICONS = [
  '❄️', '🧊', '🏠', '🍳', '🏢', '🛒', '📦', '🥶',
  '🌡️', '🍱', '🥗', '🍖', '🧃', '🍕', '🏪', '🔷',
] as const;

/** จำนวนวันที่ถือว่า "ใกล้หมดอายุ" */
export const EXPIRY_WARNING_DAYS = 3;
