/**
 * Smart Fridge — Thai Language Strings (th)
 *
 * โครงสร้างออกแบบให้รองรับ i18n ในอนาคต
 * เมื่อต้องการเพิ่มภาษาอังกฤษ สร้างไฟล์ en.ts ด้วยโครงสร้างเดียวกัน
 */

export const th = {
  // ============================================================
  // App
  // ============================================================
  app: {
    name: 'Smart Fridge',
    tagline: 'จัดการตู้เย็นของครอบครัว ง่ายๆ ในที่เดียว',
    loading: 'กำลังโหลด...',
    error: 'เกิดข้อผิดพลาด',
    retry: 'ลองอีกครั้ง',
    save: 'บันทึก',
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    delete: 'ลบ',
    edit: 'แก้ไข',
    add: 'เพิ่ม',
    search: 'ค้นหา',
    back: 'กลับ',
    close: 'ปิด',
    all: 'ทั้งหมด',
    none: 'ไม่มี',
    yes: 'ใช่',
    no: 'ไม่ใช่',
    comingSoon: 'เร็วๆ นี้',
  },

  // ============================================================
  // Auth — ระบบบัญชีผู้ใช้
  // ============================================================
  auth: {
    login: 'เข้าสู่ระบบ',
    register: 'สมัครสมาชิก',
    logout: 'ออกจากระบบ',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    confirmPassword: 'ยืนยันรหัสผ่าน',
    displayName: 'ชื่อที่แสดง',
    forgotPassword: 'ลืมรหัสผ่าน?',
    resetPassword: 'ตั้งรหัสผ่านใหม่',
    noAccount: 'ยังไม่มีบัญชี?',
    hasAccount: 'มีบัญชีอยู่แล้ว?',
    registerHere: 'สมัครที่นี่',
    loginHere: 'เข้าสู่ระบบที่นี่',
    errors: {
      invalidEmail: 'กรุณากรอกอีเมลให้ถูกต้อง',
      weakPassword: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
      passwordMismatch: 'รหัสผ่านไม่ตรงกัน',
      emailInUse: 'อีเมลนี้ถูกใช้งานแล้ว',
      invalidCredentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      generic: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
    },
    success: {
      registered: 'สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี',
      loggedIn: 'เข้าสู่ระบบสำเร็จ',
      loggedOut: 'ออกจากระบบแล้ว',
      passwordReset: 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลแล้ว',
    },
  },

  // ============================================================
  // Household — ครัวเรือน
  // ============================================================
  household: {
    title: 'ครัวเรือน',
    create: 'สร้างครัวเรือนใหม่',
    name: 'ชื่อครัวเรือน',
    namePlaceholder: 'เช่น บ้านของฉัน',
    switch: 'เปลี่ยนครัวเรือน',
    settings: 'ตั้งค่าครัวเรือน',
    leave: 'ออกจากครัวเรือน',
    delete: 'ลบครัวเรือน',
    members: 'สมาชิก',
    memberCount: (count: number) => `${count} สมาชิก`,
    roles: {
      owner: 'เจ้าของ',
      member: 'สมาชิก',
    },
    invite: {
      title: 'เชิญสมาชิก',
      generate: 'สร้างรหัสเชิญ',
      code: 'รหัสเชิญ',
      codePlaceholder: 'ใส่รหัสเชิญ 6 หลัก',
      join: 'เข้าร่วมครัวเรือน',
      expiresIn: (hours: number) => `หมดอายุใน ${hours} ชั่วโมง`,
      maxUses: (count: number) => `ใช้ได้ ${count} ครั้ง`,
      copied: 'คัดลอกรหัสเชิญแล้ว',
      share: 'ส่งรหัสนี้ให้สมาชิกที่ต้องการเชิญ',
    },
    errors: {
      nameRequired: 'กรุณาตั้งชื่อครัวเรือน',
      invalidCode: 'รหัสเชิญไม่ถูกต้องหรือหมดอายุ',
      alreadyMember: 'คุณเป็นสมาชิกของครัวเรือนนี้อยู่แล้ว',
      cannotRemoveOwner: 'ไม่สามารถนำเจ้าของออกจากครัวเรือนได้',
      cannotLeaveAsOwner: 'เจ้าของไม่สามารถออกจากครัวเรือนได้ กรุณาลบครัวเรือนแทน',
    },
    success: {
      created: 'สร้างครัวเรือนสำเร็จ!',
      joined: 'เข้าร่วมครัวเรือนสำเร็จ!',
      memberRemoved: 'นำสมาชิกออกแล้ว',
      left: 'ออกจากครัวเรือนแล้ว',
    },
    empty: {
      title: 'ยินดีต้อนรับ!',
      description: 'คุณยังไม่มีครัวเรือน สร้างใหม่หรือเข้าร่วมด้วยรหัสเชิญ',
    },
    confirmDelete: 'คุณแน่ใจหรือไม่ที่จะลบครัวเรือนนี้? ข้อมูลตู้เย็นและสินค้าทั้งหมดจะถูกลบ',
    confirmRemoveMember: (name: string) => `คุณแน่ใจหรือไม่ที่จะนำ ${name} ออกจากครัวเรือน?`,
    confirmLeave: 'คุณแน่ใจหรือไม่ที่จะออกจากครัวเรือนนี้?',
  },

  // ============================================================
  // Fridge — ตู้เย็น
  // ============================================================
  fridge: {
    title: 'ตู้เย็น',
    create: 'เพิ่มตู้เย็น',
    name: 'ชื่อตู้เย็น',
    namePlaceholder: 'เช่น ตู้เย็นห้องครัว',
    icon: 'ไอคอน',
    itemCount: (count: number) => `${count} รายการ`,
    empty: {
      title: 'ยังไม่มีตู้เย็น',
      description: 'เพิ่มตู้เย็นตู้แรกเพื่อเริ่มจัดการสินค้า',
    },
    confirmDelete: 'คุณแน่ใจหรือไม่ที่จะลบตู้เย็นนี้? สินค้าทั้งหมดในตู้เย็นจะถูกลบ',
    errors: {
      nameRequired: 'กรุณาตั้งชื่อตู้เย็น',
    },
    success: {
      created: 'เพิ่มตู้เย็นสำเร็จ!',
      updated: 'แก้ไขตู้เย็นสำเร็จ!',
      deleted: 'ลบตู้เย็นแล้ว',
    },
  },

  // ============================================================
  // Item — สินค้า
  // ============================================================
  item: {
    title: 'สินค้า',
    add: 'เพิ่มสินค้า',
    quickAdd: 'เพิ่มด่วน',
    fullForm: 'เพิ่มแบบละเอียด',
    name: 'ชื่อสินค้า',
    namePlaceholder: 'เช่น นม, ไข่, น้ำดื่ม',
    category: 'หมวดหมู่',
    quantity: 'จำนวน',
    unit: 'หน่วย',
    expiryDate: 'วันหมดอายุ',
    notes: 'หมายเหตุ',
    notesPlaceholder: 'บันทึกเพิ่มเติม (ไม่บังคับ)',
    image: 'รูปสินค้า',
    addedBy: 'เพิ่มโดย',
    addedAt: 'เพิ่มเมื่อ',
    selectFridge: 'เลือกตู้เย็น',
    units: {
      piece: 'ชิ้น',
      bottle: 'ขวด',
      box: 'กล่อง',
      pack: 'แพ็ก',
      bag: 'ถุง',
      can: 'กระป๋อง',
      kg: 'กิโลกรัม',
      g: 'กรัม',
      l: 'ลิตร',
      ml: 'มิลลิลิตร',
      carton: 'โหล',
      other: 'อื่นๆ',
    },
    status: {
      inStock: 'มีอยู่',
      lowStock: 'เหลือน้อย',
      outOfStock: 'หมดแล้ว',
    },
    empty: {
      title: 'ตู้เย็นว่างเปล่า',
      description: 'เพิ่มสินค้าชิ้นแรกเข้าตู้เย็น',
    },
    searchPlaceholder: 'ค้นหาสินค้า...',
    sortBy: 'เรียงตาม',
    sortOptions: {
      name: 'ชื่อ',
      dateAdded: 'วันที่เพิ่ม',
      expiry: 'วันหมดอายุ',
      quantity: 'จำนวน',
    },
    filterByCategory: 'กรองตามหมวดหมู่',
    filterByStatus: 'กรองตามสถานะ',
    confirmDelete: 'คุณแน่ใจหรือไม่ที่จะลบสินค้านี้?',
    errors: {
      nameRequired: 'กรุณากรอกชื่อสินค้า',
      quantityInvalid: 'จำนวนต้องมากกว่า 0',
      quantityNegative: 'จำนวนสินค้าไม่สามารถติดลบได้',
      fridgeRequired: 'กรุณาเลือกตู้เย็น',
      notEnough: 'จำนวนสินค้าไม่เพียงพอ',
    },
    success: {
      added: 'เพิ่มสินค้าสำเร็จ!',
      updated: 'แก้ไขสินค้าสำเร็จ!',
      deleted: 'ลบสินค้าแล้ว',
      quantityUpdated: 'อัปเดตจำนวนสำเร็จ',
    },
  },

  // ============================================================
  // Batch — Batch / วันหมดอายุ
  // ============================================================
  batch: {
    title: 'รายละเอียดสินค้า',
    addBatch: 'เพิ่ม Batch ใหม่',
    expiryDate: 'วันหมดอายุ',
    noExpiry: 'ไม่ระบุวันหมดอายุ',
    daysLeft: (days: number) => {
      if (days < 0) return `หมดอายุแล้ว ${Math.abs(days)} วัน`;
      if (days === 0) return 'หมดอายุวันนี้!';
      if (days === 1) return 'หมดอายุพรุ่งนี้';
      return `เหลือ ${days} วัน`;
    },
    status: {
      fresh: 'ยังสด',
      expiringSoon: 'ใกล้หมดอายุ',
      expired: 'หมดอายุแล้ว',
    },
    expiringItems: 'สินค้าใกล้หมดอายุ',
    expiredItems: 'สินค้าหมดอายุแล้ว',
  },

  // ============================================================
  // Activity — ประวัติการใช้งาน
  // ============================================================
  activity: {
    title: 'ประวัติการใช้งาน',
    empty: 'ยังไม่มีกิจกรรม',
    filterByFridge: 'กรองตามตู้เย็น',
    filterByMember: 'กรองตามสมาชิก',
    actions: {
      item_added: (name: string, qty: number, unit: string) =>
        `เพิ่ม ${name} ${qty} ${unit}`,
      item_removed: (name: string) => `ลบ ${name}`,
      item_updated: (name: string) => `แก้ไข ${name}`,
      quantity_increased: (name: string, change: number, unit: string) =>
        `เพิ่ม ${name} ${change} ${unit}`,
      quantity_decreased: (name: string, change: number, unit: string) =>
        `หยิบ ${name} ${Math.abs(change)} ${unit}`,
      fridge_created: (name: string) => `สร้างตู้เย็น "${name}"`,
      fridge_updated: (name: string) => `แก้ไขตู้เย็น "${name}"`,
      fridge_deleted: (name: string) => `ลบตู้เย็น "${name}"`,
      member_joined: (name: string) => `${name} เข้าร่วมครัวเรือน`,
      member_removed: (name: string) => `${name} ถูกนำออกจากครัวเรือน`,
      receipt_scanned: () => 'สแกนใบเสร็จ',
    },
    timeAgo: {
      justNow: 'เมื่อสักครู่',
      minutesAgo: (n: number) => `${n} นาทีที่แล้ว`,
      hoursAgo: (n: number) => `${n} ชั่วโมงที่แล้ว`,
      daysAgo: (n: number) => `${n} วันที่แล้ว`,
    },
  },

  // ============================================================
  // Receipt Scanner — Phase 2
  // ============================================================
  receipt: {
    title: 'สแกนใบเสร็จ',
    comingSoon: 'ฟีเจอร์นี้กำลังพัฒนา — เร็วๆ นี้!',
    description: 'ถ่ายรูปใบเสร็จแล้วให้ระบบช่วยเพิ่มสินค้าให้อัตโนมัติ',
  },

  // ============================================================
  // Profile — โปรไฟล์
  // ============================================================
  profile: {
    title: 'โปรไฟล์',
    settings: 'ตั้งค่า',
    displayName: 'ชื่อที่แสดง',
    email: 'อีเมล',
    avatar: 'รูปโปรไฟล์',
    changePassword: 'เปลี่ยนรหัสผ่าน',
    theme: 'ธีม',
    lightMode: 'สว่าง',
    darkMode: 'มืด',
    systemMode: 'ตามระบบ',
    success: {
      updated: 'อัปเดตโปรไฟล์สำเร็จ!',
    },
  },

  // ============================================================
  // Navigation
  // ============================================================
  nav: {
    dashboard: 'หน้าหลัก',
    fridges: 'ตู้เย็น',
    addItem: 'เพิ่มของ',
    expiring: 'ใกล้หมดอายุ',
    history: 'ประวัติ',
    settings: 'ตั้งค่า',
    receipt: 'สแกนใบเสร็จ',
  },

  // ============================================================
  // Categories — หมวดหมู่
  // ============================================================
  categories: {
    food: 'อาหาร',
    beverage: 'เครื่องดื่ม',
    vegetable: 'ผัก-ผลไม้',
    meat: 'เนื้อสัตว์',
    dairy: 'นม-ผลิตภัณฑ์นม',
    snack: 'ขนม',
    condiment: 'เครื่องปรุง',
    other: 'อื่นๆ',
  },

  // ============================================================
  // Confirm Dialogs
  // ============================================================
  confirm: {
    title: 'ยืนยันการดำเนินการ',
    deleteTitle: 'ยืนยันการลบ',
    cannotUndo: 'การดำเนินการนี้ไม่สามารถย้อนกลับได้',
  },

  // ============================================================
  // Datetime
  // ============================================================
  date: {
    today: 'วันนี้',
    yesterday: 'เมื่อวาน',
    tomorrow: 'พรุ่งนี้',
  },
} as const;

export type TranslationKeys = typeof th;
export default th;
