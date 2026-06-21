# EGO POS Master Specification v1.0

Company: IGO Technology
Product Name: EGO POS
Primary Store: Go BOX
Slogan: Simple. Smart. Fast.
Status: Master Specification

---

## 1. Product Vision

EGO POS is a modern POS and retail management platform for mini marts, convenience stores, grocery stores, and retail businesses in Laos.

The first real-world store is Go BOX. After internal testing, EGO POS will become a SaaS platform that other stores can register and use by themselves.

Core goals:

* Simple to use
* Smart business insights
* Fast sales operation
* Modern UX/UI
* Lao + English support
* Web App first
* Android App in the future
* SaaS-ready from day one

---

## 2. Technology Stack

Recommended stack:

* Frontend: Next.js
* Backend: Supabase
* Database: PostgreSQL
* Authentication: Supabase Auth
* Storage: Supabase Storage
* Hosting: Vercel
* CDN / Security: Cloudflare
* Future Mobile App: Flutter

---

## 3. Branding

System Name:

EGO POS

Company:

IGO Technology

Primary Store:

Go BOX

Free Plan Receipt Branding:

Powered by EGO POS

Paid Plan:

Can remove Powered by EGO POS.

---

## 4. Design System

Theme:

* Dark Mode
* Light Mode

Default Mode:

Dark Mode

Colors:

* Primary: #04B0C7
* Background: #111827
* Card: #1F2937
* Accent: #B940B1
* Success: #10B981
* Warning: #F59E0B
* Danger: #EF4444
* Text Primary: #FFFFFF
* Text Secondary: #9CA3AF

Style:

* Modern
* Clean
* Touch-friendly
* Fast for cashier use
* Suitable for POS touchscreen

---

## 5. Language

Supported languages:

* Lao
* English

Default language:

Lao + English support from version 1.

---

## 6. Currency

Base selling currency:

* LAK

Supported payment currencies:

* LAK
* THB
* USD

Selling price is stored mainly in LAK.

Purchase cost can be entered in:

* LAK
* THB
* USD

The system converts purchase cost to LAK using the exchange rate configured by the store.

Example:

Cost = 10 THB
Exchange rate = 750 LAK
Converted cost = 7,500 LAK

Profit is calculated in LAK.

---

## 7. Business Structure

EGO POS must support:

* Multi Company
* Multi Branch
* Multi Warehouse

Structure:

Company
â†’ Branch
â†’ Warehouse

A user can belong to multiple companies.

---

## 8. SaaS Model

EGO POS will support stores registering by themselves.

Registration flow:

Register
â†’ Create Company
â†’ Create Main Branch
â†’ Create Default Warehouse
â†’ Start using POS

Plans:

* Free
* Starter
* Pro
* Business
* Enterprise

Free Plan:

* Free forever
* Feature limits controlled by Super Admin
* Powered by EGO POS displayed on receipt

Paid Plan:

* Can unlock more features
* Can remove Powered by EGO POS
* Can use custom branding
* Can enable advanced reports, permissions, promotions, etc.

Super Admin must be able to control which features are enabled or disabled per plan and per store.

---

## 9. Super Admin

Super Admin belongs to IGO Technology.

Super Admin can:

* View all stores
* View store data
* Suspend stores
* Delete stores
* Enable / disable stores
* Manage plans
* Manage feature limits
* Access customer store data for support
* Impersonate store owner
* View system usage
* View audit logs

Every Super Admin action must be audit logged.

---

## 10. User Roles

Default roles:

* Super Admin
* Owner
* Manager
* Cashier
* Warehouse Staff

Custom roles must be supported.

Permission control:

Owner can define what each user can see and do.

Examples:

Cashier can:

* Sell products
* Print receipt
* Hold bill
* Resume bill

Cashier cannot unless allowed:

* View profit
* View cost
* Edit product
* Edit stock
* Delete products
* Access reports

---

## 11. Authentication & Security

Login methods:

* Username + Password
* PIN login in the future

Requirements:

* Multi-device login allowed
* Login history
* Device management
* Logout device
* Disable or delete employee account
* Password can be freely set by store owner
* No strict uppercase/lowercase password rule required
* No temporary lock after wrong password attempts

Recommended security:

* Audit log
* Device log
* Optional email alert for suspicious login in the future

---

## 12. Product Management

Product must support:

* Lao name
* English name
* Barcode
* SKU
* Category
* Supplier
* Brand
* Image
* Cost price
* Selling price
* Multiple price fields if needed
* Expiry date
* Lot number
* Product status
* Soft delete / trash bin

Product search must support:

* Barcode
* SKU
* Lao name
* English name
* Category
* Supplier

Product images must be supported from version 1 because Go BOX already has images for 85-90% of products.

---

## 13. Multi Unit System

EGO POS must support selling and stock by multiple units.

Examples:

Water:

* 1 bottle
* 1 pack
* 1 carton

Beer:

* 1 can
* 1 pack
* 1 carton

Cigarette:

* 1 pack
* 1 carton

Each unit can have:

* Unit name
* Conversion quantity
* Barcode
* Selling price

Example:

Base unit = can
1 pack = 6 cans
1 carton = 24 cans

When selling 1 carton, system deducts 24 cans from stock.

---

## 14. Inventory Management

Inventory features:

* Stock in
* Stock out
* Stock adjustment
* Stock count
* Lot tracking
* Expiry tracking
* Low stock alert
* Dead stock report
* Stock movement history

Stock adjustment reasons:

* Damaged
* Expired
* Lost
* Count adjustment
* Manual correction

Multiple warehouses must be supported.

---

## 15. Purchasing & Supplier

Supplier features:

* Supplier profile
* Supplier phone
* Supplier address
* Supplier note
* Supplier credit
* Outstanding payable

Purchase features:

* Purchase order
* Receive stock
* Partial receive
* Purchase cost in LAK / THB / USD
* Convert cost to LAK
* Track unpaid supplier balance

---

## 16. POS Sales

POS must support:

* Barcode scan
* USB scanner
* Bluetooth scanner
* Product search
* Touch product cards
* Cart
* Discount
* Promotion
* Hold bill
* Resume bill
* Refund
* Receipt printing
* Customer selection
* Payment split

Payment methods:

* Cash
* Bank transfer
* QR
* Visa
* MasterCard

POS must support both:

* Fast barcode scanning
* Touchscreen product selection

---

## 17. Customer Display

EGO POS must support customer-facing display.

Customer display shows:

* Product name
* Quantity
* Price
* Discount
* Promotion
* Total
* Payment amount
* Change amount
* QR member registration
* Promotion screen

This can be used on a second monitor or tablet.

---

## 18. Customer Membership

Customer profile fields:

* Name
* Phone
* Birthday
* Gender
* Address
* ID card
* Passport
* QR member code
* Points
* Purchase history

QR member card must be supported.

Customers can register by scanning QR.

---

## 19. Store Subscription Program

This is different from SaaS subscription.

Store owners can create their own subscription plans for their customers.

Examples:

* Student
* General
* VIP

Each plan can define:

* Monthly price
* Yearly price
* Discount
* Benefits
* Start date
* End date
* Expiry status
* Auto-renew support in the future

System must report:

* Active subscribers
* Expiring soon
* Expired
* Subscription revenue

---

## 20. Promotion Engine

Promotion must be flexible.

Supported promotions:

* Buy 1 Get 1
* Buy X Get Y
* Spend amount discount
* Percentage discount
* Fixed amount discount
* Coupon code
* Member discount
* Category promotion
* Product promotion

Promotion should use a rule builder style:

IF condition
THEN action

---

## 21. Bulk Price Update

System must support bulk price update:

* All products
* By category
* By supplier
* Selected products
* Increase by percentage
* Decrease by percentage
* Increase by fixed amount
* Decrease by fixed amount

Every price change must be recorded in price history.

---

## 22. Reports & Dashboard

Owner dashboard must be real-time.

Dashboard cards:

* Today sales
* Today profit
* Bill count
* Items sold
* Cash amount
* Transfer amount
* QR payment
* Card payment
* Top selling products
* Dead stock
* Low stock
* Expiring products
* Supplier due
* Membership expiry

Reports:

* Sales report
* Profit report
* Product report
* Inventory report
* Customer report
* Supplier report
* Finance report

---

## 23. Cash Management

System must support:

* Open shift
* Close shift
* Cash in
* Cash out
* Expected cash
* Actual cash
* Cash difference

Cash out examples:

* Plastic bags
* Cleaning expense
* Small store expenses

---

## 24. VAT & Tax

VAT must be optional.

Settings:

* VAT on / off
* VAT rate
* Product-level VAT support
* Store-level VAT support

---

## 25. Notification Center

Notification types:

* Low stock
* Expiry alert
* Supplier due
* Membership expiry
* Subscription expiry
* Sales alert
* System alert

Notification channels:

* In-app
* Email

Future:

* Mobile push notification

---

## 26. Audit System

Audit system is required from version 1.

Must track:

* Login
* Logout
* Sales
* Refund
* Product changes
* Price changes
* Stock changes
* Permission changes
* Settings changes
* Super Admin actions

Audit log must store:

* User
* Time
* Module
* Action
* Old data
* New data
* Device
* IP address

---

## 27. Approval Workflow

Approval should support:

* Large discount
* Refund
* Stock adjustment
* Sensitive setting changes

Owner or authorized manager can approve.

---

## 28. Backup & Recovery

Backup types:

* Cloud backup
* Local backup

Backup schedule:

* Daily

Restore must be supported.

---

## 29. Import / Export

Import supported:

* Products
* Stock
* Prices
* Customers
* Suppliers

Export supported:

* Products
* Stock
* Reports
* Sales
* Customers

Excel import/export must be supported because Go BOX has 5,000+ SKU.

---

## 30. Future Roadmap

Future modules:

* Owner mobile app
* Customer ordering app
* Delivery
* Product reservation
* AI Agent
* Marketplace
* Online ordering

AI Agent examples:

* What should I reorder?
* Which product is not selling?
* Why did profit decrease?
* What product will be out of stock soon?

---

## 31. Development Principle

Do not build the whole system at once.

Build phase by phase:

1. Foundation
2. Product
3. Inventory
4. Purchasing
5. POS
6. Customers
7. Promotions
8. Reports
9. Security
10. SaaS
11. Super Admin

End of Master Specification.

