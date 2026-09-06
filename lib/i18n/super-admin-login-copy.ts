import type { AdminLocale } from "@/lib/i18n/admin-locale";

export type SuperAdminLoginCopy = {
  authNotReady: string;
  brandKicker: string;
  email: string;
  emailPlaceholder: string;
  emailRequired: string;
  hidePassword: string;
  invalidCredentials: string;
  invalidEmailFormat: string;
  password: string;
  passwordPlaceholder: string;
  passwordRequired: string;
  showPassword: string;
  signIn: string;
  signingIn: string;
  title: string;
};

const superAdminLoginCopy: Record<AdminLocale, SuperAdminLoginCopy> = {
  en: {
    authNotReady: "Authentication is not ready. Check the database and environment settings.",
    brandKicker: "Secure platform access",
    email: "Email",
    emailPlaceholder: "owner@egopos.center",
    emailRequired: "Email is required.",
    hidePassword: "Hide password",
    invalidCredentials: "Invalid email or password.",
    invalidEmailFormat: "Enter a valid email address.",
    password: "Password",
    passwordPlaceholder: "Enter secure password",
    passwordRequired: "Password is required.",
    showPassword: "Show password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    title: "EGO POS Center",
  },
  th: {
    authNotReady: "ระบบยืนยันตัวตนยังไม่พร้อม กรุณาตรวจสอบฐานข้อมูลและการตั้งค่าสภาพแวดล้อม",
    brandKicker: "เข้าถึงระบบจัดการแพลตฟอร์มอย่างปลอดภัย",
    email: "อีเมล",
    emailPlaceholder: "owner@egopos.center",
    emailRequired: "กรุณากรอกอีเมล",
    hidePassword: "ซ่อนรหัสผ่าน",
    invalidCredentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    invalidEmailFormat: "กรุณากรอกอีเมลให้ถูกต้อง",
    password: "รหัสผ่าน",
    passwordPlaceholder: "กรอกรหัสผ่านที่ปลอดภัย",
    passwordRequired: "กรุณากรอกรหัสผ่าน",
    showPassword: "แสดงรหัสผ่าน",
    signIn: "เข้าสู่ระบบ",
    signingIn: "กำลังเข้าสู่ระบบ...",
    title: "EGO POS Center",
  },
};

export function getSuperAdminLoginCopy(locale: AdminLocale): SuperAdminLoginCopy {
  return superAdminLoginCopy[locale] ?? superAdminLoginCopy.en;
}
