import type { BusinessTemplateType } from "@/features/platform/platform-data";

export const platformLo = {
  appName: "EGO POS",
  platformEyebrow: "ແພລດຟອມ EGO POS",
  selectTemplateError: "ກະລຸນາເລືອກແມ່ແບບທຸລະກິດກ່ອນດຳເນີນຕໍ່.",
  setupSaveError: "ບໍ່ສາມາດບັນທຶກການຕັ້ງຄ່າທຸລະກິດໄດ້. ກະລຸນາລອງໃໝ່.",
  slogan: "ງ່າຍ. ສະຫຼາດ. ໄວ. ສຳລັບທຸກທຸລະກິດ.",
  templatePlaceholder: {
    dashboardLink: "ໜ້າຫຼັກ Mini Mart",
    description:
      "ນີ້ແມ່ນໜ້າ POS ຊົ່ວຄາວສຳລັບແມ່ແບບ {{templateName}}. ໜ້າຂາຍ ແລະ workflow ສະເພາະປະເພດທຸລະກິດຈະເພີ່ມໃນ phase ຕໍ່ໄປ.",
    permanent: "{{templateName}} ຖືກເລືອກແບບຖາວອນສຳລັບທຸລະກິດ Phase A ນີ້.",
    reviewSetup: "ກວດຄືນການຕັ້ງຄ່າ",
    statusCards: [
      "ບັນທຶກແມ່ແບບແລ້ວ",
      "ຕັ້ງຄ່າທຸລະກິດສຳເລັດ",
      "POS ສະເພາະປະເພດຈະມາພາຍຫຼັງ",
    ],
  },
  templateModules: {
    basic_reports: "ລາຍງານພື້ນຖານ",
    customer_credit: "ລູກຄ້າເຊື່ອ",
    customers: "ລູກຄ້າ",
    delivery_notes: "ໃບສົ່ງຂອງ",
    inventory: "ສາງສິນຄ້າ",
    multi_price_levels: "ລາຄາຫຼາຍລະດັບ",
    orders: "ອໍເດີ",
    payments: "ການຊຳລະເງິນ",
    pos: "POS",
    product_catalog: "ລາຍການສິນຄ້າ",
    products: "ສິນຄ້າ",
    purchase_orders: "ໃບສັ່ງຊື້",
    quotations: "ໃບສະເໜີລາຄາ",
    reports: "ລາຍງານ",
    shipping: "ການຈັດສົ່ງ",
    suppliers: "ຜູ້ສະໜອງ",
  },
  templates: {
    beauty_salon: {
      description: "ໜ້າຂາຍສຳລັບຮ້ານເສີມສວຍ. ລະບົບບໍລິການ ແລະ ຈອງຄິວຈະເພີ່ມພາຍຫຼັງ.",
      name: "ຮ້ານເສີມສວຍ",
    },
    clothing: {
      description: "ໜ້າຂາຍສຳລັບຮ້ານເສື້ອຜ້າ. ຂະໜາດ, ສີ ແລະ workflow ສິນຄ້າແຟຊັນຈະເພີ່ມພາຍຫຼັງ.",
      name: "ຮ້ານເສື້ອຜ້າ",
    },
    coffee_shop: {
      description: "ໜ້າຂາຍສຳລັບຮ້ານກາເຟ. ຕົວເລືອກເພີ່ມເຕີມ ແລະ workflow ຄາເຟຈະເພີ່ມພາຍຫຼັງ.",
      name: "ຮ້ານກາເຟ",
    },
    mini_mart: {
      description: "ຂາຍໜ້າຮ້ານ, ລາຍການສິນຄ້າ, ຂາຍດ້ວຍບາໂຄດ, ສາງສິນຄ້າ ແລະ ລາຍງານພື້ນຖານ.",
      name: "ມິນິມາດ",
    },
    online_seller: {
      description: "ຈັດການອໍເດີອອນລາຍ, ລູກຄ້າ, ການຊຳລະເງິນ, ການຈັດສົ່ງ, ເລກຕິດຕາມພັດສະດຸ ແລະ ການຂາຍຫຼາຍຊ່ອງທາງ.",
      name: "ຜູ້ຂາຍອອນລາຍ",
    },
    pharmacy: {
      description: "ໜ້າຂາຍສຳລັບຮ້ານຂາຍຢາ. workflow ສະເພາະຢາຈະເພີ່ມພາຍຫຼັງ.",
      name: "ຮ້ານຂາຍຢາ",
    },
    restaurant: {
      description: "ໜ້າຂາຍສຳລັບຮ້ານອາຫານ. ລະບົບໂຕະ ແລະ ຄົວຈະເພີ່ມພາຍຫຼັງ.",
      name: "ຮ້ານອາຫານ",
    },
    wholesale_store: {
      description: "ຈັດການການຂາຍສົ່ງ, ລາຄາຫຼາຍລະດັບ, ລູກຄ້າເຊື່ອ, ໃບສົ່ງຂອງ, ໃບສະເໜີລາຄາ ແລະ ການຄວບຄຸມສະຕັອກຈຳນວນຫຼາຍ.",
      name: "ຮ້ານຂາຍສົ່ງ",
    },
  } satisfies Record<BusinessTemplateType, { description: string; name: string }>,
};
