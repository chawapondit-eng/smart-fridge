/**
 * Smart Fridge — i18n Index
 *
 * ระบบจัดการภาษา — ปัจจุบันรองรับภาษาไทย
 * เมื่อต้องการเพิ่มภาษาอังกฤษ:
 * 1. สร้างไฟล์ src/locales/en.ts ด้วยโครงสร้างเดียวกับ th.ts
 * 2. เพิ่ม import และ export ในไฟล์นี้
 * 3. เพิ่ม Language Selector ใน UI
 */

import th, { type TranslationKeys } from './th';

export type Locale = 'th'; // เพิ่ม 'en' เมื่อรองรับภาษาอังกฤษ

const locales: Record<Locale, TranslationKeys> = {
  th,
};

// ภาษาเริ่มต้น
export const DEFAULT_LOCALE: Locale = 'th';

// ฟังก์ชันดึง Translation
export function getTranslations(locale: Locale = DEFAULT_LOCALE): TranslationKeys {
  return locales[locale] || locales[DEFAULT_LOCALE];
}

// Shortcut สำหรับภาษาไทย (ใช้บ่อยสุด)
export const t = th;

export type { TranslationKeys };
export { th };
