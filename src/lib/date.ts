/**
 * CheckTuYen — Central Calendar Date Utility (Asia/Bangkok)
 *
 * แก้ปัญหา Timezone และความคลาดเคลื่อนของวันหมดอายุที่ต้นเหตุ:
 * - ใช้เขตเวลา Asia/Bangkok (UTC+7) เป็นมาตรฐานเดียวทั้งระบบ
 * - คำนวณด้วย Calendar Date (YYYY-MM-DD) ล้วน ๆ ไม่ใช้ Milliseconds + Math.ceil
 * - แยกความหมายชัดเจนระหว่าง:
 *   1. expiry_date (YYYY-MM-DD): วันที่หมดอายุจริง
 *   2. days_until_expiry (number): จำนวนวันคงเหลือ (expiry_date - todayBangkok)
 *   3. reminder_before_days (number): ตั้งค่าแจ้งเตือนล่วงหน้า (ไม่กระทบ expiry_date)
 *   4. purchased_at (string): วันที่ซื้อ/เพิ่มเข้าตู้
 */

export const BANGKOK_TIMEZONE = 'Asia/Bangkok';
const MS_PER_DAY = 86_400_000;

export type ExpiryStatusCategory = 'expired' | 'today' | 'expiring_soon' | 'fresh' | 'none';

export interface CalendarDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_WEEKDAYS = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
];

/**
 * แปลง Date เป็นสตริงวันที่ปฏิทินตามเวลาประเทศไทย (Asia/Bangkok) รูปแบบ YYYY-MM-DD
 */
export function getBangkokTodayString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * แยกองค์ประกอบ YYYY-MM-DD อย่างปลอดภัย โดยไม่ผ่าน new Date('YYYY-MM-DD') ที่อิง UTC/Local
 */
export function parseCalendarDate(dateStr: string | null | undefined): CalendarDateParts | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // ตรวจสอบว่าเป็นวันที่มีอยู่จริงในปฏิทิน (เช่น ป้องกัน 2026-02-31)
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * คืนค่าสตริง YYYY-MM-DD ที่สะอาดจาก DATE หรือ ISO Timestamp
 */
export function normalizeDateString(dateStr: string | null | undefined): string | null {
  const parts = parseCalendarDate(dateStr);
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

/**
 * แปลง CalendarDateParts เป็น UTC Day Timestamp สำหรับการลบวันปฏิทินแบบจำนวนเต็มแม่นยำ
 */
function toUtcDayEpoch(parts: CalendarDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/**
 * บวกหรือลบจำนวนวันปฏิทินจากสตริง YYYY-MM-DD
 */
export function addDaysToDateString(baseDateStr: string, days: number): string {
  const parts = parseCalendarDate(baseDateStr);
  if (!parts) {
    throw new Error(`Invalid calendar date string: ${baseDateStr}`);
  }
  const intDays = Math.trunc(days);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + intDays));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * คำนวณวันหมดอายุจาก "จำนวนวันคงเหลือ" (เช่น หมดอายุในอีก 3 วัน -> todayBangkok + 3)
 */
export function addDaysFromBangkokToday(daysUntilExpiry: number, now: Date = new Date()): string {
  const todayStr = getBangkokTodayString(now);
  return addDaysToDateString(todayStr, daysUntilExpiry);
}

/**
 * คำนวณจำนวนวันคงเหลือแบบ Calendar Date (Asia/Bangkok)
 * daysRemaining = expiryDate - todayBangkok
 *
 * ตัวอย่าง:
 * - หมดอายุวันนี้ = 0
 * - หมดอายุพรุ่งนี้ = 1
 * - หมดอายุอีก 3 วัน = 3
 * - หมดอายุเมื่อวาน = -1
 * - หมดอายุมาแล้ว 3 วัน = -3
 * - ไม่ระบุวันหมดอายุ = null
 */
export function getDaysUntilExpiry(
  expiryDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  const expParts = parseCalendarDate(expiryDate);
  if (!expParts) return null;

  const todayParts = parseCalendarDate(getBangkokTodayString(now));
  if (!todayParts) return null;

  return Math.round((toUtcDayEpoch(expParts) - toUtcDayEpoch(todayParts)) / MS_PER_DAY);
}

/**
 * ตรวจสอบว่าหมดอายุแล้วหรือไม่ (expiry_date < todayBangkok)
 * หมายเหตุ: หากไม่ระบุวันหมดอายุ จะคืนค่า false (ห้ามเดาว่าหมดอายุ)
 */
export function isExpiredDate(
  expiryDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  const days = getDaysUntilExpiry(expiryDate, now);
  return days !== null && days < 0;
}

/**
 * จำแนกสถานะวันหมดอายุชัดเจน:
 * - expired: days < 0
 * - today: days === 0
 * - expiring_soon: 1 <= days <= threshold (ค่าเริ่มต้น 5 วัน)
 * - fresh: days > threshold
 * - none: ไม่ระบุวันหมดอายุ
 */
export function getExpiryStatusCategory(
  expiryDate: string | null | undefined,
  expiringSoonThreshold = 5,
  now: Date = new Date()
): ExpiryStatusCategory {
  const days = getDaysUntilExpiry(expiryDate, now);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= expiringSoonThreshold) return 'expiring_soon';
  return 'fresh';
}

/**
 * ข้อความสถานะภาษาไทยที่ตรงตามวันปฏิทินจริง
 */
export function formatExpiryLabel(daysUntilExpiry: number | null): string {
  if (daysUntilExpiry === null) return 'ไม่ระบุวันหมดอายุ';
  if (daysUntilExpiry < 0) return `หมดอายุมาแล้ว ${Math.abs(daysUntilExpiry)} วัน`;
  if (daysUntilExpiry === 0) return 'หมดอายุวันนี้';
  if (daysUntilExpiry === 1) return 'หมดอายุพรุ่งนี้ (เหลือ 1 วัน)';
  return `เหลือ ${daysUntilExpiry} วัน`;
}

/**
 * ข้อความสถานะแบบกระชับสำหรับ Badge
 */
export function formatExpiryShortBadge(daysUntilExpiry: number | null): string {
  if (daysUntilExpiry === null) return 'ไม่ระบุวันหมดอายุ';
  if (daysUntilExpiry < 0) return `หมดอายุแล้ว ${Math.abs(daysUntilExpiry)} วัน`;
  if (daysUntilExpiry === 0) return 'หมดอายุวันนี้';
  return `เหลือ ${daysUntilExpiry} วัน`;
}

/**
 * แสดงวันที่ปฏิทินเป็นภาษาไทยสั้น เช่น "18 พ.ย. 2569"
 */
export function formatThaiDate(dateStr: string | null | undefined): string {
  const parts = parseCalendarDate(dateStr);
  if (!parts) return 'ไม่ระบุวันหมดอายุ';
  const buddhistYear = parts.year + 543;
  return `${parts.day} ${THAI_MONTHS_SHORT[parts.month - 1]} ${buddhistYear}`;
}

/**
 * แสดงวันที่ซื้อ/เพิ่มจาก Timestamp (ISO) ตามเวลาไทย
 */
export function formatThaiTimestampDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '-';
  const bangkokDateStr = getBangkokTodayString(d);
  return formatThaiDate(bangkokDateStr);
}

/**
 * แสดงวันที่ปัจจุบันตามเวลาไทยแบบเต็ม เช่น "วันพุธที่ 18 พฤศจิกายน 2569"
 */
export function formatBangkokTodayThai(now: Date = new Date()): string {
  const todayStr = getBangkokTodayString(now);
  const parts = parseCalendarDate(todayStr);
  if (!parts) return '';
  const weekdayIdx = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const buddhistYear = parts.year + 543;
  return `วัน${THAI_WEEKDAYS[weekdayIdx]}ที่ ${parts.day} ${THAI_MONTHS_FULL[parts.month - 1]} ${buddhistYear}`;
}

/**
 * การตั้งค่าแจ้งเตือนล่วงหน้า (reminder_before_days) แยกออกจาก expiry_date โดยเด็ดขาด
 */
export function getReminderBeforeDays(householdId?: string): number {
  if (typeof window === 'undefined') return 3;
  const key = householdId
    ? `smart_fridge_reminder_days_${householdId}`
    : 'smart_fridge_reminder_days_default';
  const raw = localStorage.getItem(key);
  if (!raw) return 3;
  const parsed = parseInt(raw, 10);
  return !isNaN(parsed) && parsed >= 0 && parsed <= 30 ? parsed : 3;
}

export function setReminderBeforeDays(days: number, householdId?: string): void {
  if (typeof window === 'undefined') return;
  const clamped = Math.max(0, Math.min(30, Math.trunc(days)));
  const key = householdId
    ? `smart_fridge_reminder_days_${householdId}`
    : 'smart_fridge_reminder_days_default';
  localStorage.setItem(key, String(clamped));
}
