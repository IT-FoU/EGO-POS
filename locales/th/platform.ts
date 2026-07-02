import type { BusinessTemplateType } from "@/features/platform/platform-data";

export const platformTh = {
  appName: "EGO POS",
  platformEyebrow: "แพลตฟอร์ม EGO POS",
  selectTemplateError: "กรุณาเลือกแม่แบบ POS ก่อนดำเนินการต่อ",
  setupSaveError: "ไม่สามารถบันทึกการตั้งค่าธุรกิจได้ กรุณาลองใหม่",
  slogan: "ง่าย ฉลาด รวดเร็ว สำหรับทุกธุรกิจ",
  templatePlaceholder: {
    dashboardLink: "แดชบอร์ด Mini Mart",
    description: "นี่คือหน้า POS ชั่วคราวสำหรับแม่แบบ {{templateName}} หน้าขายและขั้นตอนเฉพาะธุรกิจจะเพิ่มในระยะถัดไป",
    permanent: "{{templateName}} ถูกเลือกถาวรสำหรับบริบทธุรกิจ Phase A นี้",
    reviewSetup: "ตรวจสอบการตั้งค่า",
    statusCards: [
      "บันทึกบริบทแม่แบบแล้ว",
      "ตั้งค่าธุรกิจเสร็จแล้ว",
      "POS เฉพาะธุรกิจกำลังจะมา",
    ],
  },
  templateModules: {
    basic_reports: "รายงานพื้นฐาน",
    customer_credit: "เครดิตลูกค้า",
    customers: "ลูกค้า",
    delivery_notes: "ใบส่งของ",
    inventory: "สต๊อกสินค้า",
    multi_price_levels: "ราคาหลายระดับ",
    orders: "ออเดอร์",
    payments: "การชำระเงิน",
    pos: "POS",
    product_catalog: "แคตตาล็อกสินค้า",
    products: "สินค้า",
    purchase_orders: "ใบสั่งซื้อ",
    quotations: "ใบเสนอราคา",
    reports: "รายงาน",
    shipping: "การจัดส่ง",
    suppliers: "ซัพพลายเออร์",
  },
  templates: {
    beauty_salon: {
      description: "หน้าขายสำหรับร้านเสริมสวย ระบบบริการและการจองคิวจะเพิ่มภายหลัง",
      name: "ร้านเสริมสวย",
    },
    clothing: {
      description: "หน้าขายสำหรับร้านเสื้อผ้า ระบบขนาด สี และงานสินค้าแฟชันจะเพิ่มภายหลัง",
      name: "ร้านเสื้อผ้า",
    },
    coffee_shop: {
      description: "หน้าขายสำหรับร้านกาแฟ ตัวเลือกเมนูและขั้นตอนคาเฟ่จะเพิ่มภายหลัง",
      name: "ร้านกาแฟ",
    },
    mini_mart: {
      description: "ขายหน้าร้าน แคตตาล็อกสินค้า การขายด้วยบาร์โค้ด สต๊อกสินค้า และรายงานพื้นฐาน",
      name: "Mini Mart",
    },
    online_seller: {
      description: "จัดการออเดอร์ออนไลน์ ลูกค้า การชำระเงิน สถานะจัดส่ง เลขพัสดุ และยอดขายหลายช่องทาง",
      name: "ผู้ขายออนไลน์",
    },
    pharmacy: {
      description: "หน้าขายสำหรับร้านขายยา ขั้นตอนเฉพาะร้านขายยาจะเพิ่มภายหลัง",
      name: "ร้านขายยา",
    },
    restaurant: {
      description: "หน้าขายสำหรับร้านอาหาร ระบบโต๊ะและครัวจะเพิ่มภายหลัง",
      name: "ร้านอาหาร",
    },
    wholesale_store: {
      description: "ขายส่ง ราคาหลายระดับ เครดิตลูกค้า ใบส่งของ ใบเสนอราคา และการควบคุมสต๊อกจำนวนมาก",
      name: "ร้านขายส่ง",
    },
  } satisfies Record<BusinessTemplateType, { description: string; name: string }>,
};
