# Final Localization Gap Report

Audit mode: static source verification only. No feature code was modified.

Approved English technical terms excluded from gaps:

- POS
- QR
- VAT
- SKU
- PIN
- WiFi
- USB
- API
- Backup
- Cloud
- Login
- Username
- Password
- EGO POS

## Overall Result

NO-GO for final Lao localization.

The application still contains many user-facing English strings rendered directly from components. The largest blocker is that `lib/i18n/dictionaries.ts` contains mojibake Lao values, so even screens that use dictionary keys can still render broken Lao text.

This report groups repeated strings by route and source file. Each row lists the remaining English UI strings or string family found, whether a translation key is missing, and the recommended Lao translation pattern.

## Route Gap Table

| Route | Remaining English string | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/login` | `Show password`, `Hide password` aria labels | `components/auth/login-form.tsx` | Yes | `ສະແດງ Password`, `ເຊື່ອງ Password` |
| `/login` | Lao dictionary values are mojibake for auth/onboarding labels | `lib/i18n/dictionaries.ts` | Existing keys broken | Replace all broken values with valid UTF-8 Lao |
| `/dashboard` | `Today`, `This Week`, `This Month`, `This Year`, `Custom Date` | `features/dashboard/components/dashboard-date-range-controls.tsx` | Yes | `ມື້ນີ້`, `ອາທິດນີ້`, `ເດືອນນີ້`, `ປີນີ້`, `ກຳນົດວັນທີເອງ` |
| `/dashboard` | `Status`, `Current Shift`, `Current Cashier`, `Total sales`, `Total cash sales`, `Total bills`, `Total profit`, `Cash expected`, `Cash counted`, `Difference over/short` | `features/dashboard/components/close-day-panel.tsx` | Yes | `ສະຖານະ`, `ກະປັດຈຸບັນ`, `ແຄຊເຊຍປັດຈຸບັນ`, `ຍອດຂາຍລວມ`, `ຍອດຂາຍເງິນສົດ`, `ຈຳນວນບິນ`, `ກຳໄລລວມ`, `ເງິນສົດທີ່ຄວນມີ`, `ເງິນສົດທີ່ນັບໄດ້`, `ສ່ວນຕ່າງເກີນ/ຂາດ` |
| `/dashboard` | `Open shift`, `Closed shift`, `Opening cash`, `Expected cash`, `Counted cash`, `Difference`, `Close Day` | `features/dashboard/components/close-day-panel.tsx` | Yes | `ເປີດກະ`, `ປິດກະ`, `ເງິນເລີ່ມກະ`, `ເງິນທີ່ຄວນມີ`, `ເງິນທີ່ນັບໄດ້`, `ສ່ວນຕ່າງ`, `ປິດມື້` |
| `/dashboard`, `/pos`, authenticated layout | `Toggle customer display`, `Full screen`, `Exit full screen`, `Switch to light theme`, `Switch to dark theme` | `components/layout/customer-display-toggle.tsx`, `components/layout/full-screen-toggle.tsx`, `components/layout/theme-toggle.tsx` | Yes | `ເປີດ/ປິດຈໍລູກຄ້າ`, `ເຕັມຈໍ`, `ອອກຈາກເຕັມຈໍ`, `ປ່ຽນເປັນໂໝດສະຫວ່າງ`, `ປ່ຽນເປັນໂໝດມືດ` |
| `/dashboard`, `/pos`, authenticated layout | Notification titles/messages such as `Low stock`, `Near expiry`, `Dead stock`, `Cash difference`, `Low sales` | `components/layout/notification-center.tsx` | Partial | `ສິນຄ້າໃກ້ໝົດ`, `ໃກ້ໝົດອາຍຸ`, `ສິນຄ້າຄ້າງສະຕັອກ`, `ເງິນສົດບໍ່ກົງ`, `ຍອດຂາຍຕ່ຳ` |
| `/pos` | Search/scan placeholders: `Scan barcode / SKU / code`, `Search product, SKU, code`, `Phone, name, or member no.` | `features/pos/components/pos-page-client.tsx` | Yes | `ສະແກນບາໂຄດ / SKU / ລະຫັດ`, `ຄົ້ນຫາສິນຄ້າ, SKU, ລະຫັດ`, `ເບີໂທ, ຊື່ ຫຼື ເລກສະມາຊິກ` |
| `/pos` | Cart metadata: `Bill No.`, `Customer`, `Guest`, `Cashier`, `Current User`, `Time` | `features/pos/components/pos-page-client.tsx` | Yes | `ເລກບິນ`, `ລູກຄ້າ`, `ລູກຄ້າທົ່ວໄປ`, `ແຄຊເຊຍ`, `ຜູ້ໃຊ້ປັດຈຸບັນ`, `ເວລາ` |
| `/pos` | Cart/payment labels: `Cash`, `Bank`, `Card`, `Mixed`, `Paid`, `Due`, `Change`, `Total`, `Complete Sale`, `Sale completion failed.` | `features/pos/components/pos-page-client.tsx` | Yes | `ເງິນສົດ`, `ທະນາຄານ`, `ບັດ`, `ຈ່າຍປະສົມ`, `ຈ່າຍແລ້ວ`, `ຄ້າງຈ່າຍ`, `ເງິນທອນ`, `ລວມ`, `ສຳເລັດການຂາຍ`, `ການຂາຍບໍ່ສຳເລັດ` |
| `/pos` | Held bill controls: `Resume Bill`, `Hold Bill`, `Delete Held Bill`, `Held Bills`, `Cart is empty.` | `features/pos/components/pos-page-client.tsx` | Yes | `ກັບມາໃຊ້ບິນ`, `ພັກບິນ`, `ລຶບບິນທີ່ພັກ`, `ບິນທີ່ພັກ`, `ກະຕ່າຫວ່າງ` |
| `/pos` | Staff control labels: `Staff Control`, `Not Started`, `Working`, `Closed`, `Start Work`, `End Work`, `Start OT`, `End OT`, `Work Hours`, `OT Hours`, `Opening Cash Total`, `Closing Summary`, `Expected Cash`, `Actual Cash`, `Cash Difference` | `features/pos/components/pos-page-client.tsx` | Yes | `ຄວບຄຸມພະນັກງານ`, `ຍັງບໍ່ເລີ່ມ`, `ກຳລັງເຮັດວຽກ`, `ປິດແລ້ວ`, `ເລີ່ມວຽກ`, `ຈົບວຽກ`, `ເລີ່ມ OT`, `ຈົບ OT`, `ຊົ່ວໂມງວຽກ`, `ຊົ່ວໂມງ OT`, `ຍອດເງິນເລີ່ມກະ`, `ສະຫຼຸບປິດກະ`, `ເງິນທີ່ຄວນມີ`, `ເງິນທີ່ນັບໄດ້`, `ສ່ວນຕ່າງເງິນສົດ` |
| `/pos` | Product/cart messages: `No product found...`, `No favorites found`, `Select unit`, `Stock warning`, `Promotion applied` | `features/pos/components/pos-page-client.tsx` | Yes | `ບໍ່ພົບສິນຄ້າ`, `ບໍ່ພົບສິນຄ້າທີ່ມັກ`, `ເລືອກຫົວໜ່ວຍ`, `ແຈ້ງເຕືອນສະຕັອກ`, `ໃຊ້ໂປຣໂມຊັນແລ້ວ` |
| `/pos`, `/customer-display` | Customer display labels: `Membership Type`, `Points Balance`, `Discount Received`, `Subtotal`, `Promotion Discount`, `Cashier will select QR payment`, `Thank you` | `features/pos/components/customer-display-client.tsx` | Yes | `ປະເພດສະມາຊິກ`, `ຄະແນນຄົງເຫຼືອ`, `ສ່ວນຫຼຸດທີ່ໄດ້ຮັບ`, `ລວມຍ່ອຍ`, `ສ່ວນຫຼຸດໂປຣໂມຊັນ`, `ແຄຊເຊຍຈະເລືອກການຈ່າຍ QR`, `ຂອບໃຈ` |
| `/inventory` | Dashboard cards: `Total Products`, `Inventory Quantity`, `Inventory Value`, `Today's Stock In`, `Today's Adjustments`, `Fast Moving Products`, `Stock Alert Center` | `features/inventory/components/inventory-dashboard-cards.tsx` | Yes | `ຈຳນວນສິນຄ້າທັງໝົດ`, `ຈຳນວນສະຕັອກ`, `ມູນຄ່າສະຕັອກ`, `ຮັບເຂົ້າມື້ນີ້`, `ປັບສະຕັອກມື້ນີ້`, `ສິນຄ້າຂາຍໄວ`, `ສູນແຈ້ງເຕືອນສະຕັອກ` |
| `/inventory` | Alert labels and empty states: `Low stock`, `Dead stock`, `Expiring products`, `No low stock products`, `No dead stock products`, `No expiring products` | `features/inventory/components/inventory-alert-lists.tsx` | Yes | `ສິນຄ້າໃກ້ໝົດ`, `ສິນຄ້າຄ້າງສະຕັອກ`, `ສິນຄ້າໃກ້ໝົດອາຍຸ`, `ບໍ່ມີສິນຄ້າໃກ້ໝົດ`, `ບໍ່ມີສິນຄ້າຄ້າງສະຕັອກ`, `ບໍ່ມີສິນຄ້າໃກ້ໝົດອາຍຸ` |
| `/inventory` | Quick stock-in form labels: `Quick Stock In`, `Search product`, `Current Stock`, `Receiving Unit`, `Quantity`, `Conversion`, `After Stock`, `Unit Cost`, `Total Cost`, `Update Product Cost`, `Supplier`, `Payment Status`, `Invoice No.`, `Lot Number`, `Expiry Date`, `Confirm Stock In` | `features/inventory/components/quick-stock-in-form.tsx` | Yes | `ຮັບສະຕັອກດ່ວນ`, `ຄົ້ນຫາສິນຄ້າ`, `ສະຕັອກປັດຈຸບັນ`, `ຫົວໜ່ວຍຮັບເຂົ້າ`, `ຈຳນວນ`, `ການແປງຫົວໜ່ວຍ`, `ສະຕັອກຫຼັງຮັບ`, `ຕົ້ນທຶນຕໍ່ຫົວໜ່ວຍ`, `ຕົ້ນທຶນລວມ`, `ອັບເດດຕົ້ນທຶນສິນຄ້າ`, `ຜູ້ສະໜອງ`, `ສະຖານະການຈ່າຍ`, `ເລກໃບແຈ້ງໜີ້`, `ເລກລັອດ`, `ວັນໝົດອາຍຸ`, `ຢືນຢັນຮັບສະຕັອກ` |
| `/inventory` | Stock movement headers/actions: `Stock In`, `Stock Adjustment`, `Stock Count`, `Movement Type`, `Before`, `After`, `By`, `Print`, `Download PDF` | `features/inventory/components/inventory-action-form.tsx`, `features/inventory/components/stock-movement-history.tsx` | Yes | `ຮັບເຂົ້າ`, `ປັບສະຕັອກ`, `ນັບສະຕັອກ`, `ປະເພດການເຄື່ອນໄຫວ`, `ກ່ອນ`, `ຫຼັງ`, `ໂດຍ`, `ພິມ`, `ດາວໂຫຼດ PDF` |
| `/purchasing` | Dashboard/card labels: `Supplier Snapshot`, `Supplier Credit`, `Outstanding LAK`, `Outstanding THB`, `Outstanding USD`, `Purchase Orders`, `New Purchase Order`, `Receive Goods`, `Pay Supplier`, `Supplier List` | `features/purchasing/components/purchasing-page-client.tsx` | Yes | `ພາບລວມຜູ້ສະໜອງ`, `ເຄຣດິດຜູ້ສະໜອງ`, `ຍອດຄ້າງ LAK`, `ຍອດຄ້າງ THB`, `ຍອດຄ້າງ USD`, `ໃບສັ່ງຊື້`, `ສ້າງໃບສັ່ງຊື້`, `ຮັບສິນຄ້າ`, `ຈ່າຍຜູ້ສະໜອງ`, `ລາຍຊື່ຜູ້ສະໜອງ` |
| `/purchasing` | PO table/progress headers: `Ordered`, `Received`, `Remaining`, `Percentage`, `Progress`, `Created By`, `Last Modified`, `Actions` | `features/purchasing/components/purchasing-page-client.tsx` | Yes | `ສັ່ງແລ້ວ`, `ຮັບແລ້ວ`, `ຄົງເຫຼືອ`, `ເປີເຊັນ`, `ຄວາມຄືບໜ້າ`, `ສ້າງໂດຍ`, `ແກ້ໄຂລ່າສຸດ`, `ການກະທຳ` |
| `/purchasing` | PO/receiving/payables form messages and labels | `features/purchasing/components/purchase-order-form.tsx`, `features/purchasing/components/receiving-page-client.tsx`, `features/purchasing/components/payables-page-client.tsx` | Yes | Translate field-by-field: supplier, warehouse, item, quantity, unit cost, receive, payable, payment, due date |
| `/customers` | Dashboard cards: `Active Customers`, `Available Points`, `Outstanding Balance`, `New Customers This Month`, `VIP Customers`, `Customers With Debt`, `Birthday This Month`, `Top Customers`, `Lost Customers` | `features/customers/components/customers-list-client.tsx` | Yes | `ລູກຄ້າທີ່ໃຊ້ງານ`, `ຄະແນນທີ່ໃຊ້ໄດ້`, `ຍອດຄ້າງ`, `ລູກຄ້າໃໝ່ເດືອນນີ້`, `ລູກຄ້າ VIP`, `ລູກຄ້າມີໜີ້`, `ວັນເກີດເດືອນນີ້`, `ລູກຄ້າອັນດັບສູງ`, `ລູກຄ້າຂາດການຊື້` |
| `/customers` | Table headers: `Last Purchase`, `Lifetime Spending`, `Total Visits`, `Credit Balance`, `Customer Code`, `Phone`, `Email`, `Segment`, `Actions` | `features/customers/components/customers-list-client.tsx` | Yes | `ຊື້ລ່າສຸດ`, `ຍອດຊື້ສະສົມ`, `ຈຳນວນເຂົ້າຊື້`, `ຍອດເຄຣດິດ`, `ລະຫັດລູກຄ້າ`, `ເບີໂທ`, `ອີເມວ`, `ກຸ່ມລູກຄ້າ`, `ການກະທຳ` |
| `/customers` | Customer form labels: `Full Name`, `Phone Number`, `Address`, `Birthday`, `Internal Notes`, `Tags`, `Credit Limit`, `Membership Level` | `features/customers/components/customer-form.tsx` | Yes | `ຊື່ເຕັມ`, `ເບີໂທ`, `ທີ່ຢູ່`, `ວັນເກີດ`, `ໝາຍເຫດພາຍໃນ`, `ແທັກ`, `ວົງເງິນເຄຣດິດ`, `ລະດັບສະມາຊິກ` |
| `/customers` | Profile tabs: `Profile`, `Purchase History`, `Points History`, `Credit History`, `Notes` | `features/customers/components/customer-detail-client.tsx` | Yes | `ໂປຣໄຟລ໌`, `ປະຫວັດການຊື້`, `ປະຫວັດຄະແນນ`, `ປະຫວັດເຄຣດິດ`, `ໝາຍເຫດ` |
| `/membership` | Duration options: `Never expire`, `1 month`, `2 months`, `1 year`, `2 years`, `3 years` | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ບໍ່ໝົດອາຍຸ`, `1 ເດືອນ`, `2 ເດືອນ`, `1 ປີ`, `2 ປີ`, `3 ປີ` |
| `/membership` | Discount options: `Percent discount`, `Fixed amount discount LAK`, `Percent + rounding rule`, `No rounding`, `Round down`, `Round up`, `Round nearest` | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ສ່ວນຫຼຸດເປີເຊັນ`, `ສ່ວນຫຼຸດເປັນຈຳນວນ LAK`, `ເປີເຊັນ + ກົດການປັດ`, `ບໍ່ປັດ`, `ປັດລົງ`, `ປັດຂຶ້ນ`, `ປັດໃກ້ສຸດ` |
| `/membership` | Form/table/modal labels: `Level name`, `Minimum spend LAK`, `Discount percent`, `Welcome bonus points`, `Benefits description`, `Auto upgrade`, `Active`, `Customers`, `View/Edit`, `Level Detail` | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ຊື່ລະດັບ`, `ຍອດຊື້ຂັ້ນຕ່ຳ LAK`, `ເປີເຊັນສ່ວນຫຼຸດ`, `ຄະແນນຕ້ອນຮັບ`, `ລາຍລະອຽດສິດປະໂຫຍດ`, `ອັບເກຣດອັດຕະໂນມັດ`, `ໃຊ້ງານ`, `ລູກຄ້າ`, `ເບິ່ງ/ແກ້ໄຂ`, `ລາຍລະອຽດລະດັບ` |
| `/suppliers` | Summary cards/actions: `Active suppliers`, `Total credit limit`, `Outstanding balance`, `Total purchases`, `Total paid`, `Average monthly purchase`, `Last purchase date`, `Suppliers with debt`, `Credit exceeded`, `Documents` | `features/suppliers/components/suppliers-list-client.tsx` | Yes | `ຜູ້ສະໜອງທີ່ໃຊ້ງານ`, `ວົງເງິນເຄຣດິດລວມ`, `ຍອດຄ້າງ`, `ຍອດຊື້ລວມ`, `ຈ່າຍແລ້ວລວມ`, `ຍອດຊື້ສະເລ່ຍຕໍ່ເດືອນ`, `ວັນຊື້ລ່າສຸດ`, `ຜູ້ສະໜອງມີໜີ້`, `ເກີນວົງເຄຣດິດ`, `ເອກະສານ` |
| `/suppliers` | Table headers/actions: `Supplier code`, `Company name`, `Contact person`, `Credit limit`, `Outstanding`, `Rating`, `View`, `Edit`, `Record Payment`, `Create PO`, `Deactivate`, `Activate` | `features/suppliers/components/suppliers-list-client.tsx` | Yes | `ລະຫັດຜູ້ສະໜອງ`, `ຊື່ບໍລິສັດ`, `ຜູ້ຕິດຕໍ່`, `ວົງເງິນເຄຣດິດ`, `ຍອດຄ້າງ`, `ຄະແນນ`, `ເບິ່ງ`, `ແກ້ໄຂ`, `ບັນທຶກການຈ່າຍ`, `ສ້າງ PO`, `ປິດໃຊ້ງານ`, `ເປີດໃຊ້ງານ` |
| `/suppliers` | Supplier form/detail fields: `Tax number`, `Payment terms`, `Supplier rating`, `Products supplied`, `Purchase history`, `Payment history`, `Business License`, `Tax Certificate`, `Bank Account`, `Contract`, `Serviced Warehouses`, `Default Currency` | `features/suppliers/components/supplier-form.tsx`, `features/suppliers/components/supplier-detail-client.tsx` | Yes | `ເລກພາສີ`, `ເງື່ອນໄຂການຈ່າຍ`, `ຄະແນນຜູ້ສະໜອງ`, `ສິນຄ້າທີ່ສະໜອງ`, `ປະຫວັດການຊື້`, `ປະຫວັດການຈ່າຍ`, `ໃບອະນຸຍາດທຸລະກິດ`, `ໃບຢັ້ງຢືນພາສີ`, `ບັນຊີທະນາຄານ`, `ສັນຍາ`, `ຄັງສິນຄ້າທີ່ຮອງຮັບ`, `ສະກຸນເງິນຫຼັກ` |
| `/promotions` | Top buttons: `Create Promotion`, `Import`, `Export`, `Promotion Calendar`, `Promotion Analytics`, `Stack Rules`, `Integration Map` | `features/promotions/components/promotions-list-client.tsx` | Yes | `ສ້າງໂປຣໂມຊັນ`, `ນຳເຂົ້າ`, `ສົ່ງອອກ`, `ປະຕິທິນໂປຣໂມຊັນ`, `ວິເຄາະໂປຣໂມຊັນ`, `ກົດການຊ້ອນໂປຣໂມຊັນ`, `ແຜນຜັງການເຊື່ອມໂຍງ` |
| `/promotions` | Dashboard cards: `Active Promotions`, `Scheduled Promotions`, `Expiring Soon`, `Expired Promotions`, `Total Usage`, `Discount Given`, `Revenue Generated`, `Estimated Profit`, `Margin Impact`, `Risk Warnings` | `features/promotions/components/promotions-list-client.tsx` | Yes | `ໂປຣໂມຊັນທີ່ໃຊ້ງານ`, `ໂປຣໂມຊັນທີ່ກຳນົດໄວ້`, `ໃກ້ໝົດອາຍຸ`, `ໂປຣໂມຊັນໝົດອາຍຸ`, `ການໃຊ້ທັງໝົດ`, `ສ່ວນຫຼຸດທີ່ໃຫ້`, `ລາຍຮັບທີ່ສ້າງ`, `ກຳໄລຄາດຄະເນ`, `ຜົນກະທົບຕໍ່ມາຈິນ`, `ການເຕືອນຄວາມສ່ຽງ` |
| `/promotions` | Table/action strings: `Promotion Code`, `Promotion Name`, `Type Badge`, `Target`, `Branch`, `Date Range`, `Usage Count`, `Usage %`, `Health Score`, `Created By`, `Last Modified`, `More`, `Duplicate`, `Archive`, `Delete` | `features/promotions/components/promotions-list-client.tsx` | Yes | `ລະຫັດໂປຣໂມຊັນ`, `ຊື່ໂປຣໂມຊັນ`, `ປ້າຍປະເພດ`, `ເປົ້າໝາຍ`, `ສາຂາ`, `ຊ່ວງວັນທີ`, `ຈຳນວນການໃຊ້`, `% ການໃຊ້`, `ຄະແນນສຸຂະພາບ`, `ສ້າງໂດຍ`, `ແກ້ໄຂລ່າສຸດ`, `ເພີ່ມເຕີມ`, `ສຳເນົາ`, `ເກັບເຂົ້າຄັງ`, `ລຶບ` |
| `/promotions/new`, `/promotions/[id]/edit` | Wizard steps: `Basic Info & Template`, `Promotion Type & Discount Rules`, `Targeting & Schedule`, `Stacking, Approval & Profit Protection`, `Final Summary & Validation` | `features/promotions/components/promotion-form.tsx` | Yes | `ຂໍ້ມູນພື້ນຖານ ແລະ ແມ່ແບບ`, `ປະເພດໂປຣໂມຊັນ ແລະ ກົດສ່ວນຫຼຸດ`, `ເປົ້າໝາຍ ແລະ ຕາຕະລາງ`, `ການຊ້ອນ, ການອະນຸມັດ ແລະ ປ້ອງກັນກຳໄລ`, `ສະຫຼຸບ ແລະ ກວດສອບ` |
| `/promotions/new`, `/promotions/[id]/edit` | Template/type names: `Percentage Discount`, `Fixed Amount Discount`, `Buy 1 Get 1`, `Buy 2 Get 1`, `Bundle`, `Spend & Save`, `Free Gift`, `Coupon Promotion`, `Point Redemption`, `Happy Hour`, `Flash Sale`, `Near Expiry Clearance`, `Slow Moving Clearance`, `Mix & Match`, `Tiered Discount`, `Member Discount` | `features/promotions/components/promotion-form.tsx` | Yes | Translate all promotion names, for example `ສ່ວນຫຼຸດເປີເຊັນ`, `ສ່ວນຫຼຸດຈຳນວນເງິນ`, `ຊື້ 1 ແຖມ 1`, `ຂອງແຖມ`, `ຄູປອງ`, `ແລກຄະແນນ`, `ລົດລາຄາສິນຄ້າໃກ້ໝົດອາຍຸ` |
| `/promotions/new`, `/promotions/[id]/edit` | Validation/profit warnings: `Blocked: this promotion causes negative profit.`, `Approval required: margin below configured threshold.`, `Ready: promotion keeps profit above minimum margin.`, `Missing name`, `Missing target`, `Fix required` | `features/promotions/components/promotion-form.tsx` | Yes | `ຖືກບລັອກ: ໂປຣໂມຊັນນີ້ເຮັດໃຫ້ຂາດທຶນ`, `ຕ້ອງອະນຸມັດ: ມາຈິນຕ່ຳກວ່າກຳນົດ`, `ພ້ອມໃຊ້: ໂປຣໂມຊັນຍັງຮັກສາກຳໄລ`, `ຂາດຊື່`, `ຂາດເປົ້າໝາຍ`, `ຕ້ອງແກ້ໄຂ` |
| `/promotions/calendar`, `/promotions/analytics`, `/promotions/integration-map` | Page titles, cards, placeholder production-style text, chart/table labels | `features/promotions/components/promotion-calendar-client.tsx`, `features/promotions/components/promotion-analytics-client.tsx`, `features/promotions/components/promotion-integration-map-client.tsx` | Yes | Add Lao keys for every card, chart, table, empty state, and action in these pages |
| `/reports` | Report search/favorites text: `Search reports...`, `No reports found`, `Favorite reports`, `Recently opened reports`, `Pinned executive reports` | `features/reports/components/reports-analytics-client.tsx` | Partial | `ຄົ້ນຫາລາຍງານ...`, `ບໍ່ພົບລາຍງານ`, `ລາຍງານທີ່ມັກ`, `ລາຍງານທີ່ເປີດຫຼ້າສຸດ`, `ລາຍງານບໍລິຫານທີ່ປັກໝຸດ` |
| `/reports` | Filter options: `Today`, `Yesterday`, `This Week`, `This Month`, `Custom`, `All Branches`, `All Warehouses`, `All Categories`, `All Suppliers`, `All Cashiers`, `Apply`, `Reset` | `features/reports/components/reports-analytics-client.tsx` | Partial | `ມື້ນີ້`, `ມື້ວານ`, `ອາທິດນີ້`, `ເດືອນນີ້`, `ກຳນົດເອງ`, `ທຸກສາຂາ`, `ທຸກຄັງ`, `ທຸກໝວດ`, `ທຸກຜູ້ສະໜອງ`, `ທຸກແຄຊເຊຍ`, `ນຳໃຊ້`, `ຣີເຊັດ` |
| `/reports` | KPI/modal labels: `Total Revenue`, `Total Profit`, `Total Transactions`, `Total Customers`, `Average Bill Value`, `Items Sold`, `Inventory Value`, `Profit Margin %`, `View Sales Report`, `Export` | `features/reports/components/reports-analytics-client.tsx` | Partial | `ລາຍຮັບລວມ`, `ກຳໄລລວມ`, `ຈຳນວນທຸລະກຳ`, `ລູກຄ້າທັງໝົດ`, `ມູນຄ່າບິນສະເລ່ຍ`, `ຈຳນວນສິນຄ້າຂາຍ`, `ມູນຄ່າສະຕັອກ`, `% ມາຈິນກຳໄລ`, `ເບິ່ງລາຍງານຂາຍ`, `ສົ່ງອອກ` |
| `/reports` | Data source statuses: `Data Source Status`, `Sales synced`, `Inventory synced`, `Warning`, `Offline`, `Demo Data`, `Last updated` | `features/reports/components/reports-analytics-client.tsx` | Partial | `ສະຖານະແຫຼ່ງຂໍ້ມູນ`, `ຂໍ້ມູນຂາຍເຊື່ອມແລ້ວ`, `ຂໍ້ມູນສະຕັອກເຊື່ອມແລ້ວ`, `ແຈ້ງເຕືອນ`, `ອອບລາຍ`, `ຂໍ້ມູນທົດລອງ`, `ອັບເດດລ່າສຸດ` |
| `/settings` | Main section/card labels: `Company Profile`, `Receipt Settings`, `QR Payment Banks`, `Customer Display`, `Tax/VAT`, `Currency`, `Staff Control & Permissions`, `Approval Rules`, `Pending Approval Center` | `features/settings/components/settings-form.tsx` | Yes | `ໂປຣໄຟລ໌ບໍລິສັດ`, `ຕັ້ງຄ່າໃບຮັບເງິນ`, `ທະນາຄານຈ່າຍ QR`, `ຈໍລູກຄ້າ`, `Tax/VAT`, `ສະກຸນເງິນ`, `ຄວບຄຸມພະນັກງານ ແລະ ສິດ`, `ກົດການອະນຸມັດ`, `ສູນລໍຖ້າອະນຸມັດ` |
| `/settings` | QR bank/account labels: `Add Bank`, `Bank name`, `Short code`, `Bank logo upload`, `Sort order`, `Active / Inactive`, `Add QR Account`, `Account name`, `Account number`, `QR image`, `Set Default`, `Test QR / Preview QR`, `Print QR on receipt`, `Show QR on customer display` | `features/settings/components/settings-form.tsx` | Yes | `ເພີ່ມທະນາຄານ`, `ຊື່ທະນາຄານ`, `ລະຫັດຫຍໍ້`, `ອັບໂຫຼດໂລໂກ້ທະນາຄານ`, `ລຳດັບ`, `ໃຊ້ງານ / ບໍ່ໃຊ້`, `ເພີ່ມບັນຊີ QR`, `ຊື່ບັນຊີ`, `ເລກບັນຊີ`, `ຮູບ QR`, `ຕັ້ງເປັນຄ່າຫຼັກ`, `ທົດສອບ / ເບິ່ງຕົວຢ່າງ QR`, `ພິມ QR ໃນໃບຮັບເງິນ`, `ສະແດງ QR ໃນຈໍລູກຄ້າ` |
| `/settings` | Staff permission arrays: module names, actions `View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`, `Print`, POS controls, inventory controls, purchasing controls, customer controls, promotion controls, settings controls | `features/settings/components/settings-form.tsx` | Yes | Add Lao display map for every module/action/control, keeping approved technical terms unchanged |
| `/settings` | Staff login labels: `Add Staff`, `Edit Staff`, `Disable Staff`, `Reset Password`, `Change Role`, `Assign Branch`, `Assigned POS terminal`, `Require password change on first login`, `Allow Back Office access`, `Allow POS access` | `features/settings/components/settings-form.tsx` | Yes | `ເພີ່ມພະນັກງານ`, `ແກ້ໄຂພະນັກງານ`, `ປິດໃຊ້ພະນັກງານ`, `ຣີເຊັດ Password`, `ປ່ຽນບົດບາດ`, `ກຳນົດສາຂາ`, `POS ທີ່ກຳນົດ`, `ບັງຄັບປ່ຽນ Password ໃນການ Login ຄັ້ງທຳອິດ`, `ອະນຸຍາດເຂົ້າ Back Office`, `ອະນຸຍາດເຂົ້າ POS` |
| `/settings` | Approval/activity/ranking labels: `Request type`, `Requested by`, `Old value`, `New value`, `Approve`, `Reject`, `Staff Ranking`, `Staff Activity Monitor`, `Login time`, `Logout time`, `Bills created`, `Sales amount` | `features/settings/components/settings-form.tsx` | Yes | `ປະເພດຄຳຂໍ`, `ຮ້ອງຂໍໂດຍ`, `ຄ່າເກົ່າ`, `ຄ່າໃໝ່`, `ອະນຸມັດ`, `ປະຕິເສດ`, `ອັນດັບພະນັກງານ`, `ຕິດຕາມກິດຈະກຳພະນັກງານ`, `ເວລາ Login`, `ເວລາອອກຈາກລະບົບ`, `ບິນທີ່ສ້າງ`, `ຍອດຂາຍ` |
| `/igo-admin/login` | `Unable to sign in.`, `Show password`, `Hide password` | `components/igo-admin/admin-login-form.tsx` | Yes | `ບໍ່ສາມາດ Login ໄດ້`, `ສະແດງ Password`, `ເຊື່ອງ Password` |
| `/igo-admin` | Data-driven dashboard values may remain English: `Active`, `Suspended`, `New Registrations`, plan/template/status labels | `components/igo-admin/*`, `app/igo-admin/page.tsx` | Partial | Add display mappers: `ໃຊ້ງານ`, `ຖືກລະງັບ`, `ການລົງທະບຽນໃໝ່`, localized plan/template/status labels |
| `/igo-admin/businesses` | Business table status/template/plan values, action labels if sourced from data | `app/igo-admin/businesses/page.tsx`, `components/igo-admin/*` | Partial | Localize status/template/plan display values before render |
| `/igo-admin/users` | User status/role values such as `Active`, `Blocked`, `Owner`, `Manager`, `Cashier` | `app/igo-admin/users/page.tsx`, `components/igo-admin/*` | Partial | `ໃຊ້ງານ`, `ຖືກບລັອກ`, `ເຈົ້າຂອງ`, `ຜູ້ຈັດການ`, `ແຄຊເຊຍ` |
| `/igo-admin/subscriptions` | Plan/action values: `Free`, `Premium`, `Upgrade`, `Downgrade`, `Unlock`, `Feature locked` | `app/igo-admin/subscriptions/page.tsx`, `components/igo-admin/*` | Partial | `ຟຣີ`, `ພຣີມຽມ`, `ອັບເກຣດ`, `ດາວເກຣດ`, `ປົດລັອກ`, `ຟີເຈີຖືກລັອກ` |
| `/igo-admin/audit-logs` | Stored module/action values: `Created`, `Edited`, `Activated`, `Deleted`, `Login`, `Permission changed` | `app/igo-admin/audit-logs/page.tsx`, `components/igo-admin/*` | Partial | Localize via audit event display map: `ສ້າງ`, `ແກ້ໄຂ`, `ເປີດໃຊ້`, `ລຶບ`, `Login`, `ປ່ຽນສິດ` |

## Untranslated Button Groups

| Route | Buttons found in English | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/pos` | `Find Member`, `Complete Sale`, `Resume Bill`, `Hold Bill`, `Delete Held Bill`, `Start Work`, `End Work`, `Start OT`, `End OT` | `features/pos/components/pos-page-client.tsx` | Yes | `ຄົ້ນຫາສະມາຊິກ`, `ສຳເລັດການຂາຍ`, `ກັບມາໃຊ້ບິນ`, `ພັກບິນ`, `ລຶບບິນທີ່ພັກ`, `ເລີ່ມວຽກ`, `ຈົບວຽກ`, `ເລີ່ມ OT`, `ຈົບ OT` |
| `/inventory` | `Quick Stock In`, `Stock Count`, `Adjustment`, `Purchase Order`, `Goods Receiving`, `Confirm Stock In`, `Print`, `Download PDF` | `features/inventory/components/*.tsx` | Yes | `ຮັບສະຕັອກດ່ວນ`, `ນັບສະຕັອກ`, `ປັບສະຕັອກ`, `ໃບສັ່ງຊື້`, `ຮັບສິນຄ້າ`, `ຢືນຢັນຮັບສະຕັອກ`, `ພິມ`, `ດາວໂຫຼດ PDF` |
| `/purchasing` | `New Purchase Order`, `Receive Goods`, `Pay Supplier`, `Supplier List`, `Pay Now`, `View Detail` | `features/purchasing/components/*.tsx` | Yes | `ສ້າງໃບສັ່ງຊື້`, `ຮັບສິນຄ້າ`, `ຈ່າຍຜູ້ສະໜອງ`, `ລາຍຊື່ຜູ້ສະໜອງ`, `ຈ່າຍຕອນນີ້`, `ເບິ່ງລາຍລະອຽດ` |
| `/customers` | `Import Customers`, `Export Customers`, `View`, `Edit`, `Save`, `Cancel` | `features/customers/components/*.tsx` | Yes | `ນຳເຂົ້າລູກຄ້າ`, `ສົ່ງອອກລູກຄ້າ`, `ເບິ່ງ`, `ແກ້ໄຂ`, `ບັນທຶກ`, `ຍົກເລີກ` |
| `/membership` | `Create`, `Edit`, `Delete`, `View`, `Save`, `Apply`, `Reset`, `Duplicate` | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ສ້າງ`, `ແກ້ໄຂ`, `ລຶບ`, `ເບິ່ງ`, `ບັນທຶກ`, `ນຳໃຊ້`, `ຣີເຊັດ`, `ສຳເນົາ` |
| `/suppliers` | `Create Purchase Order`, `Receive Goods`, `Record Payment`, `Supplier Ledger`, `Edit Supplier`, `Deactivate Supplier` | `features/suppliers/components/supplier-detail-client.tsx` | Yes | `ສ້າງໃບສັ່ງຊື້`, `ຮັບສິນຄ້າ`, `ບັນທຶກການຈ່າຍ`, `ບັນຊີເຄື່ອນໄຫວຜູ້ສະໜອງ`, `ແກ້ໄຂຜູ້ສະໜອງ`, `ປິດໃຊ້ຜູ້ສະໜອງ` |
| `/promotions` | `Create Promotion`, `Import`, `Export`, `Duplicate`, `Activate`, `Deactivate`, `Archive`, `Delete`, `Save Draft`, `Submit for Approval`, `Save & Activate` | `features/promotions/components/*.tsx` | Yes | `ສ້າງໂປຣໂມຊັນ`, `ນຳເຂົ້າ`, `ສົ່ງອອກ`, `ສຳເນົາ`, `ເປີດໃຊ້`, `ປິດໃຊ້`, `ເກັບເຂົ້າຄັງ`, `ລຶບ`, `ບັນທຶກແບບຮ່າງ`, `ສົ່ງຂໍອະນຸມັດ`, `ບັນທຶກ ແລະ ເປີດໃຊ້` |
| `/reports` | `Apply`, `Reset`, `Export`, `Print`, `Schedule`, `Favorites`, `View Sales Report`, `Create Promotion`, `Create Purchase Order` | `features/reports/components/reports-analytics-client.tsx` | Partial | `ນຳໃຊ້`, `ຣີເຊັດ`, `ສົ່ງອອກ`, `ພິມ`, `ຕັ້ງເວລາ`, `ລາຍການທີ່ມັກ`, `ເບິ່ງລາຍງານຂາຍ`, `ສ້າງໂປຣໂມຊັນ`, `ສ້າງໃບສັ່ງຊື້` |
| `/settings` | `Save Settings`, `Add Bank`, `Add QR Account`, `Set Default`, `Approve`, `Reject`, `Select all`, `Clear all`, `Reset to default`, `Copy Manager permissions to Staff` | `features/settings/components/settings-form.tsx` | Yes | `ບັນທຶກການຕັ້ງຄ່າ`, `ເພີ່ມທະນາຄານ`, `ເພີ່ມບັນຊີ QR`, `ຕັ້ງເປັນຄ່າຫຼັກ`, `ອະນຸມັດ`, `ປະຕິເສດ`, `ເລືອກທັງໝົດ`, `ລ້າງທັງໝົດ`, `ກັບຄ່າມາດຕະຖານ`, `ຄັດລອກສິດຜູ້ຈັດການໄປພະນັກງານ` |

## Untranslated Table Header Groups

| Route | Table headers still English | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/pos` | Cart/item/payment mini table headers and receipt preview rows | `features/pos/components/pos-page-client.tsx` | Yes | Translate item, quantity, unit, price, total, paid, due, change |
| `/inventory` | `Time`, `Stock In No.`, `Type`, `Product`, `Unit`, `Entered Qty`, `Base Qty`, `Before`, `After`, `Supplier`, `Payment Status`, `Invoice No.`, `By` | `features/inventory/components/stock-movement-history.tsx` | Yes | `ເວລາ`, `ເລກຮັບສະຕັອກ`, `ປະເພດ`, `ສິນຄ້າ`, `ຫົວໜ່ວຍ`, `ຈຳນວນທີ່ປ້ອນ`, `ຈຳນວນຫົວໜ່ວຍຖານ`, `ກ່ອນ`, `ຫຼັງ`, `ຜູ້ສະໜອງ`, `ສະຖານະການຈ່າຍ`, `ເລກໃບແຈ້ງໜີ້`, `ໂດຍ` |
| `/purchasing` | PO, receiving, payable, supplier tables | `features/purchasing/components/*.tsx` | Yes | Add Lao table-header map for purchasing entities |
| `/customers` | Customer, purchase history, points history, credit history tables | `features/customers/components/*.tsx` | Yes | Add Lao table-header map for customer CRM |
| `/membership` | `Name`, `Min Spend`, `Discount`, `Customers`, `Status`, `Actions`, discount detail columns | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ຊື່`, `ຍອດຂັ້ນຕ່ຳ`, `ສ່ວນຫຼຸດ`, `ລູກຄ້າ`, `ສະຖານະ`, `ການກະທຳ` |
| `/suppliers` | Supplier list, product supplied, ledger, PO history, receiving history, payment history headers | `features/suppliers/components/*.tsx` | Yes | Add Lao table-header map for supplier management |
| `/promotions` | Promotion list, audit history, forecast, validation, recommendation tables | `features/promotions/components/*.tsx` | Yes | Add Lao table-header map for promotions |
| `/reports` | Report detail tables, modal tables, export preview tables | `features/reports/components/reports-analytics-client.tsx` | Partial | Add Lao table-header map for every report template |
| `/settings` | Pending approvals, staff activity, permission matrix, QR bank/account lists | `features/settings/components/settings-form.tsx` | Yes | Add Lao table-header map for settings management |
| `/igo-admin/*` | Business/user/subscription/audit table data values | `app/igo-admin/**/*.tsx`, `components/igo-admin/*.tsx` | Partial | Add Lao display mappers for statuses, plans, roles, modules, and actions |

## Untranslated Form Label Groups

| Route | Form label group | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/pos` | Membership search, payment amount fields, staff cash-count fields | `features/pos/components/pos-page-client.tsx` | Yes | Translate all form labels while keeping POS/PIN approved terms |
| `/inventory` | Quick stock-in, stock adjustment, stock count forms | `features/inventory/components/*.tsx` | Yes | Translate product, unit, quantity, cost, supplier, invoice, lot, expiry, note |
| `/purchasing` | PO, receiving, supplier payment forms | `features/purchasing/components/*.tsx` | Yes | Translate supplier, warehouse, item, quantity, price, payment, due date |
| `/customers` | Customer profile and credit forms | `features/customers/components/*.tsx` | Yes | Translate customer code, name, phone, email, address, birthday, points, credit |
| `/membership` | Membership level, duration, discount, color, benefits forms | `features/membership-levels/components/membership-levels-client.tsx` | Yes | Translate all level setup labels |
| `/suppliers` | Supplier profile, address, payment terms, rating, tags, documents forms | `features/suppliers/components/*.tsx` | Yes | Translate all supplier setup labels |
| `/promotions` | Five-step wizard fields and selector modal filters | `features/promotions/components/promotion-form.tsx` | Yes | Translate all wizard fields and selector labels |
| `/reports` | Filter bar, schedule modal, export modal, column visibility controls | `features/reports/components/reports-analytics-client.tsx` | Partial | Translate all report form labels |
| `/settings` | Company, receipt, QR bank/account, staff, permission, approval, tax, currency forms | `features/settings/components/settings-form.tsx` | Yes | Translate all settings form labels |
| `/igo-admin/login` | Admin login error and aria labels | `components/igo-admin/admin-login-form.tsx` | Yes | `ບໍ່ສາມາດ Login ໄດ້`, `ສະແດງ Password`, `ເຊື່ອງ Password` |

## Untranslated Modal Groups

| Route | Modal group | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/reports` | KPI detail, hour detail, day detail, category analytics, data source status, schedule, export, print modals | `features/reports/components/reports-analytics-client.tsx` | Partial | Add Lao modal title/body/action keys for each report modal |
| `/promotions` | Detail, duplicate, delete, archive, activate/deactivate, selectors, risk, stack rules, approval queue, near-expiry, slow-moving, validation modals | `features/promotions/components/*.tsx` | Yes | Add Lao modal title/body/action keys for each promotion modal |
| `/settings` | Add/edit bank, delete bank, add/edit QR account, staff management, pending approval, permission copy/reset dialogs | `features/settings/components/settings-form.tsx` | Yes | Add Lao modal title/body/action keys for each settings modal |
| `/suppliers` | Supplier detail, outstanding invoices, PO detail, receiving detail, payment detail, ledger, document placeholders | `features/suppliers/components/*.tsx` | Yes | Add Lao modal title/body/action keys for each supplier modal |
| `/membership` | Summary-card lists, level detail, delete confirmation, color/card preview, discount detail | `features/membership-levels/components/membership-levels-client.tsx` | Yes | Add Lao modal title/body/action keys for each membership modal |
| `/customers` | Customer profile, credit detail, analytics, import/export, membership QR/card dialogs | `features/customers/components/*.tsx` | Yes | Add Lao modal title/body/action keys for each customer modal |
| `/inventory` | Quick stock-in confirmation, print/download placeholder, stock detail, alert expansions | `features/inventory/components/*.tsx` | Yes | Add Lao modal title/body/action keys for each inventory modal |
| `/purchasing` | New PO, supplier profile placeholder, pay supplier, receiving/progress detail | `features/purchasing/components/*.tsx` | Yes | Add Lao modal title/body/action keys for each purchasing modal |

## Untranslated Empty State Groups

| Route | Empty state | File path | Translation key missing? | Recommended Lao translation |
|---|---|---|---|---|
| `/pos` | `Cart is empty.`, `No favorites found`, no product/search result messages | `features/pos/components/pos-page-client.tsx` | Yes | `ກະຕ່າຫວ່າງ`, `ບໍ່ພົບສິນຄ້າທີ່ມັກ`, `ບໍ່ພົບສິນຄ້າ` |
| `/inventory` | No alert/no movement/no stock-in empty states | `features/inventory/components/*.tsx` | Yes | `ບໍ່ມີລາຍການ`, `ບໍ່ມີການເຄື່ອນໄຫວ`, `ບໍ່ມີການຮັບເຂົ້າມື້ນີ້` |
| `/purchasing` | Empty supplier/credit/PO/receiving/payable states | `features/purchasing/components/*.tsx` | Yes | `ບໍ່ມີຜູ້ສະໜອງ`, `ບໍ່ມີເຄຣດິດຄ້າງ`, `ບໍ່ມີໃບສັ່ງຊື້` |
| `/customers` | Empty customer/top/birthday/credit/analytics states | `features/customers/components/*.tsx` | Yes | `ບໍ່ມີລູກຄ້າ`, `ບໍ່ມີລູກຄ້າອັນດັບສູງ`, `ບໍ່ມີວັນເກີດເດືອນນີ້` |
| `/membership` | Empty level/list/referenced-level/card preview states | `features/membership-levels/components/membership-levels-client.tsx` | Yes | `ບໍ່ມີລະດັບສະມາຊິກ`, `ບໍ່ມີລະດັບທີ່ຖືກໃຊ້`, `ຕົວຢ່າງບັດສະມາຊິກ` |
| `/suppliers` | Empty suppliers, invoices, ledger, documents, products supplied states | `features/suppliers/components/*.tsx` | Yes | `ບໍ່ມີຜູ້ສະໜອງ`, `ບໍ່ມີໃບແຈ້ງໜີ້`, `ບໍ່ມີບັນຊີເຄື່ອນໄຫວ`, `ບໍ່ມີເອກະສານ`, `ບໍ່ມີສິນຄ້າທີ່ສະໜອງ` |
| `/promotions` | Empty promotion list, selector, audit, recommendation, validation, calendar states | `features/promotions/components/*.tsx` | Yes | `ບໍ່ມີໂປຣໂມຊັນ`, `ບໍ່ພົບລາຍການໃຫ້ເລືອກ`, `ບໍ່ມີປະຫວັດ`, `ບໍ່ມີຄຳແນະນຳ`, `ບໍ່ມີຂໍ້ຜິດພາດ`, `ບໍ່ມີລາຍການໃນປະຕິທິນ` |
| `/reports` | `No reports found`, no chart/no table/no source-data empty states | `features/reports/components/reports-analytics-client.tsx` | Partial | `ບໍ່ພົບລາຍງານ`, `ບໍ່ມີຂໍ້ມູນກຣາຟ`, `ບໍ່ມີຂໍ້ມູນຕາຕະລາງ`, `ບໍ່ມີຂໍ້ມູນແຫຼ່ງຂໍ້ມູນ` |
| `/settings` | No QR banks/accounts, no staff, no pending approvals, no activity, no permissions search results | `features/settings/components/settings-form.tsx` | Yes | `ຍັງບໍ່ມີທະນາຄານ QR`, `ຍັງບໍ່ມີບັນຊີ QR`, `ຍັງບໍ່ມີພະນັກງານ`, `ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ`, `ບໍ່ມີກິດຈະກຳ`, `ບໍ່ພົບສິດ` |
| `/igo-admin/*` | Empty business/user/subscription/audit lists | `app/igo-admin/**/*.tsx`, `components/igo-admin/*.tsx` | Partial | `ບໍ່ມີທຸລະກິດ`, `ບໍ່ມີຜູ້ໃຊ້`, `ບໍ່ມີສະມາຊິກແພັກເກດ`, `ບໍ່ມີບັນທຶກການກະທຳ` |

## Hardcoded String Categories

| Category | Status | Examples | Main files |
|---|---|---|---|
| Accessibility labels | FAIL | `Show password`, `Hide password`, fullscreen/theme/customer-display aria labels | `components/auth/login-form.tsx`, `components/igo-admin/admin-login-form.tsx`, `components/layout/*.tsx` |
| Buttons | FAIL | POS, inventory, purchasing, customers, membership, suppliers, promotions, reports, settings actions | `features/**/components/*.tsx` |
| Table headers | FAIL | Product, inventory, purchasing, customer, supplier, promotion, report, settings tables | `features/**/components/*.tsx` |
| Form labels/placeholders | FAIL | Search inputs, setup forms, staff forms, QR bank forms, promotion wizard fields | `features/**/components/*.tsx` |
| Modals/dialogs | FAIL | Confirmation, detail, selector, risk, export/import, approval, data-source modals | `features/**/components/*.tsx` |
| Empty states | FAIL | No results, no reports, no alerts, no QR banks, no promotions, no suppliers | `features/**/components/*.tsx` |
| Data-driven statuses | PARTIAL | Active, Inactive, Pending, Approved, Draft, Paid, Partial, Overdue, roles, plans | `features/**/components/*.tsx`, `app/igo-admin/**/*.tsx` |
| Lao dictionary encoding | FAIL | Mojibake values in dictionary file | `lib/i18n/dictionaries.ts` |

## Route Summary

| Route | Localization status |
|---|---|
| `/login` | FAIL. Aria labels and dictionary values need repair. |
| `/dashboard` | FAIL. Date controls, close-day, and shared header strings remain English. |
| `/pos` | FAIL. Most cashier-facing labels, buttons, messages, staff control, and receipt/customer-display strings remain English. |
| `/inventory` | FAIL. Dashboard cards, alerts, quick stock-in, forms, history, and empty states remain English. |
| `/purchasing` | FAIL. Dashboard cards, supplier cards, PO table, forms, and modals remain English. |
| `/customers` | FAIL. CRM cards, table headers, forms, profile tabs, modals, and empty states remain English. |
| `/membership` | FAIL. Membership levels, duration/discount rules, table, forms, modals, and empty states remain English. |
| `/suppliers` | FAIL. Supplier list/detail, action buttons, forms, modals, ledger, products supplied, and empty states remain English. |
| `/promotions` | FAIL. Management page, wizard, modals, reports, analytics, calendar, integration map, and validation strings remain English. |
| `/reports` | PARTIAL/FAIL. Some i18n maps exist, but many filters, report names, source names, modal labels, table headers, and tooltips remain English. |
| `/settings` | FAIL. Most settings sections, QR bank/account management, staff permission matrix, approval center, and messages remain English. |
| `/igo-admin` | PARTIAL. Main labels are partly localized, but login error/aria and data-driven values still need Lao display mapping. |
| `/igo-admin/businesses` | PARTIAL. Data-driven status/template/plan values need Lao display mapping. |
| `/igo-admin/users` | PARTIAL. Role/status values need Lao display mapping. |
| `/igo-admin/subscriptions` | PARTIAL. Plan/status/action values need Lao display mapping. |
| `/igo-admin/audit-logs` | PARTIAL. Stored module/action values need Lao display mapping. |

## Recommended Fix Order

1. Repair `lib/i18n/dictionaries.ts` Lao mojibake first.
2. Add a strict central `t(key)` helper and route all UI through it.
3. Localize shared layout, auth, sidebar, notifications, theme/fullscreen/customer-display controls.
4. Localize POS and Customer Display next because these are customer/cashier-facing.
5. Localize Settings because permission, QR, receipt, VAT, currency, and staff access labels are high-impact.
6. Localize Inventory and Purchasing operational flows.
7. Localize Customers, Membership, Suppliers, Promotions, and Reports.
8. Add Lao display mappers for data-driven values: statuses, roles, plans, templates, payment statuses, approval statuses, audit actions.
9. Add a static CI check to block new hardcoded user-facing strings in `.tsx` files.

## Verification Commands Used

Static examples used during audit:

```text
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\pos components\layout -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\inventory -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\purchasing -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\customers -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\membership-levels -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\suppliers -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\promotions -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\reports -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' features\settings -g "*.tsx"
rg -n '\x22[A-Z][^\x22]{2,}\x22' "app\(igo-admin)" components\igo-admin -g "*.tsx"
```

## Final Audit Conclusion

Full Lao localization is not complete. The system should not be marked localization-ready until the dictionary mojibake is repaired, all hardcoded user-facing strings are moved into translation keys, and data-driven values are mapped to Lao display labels.
