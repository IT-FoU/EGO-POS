"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Banknote, Barcode, CalendarDays, ChevronDown, ChevronUp, CreditCard, GraduationCap, Minus, Plus, Printer, QrCode, ReceiptText, RotateCcw, Search, ShoppingCart, Trash2, UserRoundSearch, WalletCards, X, } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HeldBillCartSnapshot, HeldSale, PaymentMode, PosCartItem, PosCashSessionContext, PosCustomer, PosDisplayState, PosLoyaltySettings, PosProduct, PosProductUnit, PosPromotion, PosReceiptSettings, QrBank, } from "@/features/pos/types";
import { PosProductImage } from "@/features/pos/components/pos-product-image";
import { OwnShiftReportModal } from "@/features/pos/components/own-shift-report-drawer";
import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import { ReturnExchangeVoidModal, type ReturnExchangeTab } from "@/features/pos/components/return-exchange-void-modal";
import { SaleStatusBadge, SaleStatusIndicator } from "@/features/pos/components/sale-status-badge";
import { resolveSaleStatusVisual } from "@/features/pos/sale-status-presentation";
import { formatLak } from "@/features/pos/format";
import {
    addPosCartLine,
    cartExceedsStock,
    cartSubtotal,
    filterPosCatalogue,
    findPosScanMatch,
    maxSellQty,
    productWithSaleUnit,
    removePosCartLine,
    updatePosCartQuantity,
    type AddPosCartResult,
} from "@/features/pos/pos-cart";
import { applyLoadedPromotions } from "@/features/promotions/promotion-checkout";
import { cn } from "@/lib/utils";
import { completeSaleAction } from "@/features/pos/actions";
import { receiptSnapshotFromPersistedSale } from "@/features/pos/checkout-receipt";
import {
  closeCashSessionRequest,
  fetchCurrentCashSession,
  openCashSessionRequest,
} from "@/features/pos/cash-session-client";
import {
  fetchRecentSales,
  fetchSaleReceipt,
  type PostSaleManagerApprovalPayload,
  refundSaleRequest,
  reprintSaleReceipt,
  voidSaleRequest,
} from "@/features/pos/post-sale-client";
import { cancelHeldBill, createHeldBill, fetchHeldBills, resumeHeldBill } from "@/features/pos/held-bills-client";
import { getFollowingPosSaleNo } from "@/features/pos/sale-no";
import { readCustomerDisplaySettingsFromStorage } from "@/features/pos/customer-display-settings";
import { readReceiptPrintModePreference } from "@/features/settings/receipt-print-mode";
import {
    demoAuditLogRepository,
    demoPendingApprovalRepository,
    demoProductsRepository,
    demoReceiptsRepository,
    demoSalesRepository,
} from "@/lib/demo/repositories";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { writeJsonToStorage } from "@/lib/demo/storage";
import {
    evaluatePosPermission,
    formatPosPermissionAction,
    POS_PERMISSION_DENIED_MESSAGE,
    type PosAuditEntry,
    type PosPendingApprovalRequest,
    type PosPermissionAction,
    type PosPermissionPolicy,
} from "@/features/pos/permissions";
import { STORE_ACTIONS, STORE_ROLES } from "@/features/permissions/store-permissions";
import { canUseStoreAction, resolveStoreUiRole } from "@/features/permissions/store-ui-permissions";
const OPENING_CASH_DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500] as const;
const HYDRATION_SAFE_TIME = "--:--";
const HYDRATION_SAFE_BUSINESS_DATE = "--";
const HYDRATION_SAFE_REFERENCE_DATE = new Date("2026-06-20T00:00:00");
type ReceiptPrintMode = "ask_every_time" | "auto_print" | "no_auto_print";
type ReceiptSnapshot = {
    branchName: string;
    cashierName: string;
    cartItems: PosCartItem[];
    changeAmount: number;
    createdAt: string;
    customerName: string;
    discountTotal: number;
    paidAmount: number;
    paymentMode: PaymentMode;
    receiptNo: string;
    saleNo: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
};
type DemoSaleStatus = "completed" | "paid" | "adjusted" | "exchanged" | "partial_refund" | "partial_refunded" | "refunded" | "voided" | "deleted";
type DemoSaleTimelineEvent = {
    at: string;
    label: string;
    user: string;
};
type DemoSaleRecord = {
    branchId: string;
    cashierName: string;
    changeAmount: number;
    createdAt: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    deletedAt?: string;
    deletedBy?: string;
    deleteReason?: string;
    discountAmount: number;
    discountPercent: number;
    id?: string;
    items: PosCartItem[];
    note?: string;
    paidAmount: number;
    paymentMode: PaymentMode;
    receiptNo: string;
    saleNo: string;
    status: DemoSaleStatus;
    subtotal: number;
    taxAmount: number;
    timeline: DemoSaleTimelineEvent[];
    totalAmount: number;
    warehouseId: string;
};

type ManagerApprovalRequest = {
    action: "refund" | "void";
    sale: DemoSaleRecord;
};
type ResolvedPayment = {
    cardAmount: number;
    cashAmount: number;
    changeAmount: number;
    paidAmount: number;
    qrAmount: number;
    transferAmount: number;
};
const POS_PRODUCT_GRID_VISIBILITY_KEY = "ego.pos.productGridVisible";

export function PosPageClient({ branchName, branchId, cashierName, cashSession, customers, demoMode, devDebug, loyaltySettings, nextSaleNo, posPermissionPolicy, products, promotionBanners, promotions = [], qrBanks, receiptSettings, taxInclusive, taxRatePercent, warehouseId, }: {
    branchId: string;
    branchName: string;
    cashierName: string;
    cashSession: PosCashSessionContext;
    customers: PosCustomer[];
    demoMode: boolean;
    devDebug?: boolean;
    loyaltySettings: PosLoyaltySettings;
    nextSaleNo: string;
    posPermissionPolicy: PosPermissionPolicy;
    products: PosProduct[];
    promotionBanners: string[];
    promotions?: PosPromotion[];
    qrBanks: QrBank[];
    receiptSettings: PosReceiptSettings;
    taxInclusive: boolean;
    taxRatePercent: number;
    warehouseId: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const checkoutInFlightRef = useRef(false);
    const postSaleInFlightRef = useRef(false);
    const [productQuery, setProductQuery] = useState("");
    const [membershipQuery, setMembershipQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [productGridVisible, setProductGridVisible] = useState(true);
    const [favoritesOpen, setFavoritesOpen] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [cashShiftCountOpen, setCashShiftCountOpen] = useState(false);
    const [heldBillsOpen, setHeldBillsOpen] = useState(false);
    const [memberSearchOpen, setMemberSearchOpen] = useState(false);
    const [cartCollapsed, setCartCollapsed] = useState(false);
    const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
    const [unitSelectionProduct, setUnitSelectionProduct] = useState<PosProduct | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [redeemPoints, setRedeemPoints] = useState(0);
    const [taxEnabled, setTaxEnabled] = useState(true);
    const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
    const [cashAmount, setCashAmount] = useState(0);
    const [qrAmount, setQrAmount] = useState(0);
    const [transferAmount, setTransferAmount] = useState(0);
    const [cardAmount, setCardAmount] = useState(0);
    const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
    const [heldBillsLoaded, setHeldBillsLoaded] = useState(false);
    const [recentSalesLoaded, setRecentSalesLoaded] = useState(false);
    const [selectedHeldSaleId, setSelectedHeldSaleId] = useState("");
    const [heldBillsBusy, setHeldBillsBusy] = useState(false);
    const [heldBillConflict, setHeldBillConflict] = useState<HeldSale | null>(null);
    const [selectedStaffName, setSelectedStaffName] = useState(cashierName || "Current User");
    const [activeCashSession, setActiveCashSession] = useState<PosCashSessionContext>(cashSession);
    const [staffStatus, setStaffStatus] = useState(cashSession.status === "open" ? "Working" : "Not Started");
    const [staffControlExpanded, setStaffControlExpanded] = useState(true);
    const [workStartedAt, setWorkStartedAt] = useState<Date | null>(
        cashSession.status === "open" && cashSession.openedAt ? new Date(cashSession.openedAt) : null,
    );
    const [workEndedAt, setWorkEndedAt] = useState<Date | null>(null);
    const [otStartedAt, setOtStartedAt] = useState<Date | null>(null);
    const [otEndedAt, setOtEndedAt] = useState<Date | null>(null);
    const [actualClosingCash, setActualClosingCash] = useState(0);
    const [closingSummaryVisible, setClosingSummaryVisible] = useState(false);
    const [openingCashCounts, setOpeningCashCounts] = useState<Record<number, number>>(() => Object.fromEntries(OPENING_CASH_DENOMINATIONS.map((denomination) => [denomination, 0])));
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<ReceiptSnapshot | null>(null);
    const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);
    const [receiptPrintMode, setReceiptPrintMode] = useState<ReceiptPrintMode>(() =>
        readReceiptPrintModePreference(receiptSettings.receiptPrintMode ?? "ask_every_time"),
    );
    const [saleCompletedReceipt, setSaleCompletedReceipt] = useState<ReceiptSnapshot | null>(null);
    const [recentSalesOpen, setRecentSalesOpen] = useState(false);
    const [returnExchangeOpen, setReturnExchangeOpen] = useState(false);
    const [returnExchangeTab, setReturnExchangeTab] = useState<ReturnExchangeTab>("return");
    const [returnExchangeSaleId, setReturnExchangeSaleId] = useState<string | undefined>();
    const [recentSales, setRecentSales] = useState<DemoSaleRecord[]>([]);
    const [recentSalesFilter, setRecentSalesFilter] = useState<"today" | "yesterday" | "week" | "month" | "custom">("today");
    const [recentSalesSearch, setRecentSalesSearch] = useState("");
    const [recentSalesShowDeleted, setRecentSalesShowDeleted] = useState(false);
    const [recentSalesCustomStart, setRecentSalesCustomStart] = useState("");
    const [recentSalesCustomEnd, setRecentSalesCustomEnd] = useState("");
    const [ownShiftReportOpen, setOwnShiftReportOpen] = useState(false);
    const [managerApprovalRequest, setManagerApprovalRequest] = useState<ManagerApprovalRequest | null>(null);
    const [managerApprovalPin, setManagerApprovalPin] = useState("");
    const [managerApprovalReason, setManagerApprovalReason] = useState("");
    const [mixedPaymentOpen, setMixedPaymentOpen] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [pendingApprovals, setPendingApprovals] = useState<PosPendingApprovalRequest[]>([]);
    const [auditEntries, setAuditEntries] = useState<PosAuditEntry[]>([]);
    const [customerDisplayMode, setCustomerDisplayMode] = useState<PosDisplayState["displayMode"]>("advertising");
    const [availableQrBanks, setAvailableQrBanks] = useState(qrBanks);
    const [selectedQrBankId, setSelectedQrBankId] = useState(qrBanks[0]?.id ?? "");
    const [visibleProducts, setVisibleProducts] = useState<PosProduct[]>(products);
    const [currentTime, setCurrentTime] = useState(HYDRATION_SAFE_TIME);
    const [businessDate, setBusinessDate] = useState(HYDRATION_SAFE_BUSINESS_DATE);
    const [uiLocale, setUiLocale] = useState<"en" | "th">("en");
    const [stockReferenceDate, setStockReferenceDate] = useState(HYDRATION_SAFE_REFERENCE_DATE);
    const [billNo, setBillNo] = useState(nextSaleNo);
    useEffect(() => {
        setBillNo(nextSaleNo);
    }, [nextSaleNo]);
    useEffect(() => {
        setUiLocale(document.documentElement.dataset.locale === "th" ? "th" : "en");
    }, []);
    useEffect(() => {
        setActiveCashSession(cashSession);
        if (cashSession.status === "open") {
            setStaffStatus("Working");
            setWorkStartedAt(cashSession.openedAt ? new Date(cashSession.openedAt) : null);
            setWorkEndedAt(null);
            setClosingSummaryVisible(false);
        }
    }, [cashSession]);
    useEffect(() => {
        setVisibleProducts(products);
    }, [products]);
    useEffect(() => {
        setAvailableQrBanks(qrBanks);
        setSelectedQrBankId((current) => current || qrBanks[0]?.id || "");
    }, [qrBanks]);
    useEffect(() => {
        setPendingApprovals(demoPendingApprovalRepository.listPendingApprovals<PosPendingApprovalRequest>());
        setAuditEntries(demoAuditLogRepository.listAuditEntries<PosAuditEntry>());
        setReceiptPrintMode(readReceiptPrintModePreference(receiptSettings.receiptPrintMode ?? "ask_every_time"));
    }, []);
    useEffect(() => {
        function refreshOnFocus() {
            if (recentSalesLoaded) {
                void refreshRecentSalesFromServer();
            }
            if (heldBillsLoaded) {
                void refreshHeldBillsFromServer();
            }
            setReceiptPrintMode(readReceiptPrintModePreference(receiptSettings.receiptPrintMode ?? "ask_every_time"));
        }
        window.addEventListener("focus", refreshOnFocus);
        window.addEventListener("storage", refreshOnFocus);
        return () => {
            window.removeEventListener("focus", refreshOnFocus);
            window.removeEventListener("storage", refreshOnFocus);
        };
    }, [heldBillsLoaded, recentSalesLoaded, receiptSettings.receiptPrintMode]);
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(formatPosTime(now));
            setBusinessDate(formatBusinessDate(now));
            setStockReferenceDate(now);
        };
        updateClock();
        const interval = window.setInterval(updateClock, 30000);
        return () => window.clearInterval(interval);
    }, []);
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const staffControlView = searchParams.get("staffControl");
        if (staffControlView === "collapsed") {
            setStaffControlExpanded(false);
        }
        if (searchParams.get("focus") === "staff") {
            window.setTimeout(() => {
                document.getElementById("staff-control")?.scrollIntoView({ block: "center" });
            }, 250);
        }
    }, []);
    useEffect(() => {
        const stored = window.localStorage.getItem(POS_PRODUCT_GRID_VISIBILITY_KEY);
        if (stored === "hidden") {
            setProductGridVisible(false);
        }
        if (stored === "visible") {
            setProductGridVisible(true);
        }
    }, []);
    const categories = useMemo(() => ["All", ...Array.from(new Set(visibleProducts.map((product) => product.categoryName)))], [visibleProducts]);
    const favoriteProducts = useMemo(() => {
        const favorites = visibleProducts.filter((product) => product.isFavorite).slice(0, 16);
        return favorites.length >= 12 ? favorites : visibleProducts.slice(0, 16);
    }, [visibleProducts]);
    const filteredProducts = useMemo(
        () => filterPosCatalogue(visibleProducts, productQuery, selectedCategory),
        [productQuery, visibleProducts, selectedCategory],
    );
    const selectedQrBank = availableQrBanks.find((bank) => bank.id === selectedQrBankId) ?? null;
    const staffOptions = useMemo(() => Array.from(new Set([cashierName || "Cashier 1", "Manager", "Cashier 1", "Cashier 2", "Owner"])), [cashierName]);
    const activeCustomer = isMembershipActive(selectedCustomer) ? selectedCustomer : null;
    const openingCashTotal = OPENING_CASH_DENOMINATIONS.reduce((total, denomination) => total + denomination * (openingCashCounts[denomination] ?? 0), 0);
    const workHours = calculateHours(workStartedAt, workEndedAt);
    const otHours = calculateHours(otStartedAt, otEndedAt);
    const subtotal = cartSubtotal(cartItems);
    const membershipSavings = cartItems.reduce((total, item) => total + Math.max(item.retailPriceLak - item.priceLak, 0) * item.quantity, 0);
    const promotionDiscountTotal = useMemo(() => {
        if (cartItems.length === 0 || promotions.length === 0) {
            return 0;
        }
        const categoryByProduct = new Map(cartItems.map((item) => [item.id, item.categoryId ?? null]));
        const previewItems = applyLoadedPromotions(
            cartItems.map((item) => ({
                baseQuantity: item.quantity * (item.conversionQty ?? 1),
                costPrice: item.costPriceLak ?? 0,
                discountAmount: 0,
                productId: item.id,
                profitAmount: 0,
                promotionDiscount: 0,
                quantity: item.quantity,
                sellingPrice: item.priceLak,
                totalAmount: item.priceLak * item.quantity,
                unitId: item.unitId,
            })),
            promotions,
            {
                allowStacking: false,
                categoryByProduct,
                companyId: "",
                membershipLevelId: activeCustomer?.membershipStatus === "Active" ? activeCustomer.membershipLevelId ?? null : null,
            },
        );
        return Math.round(previewItems.reduce((total, item) => total + item.promotionDiscount, 0));
    }, [activeCustomer?.membershipLevelId, activeCustomer?.membershipStatus, cartItems, promotions]);
    const percentDiscountValue = Math.round(subtotal * (discountPercent / 100));
    const manualDiscountTotal = Math.min(subtotal, discountAmount + percentDiscountValue);
    const discountTotal = Math.min(subtotal, promotionDiscountTotal + manualDiscountTotal);
    const maxRedeemablePoints = loyaltySettings.loyaltyEnabled && selectedCustomer
        ? Math.min(
            selectedCustomer.pointsBalance,
            loyaltySettings.loyaltyPointValueLak > 0
                ? Math.floor(Math.max(subtotal - discountTotal, 0) / loyaltySettings.loyaltyPointValueLak)
                : 0,
        )
        : 0;
    const effectiveRedeemPoints = loyaltySettings.loyaltyEnabled
        ? Math.min(Math.max(redeemPoints, 0), maxRedeemablePoints)
        : 0;
    const loyaltyRedeemDiscount = effectiveRedeemPoints * loyaltySettings.loyaltyPointValueLak;
    const taxableAmount = Math.max(subtotal - discountTotal - loyaltyRedeemDiscount, 0);
    const taxAmount = taxEnabled
        ? Math.round(taxInclusive ? taxableAmount * (taxRatePercent / (100 + taxRatePercent)) : taxableAmount * (taxRatePercent / 100))
        : 0;
    const totalAmount = taxInclusive ? taxableAmount : taxableAmount + taxAmount;
    const pointsEarned = loyaltySettings.loyaltyEnabled
        ? Math.floor(totalAmount / Math.max(loyaltySettings.loyaltySpendPerPointLak, 1))
        : 0;
    const paidAmount = paymentMode === "cash"
        ? cashAmount
        : paymentMode === "qr"
            ? qrAmount
            : paymentMode === "transfer"
                ? transferAmount
                : paymentMode === "card"
                    ? cardAmount
                    : cashAmount + qrAmount + transferAmount + cardAmount;
    const changeAmount = Math.max(paidAmount - totalAmount, 0);
    const dueAmount = Math.max(totalAmount - paidAmount, 0);
    const cashSales = activeCashSession.status === "open" ? activeCashSession.cashSalesLak : 0;
    const qrTransferSales = activeCashSession.status === "open" ? activeCashSession.nonCashSalesLak : qrAmount + transferAmount;
    const effectiveOpeningCash = activeCashSession.status === "open" ? activeCashSession.openingCashLak : openingCashTotal;
    const expectedCash = activeCashSession.status === "open" ? activeCashSession.expectedCashLak : openingCashTotal;
    const cashDifference = actualClosingCash - (activeCashSession.status === "open" ? activeCashSession.expectedCashLak : expectedCash);
    const appliedPromotions = useMemo(() => {
        const labels = cartItems
            .map((item) => item.pricingNote)
            .filter((label): label is string => Boolean(label));
        if (promotionDiscountTotal > 0)
            labels.push("Promotion applied");
        if (manualDiscountTotal > 0)
            labels.push("Manual discount applied");
        if (promotionBanners.length > 0)
            labels.push(promotionBanners[0]);
        return Array.from(new Set(labels)).slice(0, 4);
    }, [cartItems, manualDiscountTotal, promotionBanners, promotionDiscountTotal]);
    const filteredRecentSales = useMemo(() => {
        const query = recentSalesSearch.trim().toLowerCase();
        return recentSales
            .filter((sale) => {
            if (!recentSalesShowDeleted && sale.status === "deleted")
                return false;
            return isSaleInDateFilter(sale.createdAt, recentSalesFilter, recentSalesCustomStart, recentSalesCustomEnd);
        })
            .filter((sale) => {
            if (!query)
                return true;
            return [
                sale.saleNo,
                sale.receiptNo,
                sale.customerName,
                sale.customerPhone,
                sale.cashierName,
                sale.paymentMode,
                ...sale.items.map((item) => item.nameEn),
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query));
        });
    }, [recentSales, recentSalesCustomEnd, recentSalesCustomStart, recentSalesFilter, recentSalesSearch, recentSalesShowDeleted]);
    async function refreshRecentSalesFromServer() {
        if (demoMode) {
            setRecentSales(demoSalesRepository.listSales<DemoSaleRecord>());
            setRecentSalesLoaded(true);
            return;
        }
        try {
            const sales = await fetchRecentSales();
            setRecentSales(sales as DemoSaleRecord[]);
            setRecentSalesLoaded(true);
        } catch {
            // Keep the current list when the server read fails.
        }
    }
    function refreshRecentSales() {
        void refreshRecentSalesFromServer();
    }
    function recordPosAudit(action: PosPermissionAction, result: PosAuditEntry["result"], approvalStatus: PosAuditEntry["approvalStatus"], details: string) {
        const entry: PosAuditEntry = {
            action,
            approvalStatus,
            createdAt: new Date().toISOString(),
            details,
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            result,
            role: posPermissionPolicy.role,
            user: posPermissionPolicy.displayName,
        };
        setAuditEntries((current) => {
            const next = [entry, ...current].slice(0, 100);
            demoAuditLogRepository.addAuditEntry(entry, 100);
            return next;
        });
    }
    function createPendingApproval(action: PosPermissionAction, reason: string, oldValue?: string, newValue?: string) {
        const request: PosPendingApprovalRequest = {
            action,
            createdAt: new Date().toISOString(),
            id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            newValue,
            oldValue,
            reason,
            requestedBy: posPermissionPolicy.displayName,
            requestedByRole: posPermissionPolicy.role,
            status: "pending",
        };
        setPendingApprovals((current) => {
            const next = [request, ...current];
            demoPendingApprovalRepository.savePendingApprovals(next);
            return next;
        });
        recordPosAudit(action, "approval_requested", "pending", reason);
        setMessage(`Pending approval created: ${formatPosPermissionAction(action)}.`);
    }
    function enforcePosAction(action: PosPermissionAction, context: { amountLak?: number; discountPercent?: number; oldValue?: string; newValue?: string } = {}) {
        const decision = evaluatePosPermission(posPermissionPolicy, action, context);
        if (decision.allowed) {
            recordPosAudit(action, "allowed", "not_required", `${formatPosPermissionAction(action)} allowed.`);
            return true;
        }
        if (decision.approvalRequired) {
            createPendingApproval(action, decision.reason ?? `${formatPosPermissionAction(action)} requires approval.`, context.oldValue, context.newValue);
            return false;
        }
        recordPosAudit(action, "blocked", "rejected", decision.reason ?? POS_PERMISSION_DENIED_MESSAGE);
        setMessage(POS_PERMISSION_DENIED_MESSAGE);
        return false;
    }
    function resolvePendingApproval(requestId: string, status: "approved" | "rejected") {
        if (posPermissionPolicy.role !== "Owner") {
            setMessage(POS_PERMISSION_DENIED_MESSAGE);
            recordPosAudit("manual_price_override", "blocked", "rejected", "Only Owner can approve or reject POS approval requests.");
            return;
        }
        const request = pendingApprovals.find((item) => item.id === requestId);
        setPendingApprovals((current) => {
            const next = current.map((request) => request.id === requestId ? { ...request, status } : request);
            demoPendingApprovalRepository.savePendingApprovals(next);
            return next;
        });
        if (request) {
            recordPosAudit(request.action, status, status, `${formatPosPermissionAction(request.action)} ${status}.`);
            if (status === "approved") {
                applyPosAction(request.action, "approved");
            }
        }
        setMessage(`Approval request ${status}.`);
    }
    useEffect(() => {
        const state: PosDisplayState = {
            appliedPromotions,
            customer: selectedCustomer,
            displayMode: cartItems.length > 0 ? customerDisplayMode : "advertising",
            items: cartItems,
            membershipDiscountLak: membershipSavings,
            membershipPoints: selectedCustomer?.pointsBalance ?? 0,
            membershipStatus: selectedCustomer
                ? `${selectedCustomer.membershipType} ${isMembershipActive(selectedCustomer) ? "Active" : "Expired"}`
                : "Guest",
            pointsEarned,
            promotionDiscountLak: promotionDiscountTotal,
            selectedQrBank,
            storeLogoUrl: "",
            subtotalLak: subtotal,
            totalLak: totalAmount,
        };
        writeJsonToStorage(DemoStorageKeys.customerDisplayState, state);
    }, [appliedPromotions, cartItems, customerDisplayMode, membershipSavings, pointsEarned, promotionDiscountTotal, selectedCustomer, selectedQrBank, subtotal, totalAmount]);
    function addToCart(product: PosProduct, selectedUnit?: PosProductUnit) {
        const saleUnit = selectedUnit ?? getSaleUnits(product)[0];
        const unitProduct = saleUnit ? productWithSaleUnit(product, saleUnit) : product;
        const pricedProduct = applyCustomerPricing(unitProduct, activeCustomer);
        const stockWarning = getStockWarning(unitProduct, stockReferenceDate);
        let result: AddPosCartResult | undefined;
        setCartItems((current) => {
            result = addPosCartLine(current, {
                ...pricedProduct,
                id: product.id,
                stockWarning,
            });
            return result.cart;
        });
        if (!result?.added) {
            const requested = saleUnit?.conversionQty ?? unitProduct.conversionQty ?? 1;
            setMessage(`Insufficient stock for ${product.nameEn}. Available ${product.stockQty}, requested ${requested}.`);
            setUnitSelectionProduct(null);
            return;
        }
        setCustomerDisplayMode("checkout");
        setUnitSelectionProduct(null);
        setMessage(stockWarning ? `${stockWarning.label}: ${product.nameEn}` : `${product.nameEn} ${saleUnit?.unitName ?? ""} added to cart.`);
    }
    function selectProductForSale(product: PosProduct, matchedUnit?: PosProductUnit) {
        if (matchedUnit) {
            addToCart(product, matchedUnit);
            return;
        }
        const saleUnits = getSaleUnits(product);
        if (saleUnits.length <= 1) {
            addToCart(product, saleUnits[0]);
            return;
        }
        if (maxSellQty(product.stockQty, 1) < 1) {
            setMessage(`Insufficient stock for ${product.nameEn}. Available ${product.stockQty}, requested 1.`);
            return;
        }
        setUnitSelectionProduct(product);
    }
    function scanBarcode() {
        const normalized = productQuery.trim();
        if (!normalized) {
            setMessage(t("ui.scan.or.enter.barcode.sku.or.internal.code.f"));
            return;
        }
        const match = findPosScanMatch(visibleProducts, normalized);
        if (!match) {
            setMessage(t("ui.no.product.found.for.barcode.sku.or.internal"));
            return;
        }
        selectProductForSale(match.product, match.unit);
        setProductQuery("");
    }
    function toggleProductGrid() {
        setProductGridVisible((current) => {
            const next = !current;
            window.localStorage.setItem(POS_PRODUCT_GRID_VISIBILITY_KEY, next ? "visible" : "hidden");
            return next;
        });
    }
    function searchMembership() {
        const rawQuery = membershipQuery.trim();
        if (!rawQuery) {
            setMessage(t("ui.no.customer.or.membership.found"));
            return;
        }
        const query = rawQuery.toLowerCase();
        const compactQuery = rawQuery.replace(/\s+/g, "");
        const digitQuery = rawQuery.replace(/\D/g, "");
        const exact = customers.filter((item) => {
            const phoneDigits = item.phone.replace(/\D/g, "");
            return item.phone.replace(/\s+/g, "") === compactQuery
                || phoneDigits.length >= 6 && phoneDigits === digitQuery
                || item.membershipNumber.toLowerCase() === query
                || item.customerCode.toLowerCase() === query
                || item.id.toLowerCase() === query;
        });
        if (exact.length > 1) {
            setSelectedCustomer(null);
            setMessage("Multiple members match this lookup. Enter the exact member code or phone.");
            return;
        }
        if (exact.length === 1) {
            const customer = exact[0];
            setSelectedCustomer(customer);
            setRedeemPoints(0);
            setMessage(isMembershipActive(customer)
                ? `${customer.name} membership active.`
                : `${customer.name} membership expired. Retail pricing applies.`);
            return;
        }
        const partial = customers.filter((item) => item.phone.toLowerCase().includes(query)
            || item.name.toLowerCase().includes(query)
            || item.membershipNumber.toLowerCase().includes(query)
            || item.customerCode.toLowerCase().includes(query));
        if (partial.length > 1) {
            setSelectedCustomer(null);
            setMessage("Multiple members match this lookup. Enter the exact member code or phone.");
            return;
        }
        const customer = partial[0];
        if (!customer) {
            setSelectedCustomer(null);
            setMessage(t("ui.no.customer.or.membership.found"));
            return;
        }
        setSelectedCustomer(customer);
        setRedeemPoints(0);
        setMessage(isMembershipActive(customer)
            ? `${customer.name} membership active.`
            : `${customer.name} membership expired. Retail pricing applies.`);
    }
    function updateQuantity(productId: string, quantity: number, unitId?: string) {
        setCartItems((current) => updatePosCartQuantity(current, productId, quantity, unitId));
    }
    function removeItem(productId: string, unitId?: string) {
        if (!enforcePosAction("delete_item_from_bill")) {
            return;
        }
        setCartItems((current) => removePosCartLine(current, productId, unitId));
    }
    async function refreshHeldBillsFromServer() {
        if (demoMode) {
            setHeldBillsLoaded(true);
            return;
        }
        try {
            setHeldSales(await fetchHeldBills());
            setHeldBillsLoaded(true);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to load held bills.");
        }
    }
    function buildHeldBillSnapshot(): HeldBillCartSnapshot {
        return {
            appliedPromotions,
            cardAmount,
            cashAmount,
            cartItems,
            customer: selectedCustomer,
            discountAmount,
            discountPercent,
            membershipDiscountLak: membershipSavings,
            paymentMode,
            qrAmount,
            redeemPoints: effectiveRedeemPoints,
            taxAmount,
            taxEnabled,
            taxRatePercent,
            transferAmount,
        };
    }
    function restoreHeldBill(sale: HeldSale) {
        const snapshot = sale.snapshot;
        const restoredCustomer = snapshot?.customer
            ? customers.find((customer) => customer.id === snapshot.customer?.id) ?? snapshot.customer
            : null;
        setCartItems((snapshot?.cartItems ?? sale.items).map((item, index) => ({
            ...item,
            cartLineId: `${item.id}:${item.unitId ?? "default"}:held-${sale.id}-${index}`,
        })));
        setSelectedCustomer(restoredCustomer);
        setDiscountAmount(snapshot?.discountAmount ?? 0);
        setDiscountPercent(snapshot?.discountPercent ?? 0);
        setRedeemPoints(snapshot?.redeemPoints ?? 0);
        setTaxEnabled(snapshot?.taxEnabled ?? true);
        setPaymentMode(snapshot?.paymentMode ?? "cash");
        setCashAmount(snapshot?.cashAmount ?? 0);
        setQrAmount(snapshot?.qrAmount ?? 0);
        setTransferAmount(snapshot?.transferAmount ?? 0);
        setCardAmount(snapshot?.cardAmount ?? 0);
        setCustomerDisplayMode("checkout");
    }
    async function holdSale() {
        if (!enforcePosAction("hold_bill")) {
            return false;
        }
        if (cartItems.length === 0) {
            setMessage(t("ui.cart.is.empty.add.items.before.holding.a.bil"));
            return false;
        }
        if (demoMode) {
            const heldSale: HeldSale = {
                id: `hold-${Date.now()}`,
                saleNo: nextHoldName(heldSales.length),
                createdAt: new Date().toLocaleString("en-GB"),
                itemCount: cartItems.reduce((total, item) => total + item.quantity, 0),
                items: cartItems,
                snapshot: buildHeldBillSnapshot(),
                totalLak: totalAmount,
            };
            setHeldSales((current) => [heldSale, ...current]);
            clearSale();
            setSelectedCustomer(null);
            setMessage(`Bill ${heldSale.saleNo} held.`);
            return true;
        }
        setHeldBillsBusy(true);
        try {
            const heldSale = await createHeldBill(buildHeldBillSnapshot(), activeCashSession.sessionId);
            setHeldSales((current) => [heldSale, ...current]);
            clearSale();
            setSelectedCustomer(null);
            setMessage(`Bill ${heldSale.saleNo} held.`);
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to hold this bill.");
            return false;
        }
        finally {
            setHeldBillsBusy(false);
        }
    }
    async function resumeSale() {
        if (!enforcePosAction("resume_bill")) {
            return false;
        }
        const heldSale = heldSales.find((sale) => sale.id === selectedHeldSaleId);
        if (!heldSale) {
            setMessage(t("ui.select.a.held.bill.to.resume"));
            return false;
        }
        if (cartItems.length > 0) {
            setHeldBillConflict(heldSale);
            return false;
        }
        return resumeHeldBillToCart(heldSale);
    }
    async function resumeHeldBillToCart(heldSale: HeldSale) {
        if (demoMode) {
            restoreHeldBill(heldSale);
            setHeldSales((current) => current.filter((sale) => sale.id !== heldSale.id));
            setSelectedHeldSaleId("");
            setMessage(`Bill ${heldSale.saleNo} resumed.`);
            return true;
        }
        setHeldBillsBusy(true);
        try {
            const result = await resumeHeldBill(heldSale.id);
            restoreHeldBill(result.sale);
            setHeldSales((current) => current.filter((sale) => sale.id !== heldSale.id));
            setSelectedHeldSaleId("");
            setMessage(result.availabilityWarnings.length > 0
                ? `${heldSale.saleNo} resumed with stock warnings: ${result.availabilityWarnings.join(" ")}`
                : `Bill ${heldSale.saleNo} resumed.`);
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to resume this held bill.");
            return false;
        }
        finally {
            setHeldBillsBusy(false);
        }
    }
    async function holdCurrentAndResume() {
        const heldSale = heldBillConflict;
        if (!heldSale) return;
        const held = await holdSale();
        if (!held) return;
        setHeldBillConflict(null);
        const resumed = await resumeHeldBillToCart(heldSale);
        if (resumed) {
            setHeldBillsOpen(false);
        }
    }
    async function deleteHeldSale() {
        if (!enforcePosAction("void_bill")) {
            return false;
        }
        if (!selectedHeldSaleId) {
            setMessage(t("ui.select.a.held.bill.to.delete"));
            return false;
        }
        const sale = heldSales.find((item) => item.id === selectedHeldSaleId);
        if (!sale) return false;
        if (demoMode) {
            setHeldSales((current) => current.filter((item) => item.id !== selectedHeldSaleId));
            setSelectedHeldSaleId("");
            setMessage(`Bill ${sale.saleNo} cancelled.`);
            return true;
        }
        setHeldBillsBusy(true);
        try {
            await cancelHeldBill(sale.id);
            setHeldSales((current) => current.filter((item) => item.id !== sale.id));
            setSelectedHeldSaleId("");
            setMessage(`Bill ${sale.saleNo} cancelled.`);
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to cancel this held bill.");
            return false;
        }
        finally {
            setHeldBillsBusy(false);
        }
    }
    function resolvePaymentForCompletion(): ResolvedPayment | null {
        if (!paymentMode) {
            return null;
        }
        const payment: ResolvedPayment = {
            cardAmount,
            cashAmount,
            changeAmount,
            paidAmount,
            qrAmount,
            transferAmount,
        };
        if (paymentMode !== "mixed" && payment.paidAmount <= 0 && totalAmount > 0) {
            payment.cashAmount = paymentMode === "cash" ? totalAmount : 0;
            payment.qrAmount = paymentMode === "qr" ? totalAmount : 0;
            payment.transferAmount = paymentMode === "transfer" ? totalAmount : 0;
            payment.cardAmount = paymentMode === "card" ? totalAmount : 0;
            payment.paidAmount = totalAmount;
            payment.changeAmount = 0;
        }
        if (payment.paidAmount < totalAmount) {
            return null;
        }
        payment.changeAmount = Math.max(payment.paidAmount - totalAmount, 0);
        return payment;
    }
    function applyResolvedPayment(payment: ResolvedPayment) {
        setCashAmount(payment.cashAmount);
        setQrAmount(payment.qrAmount);
        setTransferAmount(payment.transferAmount);
        setCardAmount(payment.cardAmount);
    }
    function getStockValidationError() {
        return cartExceedsStock(cartItems, visibleProducts);
    }
    function buildReceiptSnapshot(payment: ResolvedPayment, saleNo: string, createdAt = new Date().toISOString()): ReceiptSnapshot {
        return {
            branchName,
            cashierName,
            cartItems,
            changeAmount: payment.changeAmount,
            createdAt,
            customerName: selectedCustomer?.name ?? "Guest",
            discountTotal,
            paidAmount: payment.paidAmount,
            paymentMode,
            receiptNo: `RCPT-${saleNo}`,
            saleNo,
            subtotal,
            taxAmount,
            totalAmount,
        };
    }
    function completeSale() {
        if (checkoutInFlightRef.current || isPending) {
            return;
        }
        if (cartItems.length === 0) {
            setMessage(t("ui.cart.is.empty"));
            return;
        }
        const stockError = getStockValidationError();
        if (stockError) {
            setMessage(stockError);
            return;
        }
        const payment = resolvePaymentForCompletion();
        if (!payment) {
            setMessage(t("ui.payment.is.not.complete.yet"));
            return;
        }
        if (!enforcePosAction("create_sale", { amountLak: totalAmount, discountPercent })) {
            return;
        }
        if (manualDiscountTotal > 0 && !enforcePosAction("apply_discount", {
            amountLak: manualDiscountTotal,
            discountPercent,
            newValue: `${formatLak(manualDiscountTotal)} LAK / ${discountPercent}%`,
            oldValue: "0 LAK / 0%",
        })) {
            return;
        }
        applyResolvedPayment(payment);
        const saleNo = billNo;
        if (demoMode) {
            completeDemoSale(saleNo, payment);
            return;
        }
        checkoutInFlightRef.current = true;
        startTransition(async () => {
            try {
            const result = await completeSaleAction({
                branchId,
                cardAmount: payment.cardAmount,
                cashAmount: payment.cashAmount,
                changeAmount: payment.changeAmount,
                customerId: selectedCustomer?.id,
                discountAmount,
                discountPercent,
                items: cartItems.map((item) => ({
                    costPrice: item.costPriceLak,
                    conversionQty: item.conversionQty ?? 1,
                    productId: item.id,
                    quantity: item.quantity,
                    sellingPrice: item.priceLak,
                    unitId: item.unitId,
                })),
                paymentMode,
                qrAmount: payment.qrAmount,
                redeemPoints: effectiveRedeemPoints,
                saleNo,
                taxAmount,
                taxRate: taxEnabled ? taxRatePercent : 0,
                totalAmount,
                transferAmount: payment.transferAmount,
                warehouseId,
            });
            if (!result.ok) {
                setMessage(result.error ?? t("ui.sale.completion.failed"));
                return;
            }
            const assignedSaleNo = result.data?.saleNo ?? saleNo;
            const receipt = result.data
                ? receiptSnapshotFromPersistedSale(result.data, {
                    branchName,
                    cashierName,
                    customerName: selectedCustomer?.name ?? "Guest",
                })
                : buildReceiptSnapshot(payment, assignedSaleNo);
            setLastReceipt(receipt);
            setSaleCompletedReceipt(receipt);
            setMessage(`${assignedSaleNo} completed and saved.`);
            setCustomerDisplayMode("thank_you");
            clearSale();
            setBillNo(getFollowingPosSaleNo(assignedSaleNo, receiptSettings.receiptPrefix));
            try {
                const session = await fetchCurrentCashSession();
                setActiveCashSession(session);
            } catch {
                // Session totals refresh is best-effort after sale completion.
            }
            void refreshRecentSalesFromServer();
            router.refresh();
            const displaySettings = readCustomerDisplaySettingsFromStorage();
            window.setTimeout(() => {
                setCustomerDisplayMode("advertising");
            }, displaySettings.autoReturnSeconds * 1000);
            } finally {
                checkoutInFlightRef.current = false;
            }
        });
    }
    function completeDemoSale(saleNo: string, payment: ResolvedPayment) {
        const createdAt = new Date().toISOString();
        const receipt = buildReceiptSnapshot(payment, saleNo, createdAt);
        const saleRecord: DemoSaleRecord = {
            branchId,
            cashierName,
            changeAmount: payment.changeAmount,
            createdAt,
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name ?? "Guest",
            customerPhone: selectedCustomer?.phone,
            discountAmount,
            discountPercent,
            items: cartItems.map((item) => ({ ...item })),
            paidAmount: payment.paidAmount,
            paymentMode,
            receiptNo: receipt.receiptNo,
            saleNo,
            status: "paid",
            subtotal,
            taxAmount,
            timeline: [
                { at: createdAt, label: "Created", user: cashierName },
                { at: createdAt, label: "Paid", user: cashierName },
            ],
            totalAmount,
            warehouseId,
        };
        try {
            const nextSales = demoSalesRepository.addSale<DemoSaleRecord>(saleRecord);
            demoReceiptsRepository.addReceipt({ ...receipt, type: "receipt" });
            const soldByProduct = cartItems.reduce<Record<string, number>>((totals, item) => {
                totals[item.id] = (totals[item.id] ?? 0) + item.quantity * (item.conversionQty ?? 1);
                return totals;
            }, {});
            const nextProducts = demoProductsRepository.deductStock(soldByProduct);
            setVisibleProducts(nextProducts.map(mapStoredProductToPosProduct).filter((product) => product.stockQty >= 0));
            setRecentSales(nextSales);
            setLastReceipt(receipt);
            setSaleCompletedReceipt(receipt);
            recordPosAudit("create_sale", "allowed", "not_required", `${saleNo} completed. Stock, receipt, sales, and audit updated.`);
            setMessage(`${saleNo} completed and saved.`);
            setCustomerDisplayMode("thank_you");
            clearSale();
            setBillNo(getFollowingPosSaleNo(saleNo, receiptSettings.receiptPrefix));
            handleReceiptPrintModeAfterSale(receipt);
            const displaySettings = readCustomerDisplaySettingsFromStorage();
            window.setTimeout(() => {
                setCustomerDisplayMode("advertising");
            }, displaySettings.autoReturnSeconds * 1000);
        }
        catch {
            setMessage("Storage save failed. Sale was not completed.");
        }
    }
    function handleReceiptPrintModeAfterSale(receipt: ReceiptSnapshot) {
        setSaleCompletedReceipt(receipt);
    }
    function receiptFromSale(sale: DemoSaleRecord): ReceiptSnapshot {
        const savedReceipt = demoReceiptsRepository
            .listReceipts<ReceiptSnapshot>()
            .find((receipt) => receipt.receiptNo === sale.receiptNo || receipt.saleNo === sale.saleNo);
        if (savedReceipt) {
            return savedReceipt;
        }
        return {
            branchName,
            cashierName: sale.cashierName,
            cartItems: sale.items,
            changeAmount: sale.changeAmount,
            createdAt: sale.createdAt,
            customerName: sale.customerName,
            discountTotal: sale.discountAmount + Math.round(sale.subtotal * (sale.discountPercent / 100)),
            paidAmount: sale.paidAmount,
            paymentMode: sale.paymentMode,
            receiptNo: sale.receiptNo,
            saleNo: sale.saleNo,
            subtotal: sale.subtotal,
            taxAmount: sale.taxAmount,
            totalAmount: sale.totalAmount,
        };
    }
    function openReceiptForSale(sale: DemoSaleRecord, autoPrint = false) {
        if (!enforcePosAction(autoPrint ? "reprint_receipt" : "view_receipt")) {
            return;
        }
        void (async () => {
            let receipt: ReceiptSnapshot;
            if (!demoMode && sale.id) {
                try {
                    if (autoPrint) {
                        await reprintSaleReceipt(sale.id);
                    }
                    const loaded = await fetchSaleReceipt(sale.id);
                    receipt = {
                        ...loaded,
                        branchName: loaded.branchName || branchName,
                        cartItems: loaded.cartItems as PosCartItem[],
                    };
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Receipt load failed.");
                    return;
                }
            } else {
                receipt = receiptFromSale(sale);
                if (autoPrint) {
                    appendSaleTimeline(sale.saleNo, "Reprinted");
                }
            }
            setRecentSalesOpen(false);
            setLastReceipt(receipt);
            setReceiptAutoPrint(autoPrint);
            setReceiptOpen(true);
        })();
    }
    function appendSaleTimeline(saleNo: string, label: string) {
        const now = new Date().toISOString();
        const nextSales = demoSalesRepository.updateSale<DemoSaleRecord>(saleNo, (sale) => ({
            ...sale,
            timeline: [...(sale.timeline ?? []), { at: now, label, user: posPermissionPolicy.displayName }],
        }));
        setRecentSales(nextSales);
    }
    function updateRecentSaleStatus(sale: DemoSaleRecord, status: DemoSaleStatus, label: string) {
        const now = new Date().toISOString();
        const nextSales = demoSalesRepository.updateSale<DemoSaleRecord>(sale.saleNo, (currentSale) => ({
            ...currentSale,
            status,
            timeline: [...(currentSale.timeline ?? []), { at: now, label, user: posPermissionPolicy.displayName }],
        }));
        setRecentSales(nextSales);
    }
    function openReturnExchange(tab: ReturnExchangeTab, sale?: DemoSaleRecord) {
        setRecentSalesOpen(false);
        setMoreMenuOpen(false);
        setReturnExchangeTab(tab);
        setReturnExchangeSaleId(sale?.id);
        setReturnExchangeOpen(true);
    }
    function refundSale(sale: DemoSaleRecord) {
        if (!demoMode && sale.id) {
            openReturnExchange("return", sale);
            return;
        }
        updateRecentSaleStatus(sale, "refunded", "Refunded");
        recordPosAudit("refund_bill", "allowed", "not_required", `${sale.saleNo} marked refunded.`);
        setMessage(`${sale.saleNo} marked refunded.`);
    }
    function voidSale(sale: DemoSaleRecord) {
        const canVoidDirectly = canUseStoreAction(posPermissionPolicy.role, STORE_ACTIONS.SALE_VOID);
        if (!canVoidDirectly && resolveStoreUiRole(posPermissionPolicy.role) === STORE_ROLES.CASHIER && !demoMode && sale.id) {
            openManagerApprovalRequest("void", sale);
            return;
        }
        if (!enforcePosAction("void_bill", { amountLak: sale.totalAmount })) {
            return;
        }
        if (!demoMode && sale.id) {
            if (postSaleInFlightRef.current) {
                return;
            }
            postSaleInFlightRef.current = true;
            void (async () => {
                try {
                    const result = await voidSaleRequest(sale.id!);
                    if (result.status === "pending_approval") {
                        setMessage(`Void pending approval for ${sale.saleNo}.`);
                        return;
                    }
                    await refreshRecentSalesFromServer();
                    recordPosAudit("void_bill", "allowed", "not_required", `${sale.saleNo} voided.`);
                    setMessage(`${sale.saleNo} voided. Stock restored.`);
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Void failed.");
                } finally {
                    postSaleInFlightRef.current = false;
                }
            })();
            return;
        }
        const restoredByProduct = sale.items.reduce<Record<string, number>>((totals, item) => {
            totals[item.id] = (totals[item.id] ?? 0) + item.quantity * (item.conversionQty ?? 1);
            return totals;
        }, {});
        const nextProducts = demoProductsRepository.restoreStock(restoredByProduct);
        setVisibleProducts(nextProducts.map(mapStoredProductToPosProduct).filter((product) => product.stockQty >= 0));
        updateRecentSaleStatus(sale, "voided", "Voided");
        recordPosAudit("void_bill", "allowed", "not_required", `${sale.saleNo} voided and stock restored.`);
        setMessage(`${sale.saleNo} voided. Stock restored.`);
    }
    function openManagerApprovalRequest(action: ManagerApprovalRequest["action"], sale: DemoSaleRecord) {
        setRecentSalesOpen(false);
        setManagerApprovalRequest({ action, sale });
        setManagerApprovalPin("");
        setManagerApprovalReason(`${action === "refund" ? "Refund" : "Void"} ${sale.saleNo}`);
    }
    function closeManagerApprovalRequest() {
        setManagerApprovalRequest(null);
        setManagerApprovalPin("");
        setManagerApprovalReason("");
    }
    async function submitManagerApprovalRequest() {
        const request = managerApprovalRequest;
        if (!request?.sale.id) {
            return;
        }
        const reason = managerApprovalReason.trim();
        if (!managerApprovalPin.trim() || !reason) {
            setMessage("Manager PIN and reason are required.");
            return;
        }
        const approval: PostSaleManagerApprovalPayload = {
            managerPin: managerApprovalPin,
            reason,
        };
        try {
            const result = request.action === "refund"
                ? await refundSaleRequest(request.sale.id, reason, approval)
                : await voidSaleRequest(request.sale.id, reason, approval);
            if (result.status === "pending_approval") {
                setMessage(`${request.action === "refund" ? "Refund" : "Void"} pending approval for ${request.sale.saleNo}.`);
                closeManagerApprovalRequest();
                return;
            }
            await refreshRecentSalesFromServer();
            recordPosAudit(
                request.action === "refund" ? "refund_bill" : "void_bill",
                "approved",
                "approved",
                `${request.sale.saleNo} ${request.action === "refund" ? "refunded" : "voided"} with manager PIN approval.`,
            );
            setMessage(`${request.sale.saleNo} ${request.action === "refund" ? "refunded" : "voided"} with manager approval.`);
            closeManagerApprovalRequest();
        } catch (error) {
            setManagerApprovalPin("");
            setMessage(error instanceof Error ? error.message : "Manager approval failed.");
        }
    }
    function editSaleField(sale: DemoSaleRecord, field: "note" | "customerName" | "paymentMode") {
        const action = field === "note" ? "edit_sale_note" : field === "customerName" ? "edit_sale_customer" : "edit_sale_payment";
        if (!enforcePosAction(action)) {
            return;
        }
        const label = field === "note" ? "Note" : field === "customerName" ? "Customer" : "Payment method";
        const value = window.prompt(`Update ${label}`, String(sale[field] ?? ""));
        if (value === null)
            return;
        const nextValue = field === "paymentMode" && !isPaymentMode(value) ? sale.paymentMode : value.trim();
        const now = new Date().toISOString();
        const nextSales = demoSalesRepository.updateSale<DemoSaleRecord>(sale.saleNo, (currentSale) => ({
            ...currentSale,
            [field]: nextValue,
            timeline: [...(currentSale.timeline ?? []), { at: now, label: `${label} edited`, user: posPermissionPolicy.displayName }],
        }));
        setRecentSales(nextSales);
        recordPosAudit(action, "allowed", "not_required", `${sale.saleNo} ${label.toLowerCase()} updated.`);
        setMessage(`${sale.saleNo} updated.`);
    }
    function softDeleteSale(sale: DemoSaleRecord) {
        if (!enforcePosAction("delete_sale")) {
            return;
        }
        const reason = window.prompt("Delete reason");
        if (!reason?.trim()) {
            setMessage("Delete reason is required.");
            return;
        }
        const now = new Date().toISOString();
        const nextSales = demoSalesRepository.updateSale<DemoSaleRecord>(sale.saleNo, (currentSale) => ({
            ...currentSale,
            deletedAt: now,
            deletedBy: posPermissionPolicy.displayName,
            deleteReason: reason.trim(),
            status: "deleted",
            timeline: [...(currentSale.timeline ?? []), { at: now, label: "Deleted", user: posPermissionPolicy.displayName }],
        }));
        setRecentSales(nextSales);
        recordPosAudit("delete_sale", "allowed", "not_required", `${sale.saleNo} soft deleted.`);
        setMessage(`${sale.saleNo} soft deleted.`);
    }
    function duplicateSaleToCart(sale: DemoSaleRecord) {
        if (!enforcePosAction("duplicate_sale")) {
            return;
        }
        setCartItems(sale.items.map((item, index) => ({
            ...item,
            cartLineId: `${item.id}:${item.unitId ?? "default"}:copy-${Date.now()}-${index}`,
        })));
        setPaymentMode("cash");
        setCashAmount(0);
        setQrAmount(0);
        setTransferAmount(0);
        setCardAmount(0);
        appendSaleTimeline(sale.saleNo, "Duplicated");
        recordPosAudit("duplicate_sale", "allowed", "not_required", `${sale.saleNo} copied to cart.`);
        setRecentSalesOpen(false);
        setMessage("Sale copied to cart.");
    }
    function clearSale() {
        setCartItems([]);
        setDiscountAmount(0);
        setDiscountPercent(0);
        setRedeemPoints(0);
        setCashAmount(0);
        setQrAmount(0);
        setTransferAmount(0);
        setCardAmount(0);
        setPaymentMode("cash");
        setCustomerDisplayMode("advertising");
    }
    function updateOpeningCashCount(denomination: number, quantity: number) {
        setOpeningCashCounts((current) => ({ ...current, [denomination]: Math.max(0, Math.floor(quantity)) }));
    }
    function recordStartWork() {
        if (!enforcePosAction("cash_in", { amountLak: openingCashTotal, newValue: `${formatLak(openingCashTotal)} LAK` })) {
            return;
        }
        if (demoMode) {
            setWorkStartedAt(new Date());
            setWorkEndedAt(null);
            setStaffStatus("Working");
            setClosingSummaryVisible(false);
            return;
        }
        startTransition(async () => {
            try {
                const session = await openCashSessionRequest(openingCashTotal);
                setActiveCashSession(session);
                setWorkStartedAt(session.openedAt ? new Date(session.openedAt) : new Date());
                setWorkEndedAt(null);
                setStaffStatus("Working");
                setClosingSummaryVisible(false);
                setMessage("Cash session opened.");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Failed to open cash session.");
            }
        });
    }
    function recordEndWork() {
        if (!enforcePosAction("cash_out", { amountLak: actualClosingCash, newValue: `${formatLak(actualClosingCash)} LAK` })) {
            return;
        }
        if (!activeCashSession.sessionId) {
            setMessage("No open cash session to close.");
            return;
        }
        if (demoMode) {
            setWorkEndedAt(new Date());
            setStaffStatus("Closed");
            setClosingSummaryVisible(true);
            return;
        }
        startTransition(async () => {
            try {
                const session = await closeCashSessionRequest(activeCashSession.sessionId!, actualClosingCash);
                setActiveCashSession(session);
                setWorkEndedAt(new Date());
                setStaffStatus("Closed");
                setClosingSummaryVisible(true);
                setMessage(`Shift closed. Variance ${formatLak(session.expectedCashLak - actualClosingCash)} LAK.`);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Failed to close cash session.");
            }
        });
    }
    function recordStartOt() {
        setOtStartedAt(new Date());
        setOtEndedAt(null);
        setStaffStatus("OT");
    }
    function recordEndOt() {
        setOtEndedAt(new Date());
        setStaffStatus(workEndedAt ? "Closed" : "Working");
    }
    function selectPaymentMode(nextMode: PaymentMode) {
        if (nextMode === "mixed" && !enforcePosAction("split_payment")) {
            return;
        }
        if ((nextMode === "qr" || nextMode === "transfer" || nextMode === "card" || nextMode === "mixed") && !enforcePosAction("multi_currency_payment")) {
            return;
        }
        setPaymentMode(nextMode);
        if (nextMode === "mixed") {
            setMixedPaymentOpen(true);
        }
    }
    function openMixedPayment() {
        if (!enforcePosAction("split_payment")) {
            return;
        }
        setMixedPaymentOpen(true);
    }
    function runControlledPosAction(action: PosPermissionAction) {
        const context = buildPosActionContext(action);
        if (enforcePosAction(action, context)) {
            applyPosAction(action, "allowed");
        }
    }
    function buildPosActionContext(action: PosPermissionAction) {
        if (action === "refund_bill") {
            return { amountLak: totalAmount || 150000, oldValue: "Completed sale", newValue: "Refund request" };
        }
        if (action === "manual_price_override") {
            return {
                amountLak: totalAmount,
                oldValue: cartItems[0] ? `${formatLak(cartItems[0].priceLak)} LAK` : "No item",
                newValue: cartItems[0] ? `${formatLak(Math.max(cartItems[0].priceLak - 1000, 0))} LAK` : "Manual price override",
            };
        }
        if (action === "apply_discount") {
            const testDiscountPercent = posPermissionPolicy.role === "Owner" ? 5 : posPermissionPolicy.maxDiscountPercent + 5;
            return {
                amountLak: Math.round(subtotal * (testDiscountPercent / 100)) || 5000,
                discountPercent: testDiscountPercent,
                oldValue: `${discountPercent}%`,
                newValue: `${testDiscountPercent}%`,
            };
        }
        return { amountLak: totalAmount };
    }
    function applyPosAction(action: PosPermissionAction, source: "allowed" | "approved") {
        const suffix = source === "approved" ? " after Owner approval" : "";
        if (action === "refund_bill") {
            setMessage(`Refund bill processed${suffix}.`);
            return;
        }
        if (action === "void_bill") {
            clearSale();
            setMessage(`Bill voided${suffix}.`);
            return;
        }
        if (action === "manual_price_override") {
            if (cartItems.length === 0) {
                setMessage("Add an item before manual price override.");
                return;
            }
            setCartItems((current) => current.map((item, index) => index === 0 ? { ...item, priceLak: Math.max(item.priceLak - 1000, 0), pricingNote: "Manual price override" } : item));
            setMessage(`Manual price override applied${suffix}.`);
            return;
        }
        if (action === "delete_item_from_bill") {
            if (cartItems.length === 0) {
                setMessage("Cart is empty.");
                return;
            }
            const [firstItem] = cartItems;
            setCartItems((current) => current.slice(1));
            setMessage(`${firstItem.nameEn} deleted from bill${suffix}.`);
            return;
        }
        if (action === "apply_discount") {
            const nextDiscount = posPermissionPolicy.role === "Owner" ? 5 : Math.min(posPermissionPolicy.maxDiscountPercent, 5);
            setDiscountPercent(nextDiscount);
            setMessage(`${nextDiscount}% discount applied${suffix}.`);
            return;
        }
        if (action === "cash_in") {
            setWorkStartedAt(new Date());
            setWorkEndedAt(null);
            setStaffStatus("Working");
            setClosingSummaryVisible(false);
            setMessage(`Cash in recorded${suffix}.`);
            return;
        }
        if (action === "cash_out") {
            setWorkEndedAt(new Date());
            setStaffStatus("Closed");
            setClosingSummaryVisible(true);
            setMessage(`Cash out recorded${suffix}.`);
            return;
        }
        if (action === "reprint_receipt") {
            setReceiptOpen(true);
            setMessage(`Receipt reprint opened${suffix}.`);
            return;
        }
        if (action === "split_payment") {
            setPaymentMode("mixed");
            setMixedPaymentOpen(true);
            setMessage(`Split payment opened${suffix}.`);
            return;
        }
        if (action === "multi_currency_payment") {
            setPaymentMode("transfer");
            setMessage(`Multi-currency payment mode selected${suffix}.`);
            return;
        }
        setMessage(`${formatPosPermissionAction(action)} completed${suffix}.`);
    }
    return (<div className="flex min-w-0 flex-col gap-3">
      {message ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
          {message}
        </div>) : null}

      <section className={cn("min-w-0 gap-4", productGridVisible ? "grid xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]" : "flex flex-col")}>
        <main className={cn("min-w-0", productGridVisible && cartCollapsed ? "contents" : "flex flex-col gap-3")}>
          <Panel className={cn("overflow-hidden p-3 shadow-sm", productGridVisible && cartCollapsed && "xl:col-start-1 xl:row-start-1")}>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <label className="relative">
                <Barcode className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" aria-hidden="true"/>
                <input autoFocus className="h-[60px] w-full rounded-xl border border-primary/35 bg-background pl-12 pr-4 text-lg font-bold shadow-inner outline-none transition placeholder:text-sm placeholder:font-medium focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder={t("ui.search.or.scan.barcode.sku.product.name")} value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                scanBarcode();
            }
        }}/>
              </label>
              <button className="h-[60px] rounded-xl border border-primary/25 bg-primary/10 px-4 text-sm font-bold text-primary transition hover:bg-primary hover:text-primary-foreground" type="button" onClick={() => setFavoritesOpen(true)}>
                {t("ui.favorites")}
              </button>
              <button className="h-[60px] rounded-xl border border-border bg-background px-4 text-sm font-bold transition hover:border-primary hover:text-primary" type="button" onClick={toggleProductGrid}>
                {productGridVisible ? t("ui.hide.products") : t("ui.show.products")}
              </button>
              <div>
                <button className="h-[60px] rounded-xl border border-border bg-background px-5 text-sm font-bold transition hover:border-primary hover:text-primary" type="button" onClick={() => setMoreMenuOpen(true)}>
                  {t("ui.more")}
                </button>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {categories.map((category) => (<button className={cn("h-10 shrink-0 rounded-md border px-4 text-sm font-semibold transition", selectedCategory === category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground")} key={category} type="button" onClick={() => setSelectedCategory(category)}>
                  <span className="block max-w-36 truncate">{category}</span>
                </button>))}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
              {promotionBanners.map((banner) => (<div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary" key={banner}>
                  <BadgePercent className="size-4" aria-hidden="true"/>
                  {banner}
                </div>))}
            </div>
          </Panel>

          {productGridVisible ? (<section className={cn("grid min-w-0 gap-3 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:thin]", cartCollapsed ? "max-h-[812px] grid-cols-[repeat(auto-fit,minmax(155px,1fr))] xl:col-span-2 xl:row-start-2" : "max-h-[610px] grid-cols-[repeat(auto-fit,minmax(155px,1fr))]")}>
            {filteredProducts.map((product, index) => (<ProductGridItem key={productKey(product, index)} product={product} stockReferenceDate={stockReferenceDate} onClick={() => selectProductForSale(product)}/>))}
          </section>) : null}
        </main>

        <aside className={cn("flex min-w-0 flex-col gap-3", productGridVisible && cartCollapsed && "self-stretch xl:col-start-2 xl:row-start-1")}>
          <Panel className={cn("flex flex-col overflow-hidden shadow-lg", productGridVisible && cartCollapsed ? "h-full min-h-[96px]" : productGridVisible ? "h-full min-h-[420px]" : cartCollapsed ? "min-h-0" : "min-h-[420px]")}>
            {cartCollapsed ? (<div className="flex h-full min-h-[84px] items-center justify-between gap-3 bg-primary/5 p-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-muted-foreground">
                <h2 className="max-w-full truncate text-lg font-black tracking-tight text-foreground">{t("ui.shopping.cart")}</h2>
                <span className="shrink-0">{t("ui.bill")}: {billNo || receiptSettings.receiptPrefix}</span>
                <span className="shrink-0">{t("ui.time")}: {currentTime}</span>
                <span className="shrink-0">{cartItems.length} {t("ui.items")}</span>
                <span className="min-w-0 truncate text-xl font-black text-[#FACC15]">{formatLak(totalAmount)} LAK</span>
              </div>
              <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground" type="button" onClick={() => setCartCollapsed(false)} aria-label={t("ui.expand.cart")}>
                <ChevronDown className="size-5" aria-hidden="true"/>
              </button>
            </div>) : (<>
            <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 p-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-tight">{t("ui.shopping.cart")}</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">{cartItems.length} {t("ui.items")} - {formatLak(totalAmount)} LAK</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden text-right text-lg font-black text-[#FACC15] sm:block">{formatLak(totalAmount)} LAK</div>
                <button className="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground" type="button" onClick={() => setCartCollapsed((current) => !current)} aria-label={cartCollapsed ? t("ui.expand.cart") : t("ui.collapse.cart")}>
                  {cartCollapsed ? <ChevronDown className="size-5" aria-hidden="true"/> : <ChevronUp className="size-5" aria-hidden="true"/>}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border bg-background/60 px-4 py-2 text-xs">
              <CartMeta label={t("ui.bill.no")} value={billNo || receiptSettings.receiptPrefix}/>
              <CartMeta label={t("ui.customer")} value={selectedCustomer?.name ?? t("ui.guest")}/>
              <CartMeta label={t("ui.cashier")} value={cashierName || t("ui.current.user")}/>
              <CartMeta label={t("ui.time")} value={currentTime}/>
            </div>
            <div className={cn("flex-1 overflow-y-auto p-4", productGridVisible ? "max-h-[330px]" : "max-h-[54vh]")}>
              {cartItems.length === 0 ? (<div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-6 text-center text-base font-semibold text-muted-foreground">{t("ui.scan.or.search.product.to.start.sale")}</div>) : (<div className="flex flex-col gap-3">
                  {cartItems.map((item, index) => (<div className="rounded-xl border border-border bg-background p-3 shadow-sm" key={cartLineKey(item, index)}>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-background/70">
                          <PosProductImage className="size-full rounded-none border-0" imageClassName="object-cover" imageKey={item.imageKey} imageUrl={item.unitImageUrl} label={item.nameEn}/>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-base font-bold" title={item.nameEn}>{item.nameEn}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" title={`${item.sku} / ${item.unitName}`}>{item.sku} / {item.unitName}</div>
                          {item.stockWarning ? (<div className={cn("mt-1 truncate text-xs font-semibold", warningTextClass(item.stockWarning.tone))} title={item.stockWarning.label}>
                              {item.stockWarning.label}
                            </div>) : null}
                          {item.pricingNote ? (<div className="mt-1 truncate text-xs font-semibold text-primary" title={item.pricingNote}>{item.pricingNote}</div>) : null}
                        </div>
                        <button className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-danger transition hover:border-danger/50 hover:bg-danger/10" type="button" onClick={() => removeItem(item.id, item.unitId)} aria-label="Remove item">
                          <Trash2 className="size-4" aria-hidden="true"/>
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <QuantityStepper item={item} onChange={updateQuantity}/>
                        <div className="text-right">
                          <div className="text-lg font-black text-primary">{formatLak(item.priceLak * item.quantity)} LAK</div>
                          <div className="text-xs text-muted-foreground">{formatLak(item.priceLak)} / {item.unitName}</div>
                        </div>
                      </div>
                    </div>))}
                </div>)}
            </div>
            <div className="border-t border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">{t("ui.payment")}</h2>
              <button className="text-xs font-semibold text-primary" type="button" onClick={openMixedPayment}>
                {t("ui.split.payment")}
              </button>
            </div>
            <dl className="mt-3">
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 text-2xl font-black">
                <dt>{t("ui.total")}</dt>
                <dd className="text-[#FACC15]">{formatLak(totalAmount)} LAK</dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-5 gap-1">
              <PaymentButton active={paymentMode === "cash"} icon={Banknote} label={t("ui.cash")} onClick={() => selectPaymentMode("cash")}/>
              <PaymentButton active={paymentMode === "qr"} icon={QrCode} label="QR" onClick={() => selectPaymentMode("qr")}/>
              <PaymentButton active={paymentMode === "transfer"} icon={WalletCards} label={t("ui.bank")} onClick={() => selectPaymentMode("transfer")}/>
              <PaymentButton active={paymentMode === "card"} icon={CreditCard} label={t("ui.card")} onClick={() => selectPaymentMode("card")}/>
              <PaymentButton active={paymentMode === "mixed"} emphasis icon={ReceiptText} label={t("ui.mixed")} onClick={() => selectPaymentMode("mixed")}/>
            </div>

            {paymentMode === "mixed" ? (<div className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success">
              {t("ui.mixed.payment.configured")} - {formatLak(paidAmount)} LAK
            </div>) : (<PaymentFields availableQrBanks={availableQrBanks} cardAmount={cardAmount} cashAmount={cashAmount} heldBillCount={heldSales.length} heldBillsLoaded={heldBillsLoaded} holdDisabled={cartItems.length === 0} mode={paymentMode} onHoldBill={holdSale} onResumeBills={() => {
                void refreshHeldBillsFromServer();
                setHeldBillsOpen(true);
            }} qrAmount={qrAmount} selectedQrBankId={selectedQrBankId} setCardAmount={setCardAmount} setCashAmount={setCashAmount} setQrAmount={setQrAmount} setSelectedQrBankId={setSelectedQrBankId} setTransferAmount={setTransferAmount} transferAmount={transferAmount}/>) }

            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <Metric label={t("ui.paid")} value={`${formatLak(paidAmount)} LAK`}/>
              <Metric label={t("ui.due")} value={`${formatLak(dueAmount)} LAK`}/>
              <Metric label={t("ui.change")} value={`${formatLak(changeAmount)} LAK`}/>
            </dl>
            <button className="mt-4 h-16 w-full rounded-xl bg-primary text-[40px] font-black leading-none text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 disabled:opacity-60" type="button" onClick={completeSale} disabled={isPending}>
              {isPending ? t("ui.completing") : t("ui.pay")}
            </button>
            </div>
            </>)}
          </Panel>

          {demoMode && devDebug ? (<PosPermissionPanel auditEntries={auditEntries} pendingApprovals={pendingApprovals} policy={posPermissionPolicy} onApprove={(requestId) => resolvePendingApproval(requestId, "approved")} onReject={(requestId) => resolvePendingApproval(requestId, "rejected")} onTestAction={runControlledPosAction}/>) : null}

        </aside>
      </section>

      {mixedPaymentOpen ? (<MixedPaymentModal cardAmount={cardAmount} cashAmount={cashAmount} onClose={() => setMixedPaymentOpen(false)} qrAmount={qrAmount} setCardAmount={setCardAmount} setCashAmount={setCashAmount} setPaymentMode={setPaymentMode} setQrAmount={setQrAmount} setTransferAmount={setTransferAmount} totalAmount={totalAmount} transferAmount={transferAmount}/>) : null}

      {moreMenuOpen ? (<PosModal title={t("ui.more")} onClose={() => setMoreMenuOpen(false)}>
        <div className="grid gap-2 sm:grid-cols-2">
          <MoreMenuButton label={t("ui.recent.sales")} onClick={() => {
            if (enforcePosAction("view_recent_sales")) {
                refreshRecentSales();
                setRecentSalesOpen(true);
                setMoreMenuOpen(false);
            }
        }}/>
          <MoreMenuButton label={t("ui.hold.bills.resume.bills")} onClick={() => {
            void refreshHeldBillsFromServer();
            setHeldBillsOpen(true);
            setMoreMenuOpen(false);
        }}/>
          <MoreMenuButton label={t("ui.cash.shift.count")} onClick={() => {
            setCashShiftCountOpen(true);
            setMoreMenuOpen(false);
        }}/>
          <MoreMenuButton label={uiLocale === "th" ? "รายงานกะของฉัน" : "Own Shift Report"} onClick={() => {
            setOwnShiftReportOpen(true);
            setMoreMenuOpen(false);
        }}/>
          <MoreMenuButton label={t("ui.member.search")} onClick={() => {
            setMemberSearchOpen(true);
            setMoreMenuOpen(false);
        }}/>
          <MoreMenuButton label={t("ui.refund.void")} onClick={() => {
            if (enforcePosAction("view_recent_sales")) {
                openReturnExchange("return");
            }
        }}/>
          <MoreMenuButton label={t("ui.cash.in.cash.out")} onClick={() => {
            setCashShiftCountOpen(true);
            setMoreMenuOpen(false);
        }}/>
          <MoreMenuButton label={t("ui.print.reprint.receipt")} onClick={() => {
            if (lastReceipt) {
                setReceiptAutoPrint(false);
                setReceiptOpen(true);
            }
            else if (enforcePosAction("view_recent_sales")) {
                refreshRecentSales();
                setRecentSalesOpen(true);
            }
            setMoreMenuOpen(false);
        }}/>
        </div>
      </PosModal>) : null}

      {favoritesOpen ? (<PosModal title={t("ui.favorites")} onClose={() => setFavoritesOpen(false)}>
        {favoriteProducts.length === 0 ? (<div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("ui.no.favorite.products.yet")}</div>) : (<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteProducts.map((product, index) => (<ProductGridItem key={productKey(product, index)} product={product} stockReferenceDate={stockReferenceDate} onClick={() => {
            addToCart(product);
            setFavoritesOpen(false);
        }}/>))}
        </div>)}
      </PosModal>) : null}

      {heldBillsOpen ? (<PosModal title={t("ui.hold.bills.resume.bills")} onClose={() => setHeldBillsOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton icon={RotateCcw} label={heldBillsBusy ? "Loading..." : t("ui.resume.bills")} onClick={() => {
            void resumeSale().then((resumed) => {
                if (resumed) setHeldBillsOpen(false);
            });
        }}/>
            <ActionButton icon={ReceiptText} label={heldBillsBusy ? "Saving..." : t("ui.hold.bills")} onClick={() => {
            void holdSale().then((held) => {
                if (held) setHeldBillsOpen(false);
            });
        }}/>
          </div>
          <select className="field-input h-11 text-sm" value={selectedHeldSaleId} onChange={(event) => setSelectedHeldSaleId(event.target.value)}>
            <option value="">{t("ui.held.bills")}</option>
            {heldSales.map((sale) => (<option key={sale.id} value={sale.id}>
                {sale.saleNo} - {formatLak(sale.totalLak)} LAK - {sale.itemCount} items
              </option>))}
          </select>
          <button className="h-11 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={heldBillsBusy || !selectedHeldSaleId} onClick={() => void deleteHeldSale()}>
            {t("ui.delete.held.bill")}
          </button>
        </div>
      </PosModal>) : null}

      {heldBillConflict ? (<PosModal title="Current cart has items" onClose={() => setHeldBillConflict(null)}>
        <div className="grid gap-3 text-sm">
          <p className="text-muted-foreground">Hold the current cart before restoring {heldBillConflict.saleNo}, or keep working on the current bill.</p>
          <button className="h-11 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={heldBillsBusy} onClick={() => void holdCurrentAndResume()}>
            {heldBillsBusy ? "Saving current bill..." : "Hold Current Bill & Resume"}
          </button>
          <button className="h-11 rounded-md border border-border px-3 font-semibold" type="button" onClick={() => setHeldBillConflict(null)}>
            Continue Current Bill
          </button>
          <button className="h-11 rounded-md border border-danger/40 px-3 font-semibold text-danger" type="button" onClick={() => setHeldBillConflict(null)}>
            Cancel
          </button>
        </div>
      </PosModal>) : null}

      {memberSearchOpen ? (<PosModal title={t("ui.member.search")} onClose={() => setMemberSearchOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input className="field-input h-11 text-sm" placeholder={t("ui.phone.name.or.member.no")} value={membershipQuery} onChange={(event) => setMembershipQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                searchMembership();
            }
        }}/>
            <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={searchMembership}>
              {t("ui.find.member")}
            </button>
          </div>
          <CustomerCard
            customer={selectedCustomer}
            loyaltyEnabled={loyaltySettings.loyaltyEnabled}
            maxRedeemPoints={maxRedeemablePoints}
            minRedeemPoints={loyaltySettings.loyaltyMinRedeemPoints}
            redeemPoints={effectiveRedeemPoints}
            onRedeemPointsChange={setRedeemPoints}
            redeemDiscountLak={loyaltyRedeemDiscount}
          />
        </div>
      </PosModal>) : null}

      {cashShiftCountOpen ? (<PosModal title={t("ui.cash.shift.count")} onClose={() => setCashShiftCountOpen(false)}>
        <StaffControl businessDate={businessDate} expanded={staffControlExpanded} actualClosingCash={actualClosingCash} cashDifference={cashDifference} cashSales={cashSales} closingSummaryVisible={closingSummaryVisible} expectedCash={expectedCash} openingCashCounts={openingCashCounts} openingCashTotal={effectiveOpeningCash} otEndedAt={otEndedAt} otHours={otHours} otStartedAt={otStartedAt} selectedStaffName={selectedStaffName} staffOptions={staffOptions} staffStatus={staffStatus} workEndedAt={workEndedAt} workHours={workHours} workStartedAt={workStartedAt} onEndOt={recordEndOt} onEndWork={recordEndWork} onSetActualClosingCash={setActualClosingCash} onSelectStaff={setSelectedStaffName} onStartOt={recordStartOt} onStartWork={recordStartWork} onToggleExpanded={() => setStaffControlExpanded((current) => !current)} onUpdateOpeningCashCount={updateOpeningCashCount} qrTransferSales={qrTransferSales}/>
      </PosModal>) : null}

      {unitSelectionProduct ? (<UnitSelectorModal product={unitSelectionProduct} onClose={() => setUnitSelectionProduct(null)} onSelect={(unit) => addToCart(unitSelectionProduct, unit)}/>) : null}

      {saleCompletedReceipt ? (<SaleCompletedModal receipt={saleCompletedReceipt} printMode={receiptPrintMode} onClose={() => setSaleCompletedReceipt(null)} onNewSale={() => setSaleCompletedReceipt(null)} onPrint={() => {
            setLastReceipt(saleCompletedReceipt);
            setReceiptAutoPrint(true);
            setReceiptOpen(true);
            setSaleCompletedReceipt(null);
        }} onView={() => {
            setLastReceipt(saleCompletedReceipt);
            setReceiptAutoPrint(false);
            setReceiptOpen(true);
            setSaleCompletedReceipt(null);
        }}/>) : null}

      {recentSalesOpen ? (<RecentSalesModal currentRole={posPermissionPolicy.role} filter={recentSalesFilter} sales={filteredRecentSales} search={recentSalesSearch} showDeleted={recentSalesShowDeleted} customEnd={recentSalesCustomEnd} customStart={recentSalesCustomStart} onClose={() => setRecentSalesOpen(false)} onCustomEnd={setRecentSalesCustomEnd} onCustomStart={setRecentSalesCustomStart} onDuplicate={duplicateSaleToCart} onEditField={editSaleField} onExchange={(sale) => openReturnExchange("exchange", sale)} onFilter={setRecentSalesFilter} onRefund={refundSale} onReprint={(sale) => openReceiptForSale(sale, true)} onSearch={setRecentSalesSearch} onShowDeleted={setRecentSalesShowDeleted} onSoftDelete={softDeleteSale} onViewReceipt={(sale) => openReceiptForSale(sale)} onVoid={voidSale}/>) : null}
      {returnExchangeOpen ? (<ReturnExchangeVoidModal initialSaleId={returnExchangeSaleId} initialTab={returnExchangeTab} onClose={() => setReturnExchangeOpen(false)} onCompleted={(nextMessage) => { setMessage(nextMessage); void refreshRecentSalesFromServer(); }}/>) : null}

      {managerApprovalRequest ? (<ManagerApprovalModal action={managerApprovalRequest.action} pin={managerApprovalPin} reason={managerApprovalReason} sale={managerApprovalRequest.sale} onClose={closeManagerApprovalRequest} onPinChange={setManagerApprovalPin} onReasonChange={setManagerApprovalReason} onSubmit={submitManagerApprovalRequest}/>) : null}
      {ownShiftReportOpen ? <OwnShiftReportModal locale={uiLocale} onClose={() => setOwnShiftReportOpen(false)} /> : null}

      {receiptOpen && lastReceipt ? (<ReceiptPreview autoPrint={receiptAutoPrint} branchName={lastReceipt.branchName} cashierName={lastReceipt.cashierName} cartItems={lastReceipt.cartItems} changeAmount={lastReceipt.changeAmount} createdAt={lastReceipt.createdAt} customerName={lastReceipt.customerName} discountTotal={lastReceipt.discountTotal} onClose={() => {
            setReceiptOpen(false);
            setReceiptAutoPrint(false);
        }} onReprint={() => enforcePosAction("reprint_receipt")} paidAmount={lastReceipt.paidAmount} paymentMode={lastReceipt.paymentMode} receiptNo={lastReceipt.receiptNo} receiptSettings={receiptSettings} saleNo={lastReceipt.saleNo} showTaxOnReceipt={receiptSettings.showTaxOnReceipt} subtotal={lastReceipt.subtotal} taxAmount={lastReceipt.taxAmount} totalAmount={lastReceipt.totalAmount}/>) : null}
    </div>);
}
function Panel({ children, className }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <section className={cn("min-w-0 rounded-lg border border-border bg-card", className)}>{children}</section>;
}
function PosModal({ children, onClose, title }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
}) {
    return <PosWorkspaceModal onClose={onClose} title={title}>{children}</PosWorkspaceModal>;
}
function MoreMenuButton({ label, onClick }: {
    label: string;
    onClick: () => void;
}) {
    return (<button className="flex min-h-14 w-full items-center rounded-xl border border-border bg-background px-4 text-left text-sm font-bold transition hover:border-primary hover:bg-primary/10 hover:text-primary" type="button" onClick={onClick}>
      {label}
    </button>);
}
function CustomerCard({ customer, loyaltyEnabled = false, maxRedeemPoints = 0, minRedeemPoints = 1, onRedeemPointsChange, redeemDiscountLak = 0, redeemPoints = 0, }: {
    customer: PosCustomer | null;
    loyaltyEnabled?: boolean;
    maxRedeemPoints?: number;
    minRedeemPoints?: number;
    onRedeemPointsChange?: (value: number) => void;
    redeemDiscountLak?: number;
    redeemPoints?: number;
}) {
    if (!customer) {
        return (<div className="mt-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">{t("ui.guest.sale.search.for.member.pricing")}</div>);
    }
    const active = isMembershipActive(customer);
    return (<div className="mt-2 rounded-md border border-border bg-background p-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{customer.name}</div>
          <div className="text-[11px] text-muted-foreground">{customer.phone}</div>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", active ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {customer.membershipStatus}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <InfoLine label="Type" value={customer.membershipType}/>
        <InfoLine label={t("ui.member.no")} value={customer.membershipNumber}/>
        <InfoLine label="Expiry" value={customer.membershipExpiry}/>
        <InfoLine label="Points" value={String(customer.pointsBalance)}/>
      </div>
      {loyaltyEnabled && active && customer.pointsBalance >= minRedeemPoints ? (
        <div className="mt-2 space-y-1 rounded-md border border-border p-2">
          <label className="block text-[11px] font-semibold" htmlFor="redeem-points">
            Redeem points ({minRedeemPoints} min, max {maxRedeemPoints})
          </label>
          <input
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            id="redeem-points"
            max={maxRedeemPoints}
            min={0}
            onChange={(event) => onRedeemPointsChange?.(Math.max(0, Number(event.target.value) || 0))}
            type="number"
            value={redeemPoints}
          />
          {redeemDiscountLak > 0 ? (
            <div className="text-[11px] text-primary">Redeem discount: {formatLak(redeemDiscountLak)} LAK</div>
          ) : null}
        </div>
      ) : null}
      {customer.membershipType === "Student" ? (<div className="mt-1.5 rounded-md bg-primary/10 p-1.5 text-[11px] text-primary">
          <div className="flex items-center gap-1 font-semibold"><GraduationCap className="size-4" aria-hidden="true"/> Student verified</div>
          <div className="line-clamp-1">{customer.schoolName} - {customer.studentIdNumber}</div>
          <div>Card upload: {customer.studentCardUrl ? "Stored" : "Missing"}</div>
        </div>) : null}
    </div>);
}
function InfoLine({ label, muted = false, strike = false, value }: {
    label: string;
    muted?: boolean;
    strike?: boolean;
    value: string;
}) {
    return (<div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("truncate font-semibold", muted && "text-muted-foreground", strike && "line-through decoration-muted-foreground/70")}>{value}</div>
    </div>);
}
function ProductGridItem({ onClick, product, stockReferenceDate, }: {
    onClick: () => void;
    product: PosProduct;
    stockReferenceDate: Date;
}) {
    return (<>
      <button className="group relative min-h-[190px] min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15" type="button" onClick={onClick} title={`${product.nameEn} / ${product.sku}`}>
        <PosProductImage className="absolute inset-0 size-full rounded-none border-0" imageClassName="object-cover" imageKey={product.imageKey} imageUrl={product.unitImageUrl} label={product.nameEn}/>
        <div className="absolute inset-x-0 bottom-0 min-w-0 overflow-hidden bg-gradient-to-t from-black/90 via-black/75 to-black/10 p-3 pt-8 text-white backdrop-blur-[2px]">
          <div className="line-clamp-2 max-w-full overflow-hidden break-words text-[12px] font-black leading-snug text-white" title={product.nameEn}>{product.nameEn}</div>
          <div className="mt-1 max-w-full truncate font-mono text-[10px] font-semibold text-white/70" title={product.sku}>{product.sku}</div>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-2 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <div className="truncate text-[16px] font-black leading-none text-primary" title={`${formatLak(product.priceLak)} LAK`}>{formatLak(product.priceLak)} LAK</div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-white/75" title={product.unitName}>{product.unitName}</div>
            </div>
            <StockBadge product={product} stockReferenceDate={stockReferenceDate}/>
          </div>
        </div>
      </button>
    </>);
}
function CartMeta({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="min-w-0">
      <span className="text-muted-foreground">{label}: </span>
      <span className="truncate font-semibold">{value}</span>
    </div>);
}
function StockBadge({ product, stockReferenceDate }: {
    product: PosProduct;
    stockReferenceDate: Date;
}) {
    const warning = getStockWarning(product, stockReferenceDate);
    return (<span className={cn("max-w-[6.5rem] shrink-0 truncate whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold shadow-sm", warning ? warningBadgeClass(warning.tone) : "bg-primary/20 text-primary")} title={warning ? warning.label : `${product.stockQty} left`}>
      {warning ? warning.label : `${product.stockQty} left`}
    </span>);
}
function QuantityStepper({ item, onChange }: {
    item: PosCartItem;
    onChange: (productId: string, quantity: number, unitId?: string) => void;
}) {
    const maxSaleQty = Math.max(1, maxSellQty(item.stockQty, item.conversionQty ?? 1));
    return (<div className="inline-flex h-11 items-center rounded-xl border border-border bg-card">
      <button className="grid size-11 place-items-center" type="button" onClick={() => onChange(item.id, item.quantity - 1, item.unitId)} aria-label="Decrease quantity">
        <Minus aria-hidden="true"/>
      </button>
      <PosNumberInput className="h-11 w-16 border-x border-border bg-transparent text-center text-base font-bold outline-none" max={maxSaleQty} min={1} value={item.quantity} onValueChange={(value) => onChange(item.id, value, item.unitId)}/>
      <button className="grid size-11 place-items-center" type="button" onClick={() => onChange(item.id, item.quantity + 1, item.unitId)} aria-label="Increase quantity">
        <Plus aria-hidden="true"/>
      </button>
    </div>);
}
function Field({ children, label }: {
    children: React.ReactNode;
    label: string;
}) {
    return (<label className="flex flex-col gap-1 text-xs font-semibold">
      {label}
      {children}
    </label>);
}
function PaymentFields({ availableQrBanks, cardAmount, cashAmount, heldBillCount, heldBillsLoaded, holdDisabled, mode, onHoldBill, onResumeBills, qrAmount, selectedQrBankId, setCardAmount, setCashAmount, setQrAmount, setSelectedQrBankId, setTransferAmount, transferAmount, }: {
    availableQrBanks: QrBank[];
    cardAmount: number;
    cashAmount: number;
    heldBillCount: number;
    heldBillsLoaded: boolean;
    holdDisabled: boolean;
    mode: PaymentMode;
    onHoldBill: () => void;
    onResumeBills: () => void;
    qrAmount: number;
    selectedQrBankId: string;
    setCardAmount: (value: number) => void;
    setCashAmount: (value: number) => void;
    setQrAmount: (value: number) => void;
    setSelectedQrBankId: (value: string) => void;
    setTransferAmount: (value: number) => void;
    transferAmount: number;
}) {
    return (<div className="mt-3 grid gap-2 sm:grid-cols-2">
      {(mode === "cash" || mode === "mixed") ? (<div className="grid gap-1 text-xs font-semibold sm:col-span-2">
          <span>Cash Amount</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <PosNumberInput className="field-input" value={cashAmount} onValueChange={setCashAmount}/>
            <button className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-border disabled:hover:text-muted-foreground" type="button" onClick={onHoldBill} disabled={holdDisabled}>
              Hold Bill
            </button>
            <button className={cn("h-11 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground", heldBillCount > 0 ? "border-[#F59E0B]/60 bg-[#F59E0B] text-white hover:bg-[#D97706]" : "")} type="button" onClick={onResumeBills} disabled={heldBillsLoaded && heldBillCount === 0}>
              Resume Bills{heldBillCount > 0 ? ` (${heldBillCount})` : ""}
            </button>
          </div>
        </div>) : null}
      {(mode === "qr" || mode === "mixed") ? (<>
          <Field label="QR Bank">
            <select className="field-input" value={selectedQrBankId} onChange={(event) => setSelectedQrBankId(event.target.value)}>
              {availableQrBanks.map((bank) => (<option key={bank.id} value={bank.id}>{bank.bankName}</option>))}
            </select>
          </Field>
          <Field label="QR Amount">
            <PosNumberInput className="field-input" value={qrAmount} onValueChange={setQrAmount}/>
          </Field>
        </>) : null}
      {(mode === "transfer" || mode === "mixed") ? (<Field label="Bank Transfer">
          <PosNumberInput className="field-input" value={transferAmount} onValueChange={setTransferAmount}/>
        </Field>) : null}
      {(mode === "card" || mode === "mixed") ? (<Field label="Card Amount">
          <PosNumberInput className="field-input" value={cardAmount} onValueChange={setCardAmount}/>
        </Field>) : null}
    </div>);
}
function Metric({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>);
}
function StaffControl({ actualClosingCash, businessDate, cashDifference, cashSales, closingSummaryVisible, expanded, expectedCash, openingCashCounts, openingCashTotal, onEndOt, onEndWork, onSetActualClosingCash, onSelectStaff, onStartOt, onStartWork, onToggleExpanded, onUpdateOpeningCashCount, otEndedAt, otHours, otStartedAt, selectedStaffName, staffOptions, staffStatus, workEndedAt, workHours, workStartedAt, qrTransferSales, }: {
    actualClosingCash: number;
    businessDate: string;
    cashDifference: number;
    cashSales: number;
    closingSummaryVisible: boolean;
    expanded: boolean;
    expectedCash: number;
    openingCashCounts: Record<number, number>;
    openingCashTotal: number;
    otEndedAt: Date | null;
    otHours: number;
    otStartedAt: Date | null;
    selectedStaffName: string;
    staffOptions: string[];
    staffStatus: string;
    workEndedAt: Date | null;
    workHours: number;
    workStartedAt: Date | null;
    onEndOt: () => void;
    onEndWork: () => void;
    onSetActualClosingCash: (value: number) => void;
    onSelectStaff: (staffName: string) => void;
    onStartOt: () => void;
    onStartWork: () => void;
    onToggleExpanded: () => void;
    onUpdateOpeningCashCount: (denomination: number, quantity: number) => void;
    qrTransferSales: number;
}) {
    const CollapseIcon = expanded ? ChevronUp : ChevronDown;
    const isWorking = staffStatus === "Working";
    const isOt = staffStatus === "OT";
    return (<section className="min-w-0 scroll-mt-24 rounded-lg border border-border bg-card p-3" id="staff-control">
      <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={onToggleExpanded} aria-expanded={expanded}>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true"/>
          <div className="min-w-0 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">{t("ui.cash.shift.count")}</h3>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{businessDate}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", staffStatusClassName(staffStatus))}>{staffStatus}</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
              Work {workHours.toFixed(2)}h | OT {otHours.toFixed(2)}h
            </div>
          </div>
        </div>
        <CollapseIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
      </button>

      {!expanded ? null : (<>
          <div className="mt-3 rounded-md border border-[#FFD700]/35 bg-[#FFD700]/10 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#FFD700]">Opening Cash Total</div>
            <div className="mt-1 text-2xl font-black leading-none text-[#FFD700]">{formatLak(openingCashTotal)} LAK</div>
          </div>

          <label className="mt-3 grid gap-1 text-xs font-semibold">
            Staff
            <select className="field-input h-9 text-xs" value={selectedStaffName} onChange={(event) => onSelectStaff(event.target.value)}>
              {staffOptions.map((staffName) => (<option key={staffName} value={staffName}>
                  {staffName}
                </option>))}
            </select>
          </label>

          <div className="mt-2 grid grid-cols-2 gap-1">
            <StaffButton active={isWorking} tone="success" label="Start Work" onClick={onStartWork}/>
            <StaffButton label="End Work" onClick={onEndWork}/>
            <StaffButton active={isOt} tone="warning" label="Start OT" onClick={onStartOt}/>
            <StaffButton label="End OT" onClick={onEndOt}/>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-2 text-[11px]">
            <StaffTime label="Start Work" value={formatStaffTime(workStartedAt)}/>
            <StaffTime label="End Work" value={formatStaffTime(workEndedAt)}/>
            <StaffTime label="Start OT" value={formatStaffTime(otStartedAt)}/>
            <StaffTime label="End OT" value={formatStaffTime(otEndedAt)}/>
            <StaffTime label="Work Hours" value={workHours.toFixed(2)} strong/>
            <StaffTime label="OT Hours" value={otHours.toFixed(2)} strong/>
          </div>

          <div className="mt-2 rounded-md border border-border bg-background p-2">
            <div className="mb-2 text-xs font-semibold">
              <span>Opening Cash Count</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {OPENING_CASH_DENOMINATIONS.map((denomination) => (<label className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2 text-[11px]" key={denomination}>
                  <span className="font-semibold">{formatLak(denomination)}</span>
                  <PosNumberInput className="h-8 min-w-0 rounded-md border border-border bg-card px-1 text-center text-[11px] font-semibold outline-none transition focus:border-primary" min={0} value={openingCashCounts[denomination] ?? 0} onValueChange={(value) => onUpdateOpeningCashCount(denomination, value)}/>
                </label>))}
            </div>
          </div>

          <div className="mt-2 rounded-md border border-border bg-background p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">Closing Summary</div>
              {closingSummaryVisible ? (<span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">Confirm required</span>) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <SettlementValue label="Cash Sales" value={`${formatLak(cashSales)} LAK`}/>
              <SettlementValue label="QR / Transfer" value={`${formatLak(qrTransferSales)} LAK`}/>
              <SettlementValue label="Expected Cash" value={`${formatLak(expectedCash)} LAK`} strong/>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Actual Cash</span>
                <PosNumberInput className="h-9 rounded-md border border-border bg-card px-2 text-xs font-semibold outline-none transition focus:border-primary" value={actualClosingCash} onValueChange={onSetActualClosingCash}/>
              </label>
            </div>
            <div className={cn("mt-2 rounded-md border px-2 py-2 text-xs font-semibold", cashDifference === 0
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/40 bg-danger/10 text-danger")}>
              Cash Difference: {formatLak(cashDifference)} LAK
            </div>
            {closingSummaryVisible ? (<button className="mt-2 h-9 w-full rounded-md border border-primary/40 bg-primary/10 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground" type="button">
                Confirm Closing Summary
              </button>) : null}
          </div>
        </>)}
    </section>);
}
function StaffTime({ label, strong = false, value }: {
    label: string;
    strong?: boolean;
    value: string;
}) {
    return (<div>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", strong && "text-primary")}>{value}</div>
    </div>);
}
function StaffButton({ active = false, label, onClick, tone = "neutral" }: {
    active?: boolean;
    label: string;
    onClick: () => void;
    tone?: "neutral" | "success" | "warning";
}) {
    return (<button className={cn("h-8 rounded-md border px-2 text-[11px] font-semibold transition hover:border-primary", active && tone === "success"
            ? "border-success bg-success text-white shadow-sm"
            : active && tone === "warning"
                ? "border-warning bg-warning text-black shadow-sm"
                : "border-border bg-card")} type="button" onClick={onClick}>
      {label}
    </button>);
}
function SettlementValue({ label, strong = false, value }: {
    label: string;
    strong?: boolean;
    value: string;
}) {
    return (<div>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", strong && t("ui.text.ffd700"))}>{value}</div>
    </div>);
}
function staffStatusClassName(status: string) {
    if (status === "Working")
        return "bg-success/15 text-success";
    if (status === "OT")
        return "bg-warning/15 text-warning";
    if (status === "Closed")
        return "bg-danger/15 text-danger";
    return "bg-muted text-muted-foreground";
}
function PosNumberInput({ className, max, min = 0, onValueChange, value, }: {
    className?: string;
    max?: number;
    min?: number;
    value: number;
    onValueChange: (value: number) => void;
}) {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => {
        setDraft(String(value));
    }, [value]);
    function normalize(rawValue: string) {
        const digits = rawValue.replace(/[^\d]/g, "");
        if (!digits)
            return "";
        return digits.replace(/^0+(?=\d)/, "");
    }
    function commit(rawValue: string) {
        const normalized = normalize(rawValue);
        const numericValue = normalized ? Number(normalized) : 0;
        const clampedValue = Math.min(Math.max(numericValue, min), max ?? Number.MAX_SAFE_INTEGER);
        onValueChange(clampedValue);
        setDraft(String(clampedValue));
    }
    return (<input className={className} inputMode="numeric" type="text" value={draft} onBlur={() => commit(draft)} onChange={(event) => {
            const normalized = normalize(event.target.value);
            setDraft(normalized);
            onValueChange(normalized ? Number(normalized) : 0);
        }} onFocus={() => {
            if (value === 0)
                setDraft("");
        }}/>);
}
function PaymentButton({ active, emphasis = false, icon: Icon, label, onClick }: {
    active: boolean;
    emphasis?: boolean;
    icon: typeof Banknote;
    label: string;
    onClick: () => void;
}) {
    const isMixed = emphasis;
    return (<button className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-bold transition", active
            ? isMixed
                ? "border-success bg-success text-white shadow-sm"
                : "border-primary bg-primary text-primary-foreground"
            : isMixed
                ? "border-success/50 bg-success/10 text-success hover:bg-success hover:text-white"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground")} type="button" onClick={onClick}>
      <Icon className="size-5" aria-hidden="true"/>
      {label}
    </button>);
}
function PosPermissionPanel({ auditEntries, onApprove, onReject, onTestAction, pendingApprovals, policy, }: {
    auditEntries: PosAuditEntry[];
    onApprove: (requestId: string) => void;
    onReject: (requestId: string) => void;
    onTestAction: (action: PosPermissionAction) => void;
    pendingApprovals: PosPendingApprovalRequest[];
    policy: PosPermissionPolicy;
}) {
    const controlledActions: PosPermissionAction[] = [
        "refund_bill",
        "void_bill",
        "manual_price_override",
        "delete_item_from_bill",
        "apply_discount",
        "cash_in",
        "cash_out",
        "reprint_receipt",
        "split_payment",
        "multi_currency_payment",
    ];
    const pending = pendingApprovals.filter((request) => request.status === "pending");
    const allowedActions = Object.entries(policy.permissions)
        .filter(([, allowed]) => allowed)
        .map(([action]) => action as PosPermissionAction);
    const blockedActions = Object.entries(policy.permissions)
        .filter(([, allowed]) => !allowed)
        .map(([action]) => action as PosPermissionAction);
    const approvalActions = Object.keys(policy.approvalRules) as PosPermissionAction[];
    return (<Panel className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Demo Permission Debug Panel</h2>
          <p className="mt-1 text-xs text-muted-foreground">POS permission reality verification support</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{pending.length} pending</span>
      </div>
      <div className="mt-3 grid gap-2 rounded-md border border-border bg-background p-2 text-[11px]">
        <DebugLine label="Current user" value={`${policy.displayName} (${policy.username})`}/>
        <DebugLine label="Role" value={policy.role}/>
        <DebugLine label="Branch" value={policy.branchName}/>
        <DebugLine label="Terminal" value={policy.assignedTerminal}/>
        <DebugLine label="Discount limit" value={`${policy.maxDiscountPercent}%`}/>
      </div>
      <div className="mt-3 grid gap-2 text-[11px]">
        <ActionSummary title="Allowed POS actions" actions={allowedActions}/>
        <ActionSummary title="Blocked POS actions" actions={blockedActions}/>
        <ActionSummary title="Approval-required actions" actions={approvalActions}/>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1">
        {controlledActions.map((action) => (<button className="min-h-8 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold transition hover:border-primary" key={action} type="button" onClick={() => onTestAction(action)}>
            {formatPosPermissionAction(action)}
          </button>))}
      </div>
      <div className="mt-3 rounded-md border border-border bg-background p-2">
        <div className="text-xs font-semibold">Pending Approval Center</div>
        {pending.length === 0 ? (<p className="mt-2 text-xs text-muted-foreground">No pending POS approvals.</p>) : (<div className="mt-2 grid gap-2">
            {pending.slice(0, 3).map((request) => (<div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" key={request.id}>
                <div className="font-semibold">{formatPosPermissionAction(request.action)}</div>
                <div className="mt-1 text-muted-foreground">{request.reason}</div>
                <div className="mt-2 flex gap-2">
                  {policy.role === "Owner" ? (<>
                    <button className="h-8 rounded-md bg-success px-3 text-[11px] font-semibold text-white" type="button" onClick={() => onApprove(request.id)}>Approve</button>
                    <button className="h-8 rounded-md border border-danger/40 px-3 text-[11px] font-semibold text-danger" type="button" onClick={() => onReject(request.id)}>Reject</button>
                  </>) : (<span className="text-[11px] font-semibold text-warning">Owner approval required</span>)}
                </div>
              </div>))}
          </div>)}
      </div>
      <div className="mt-3 rounded-md border border-border bg-background p-2">
        <div className="text-xs font-semibold">Audit Log</div>
        {auditEntries.length === 0 ? (<p className="mt-2 text-xs text-muted-foreground">No POS audit entries yet.</p>) : (<div className="mt-2 grid gap-1">
            {auditEntries.slice(0, 4).map((entry) => (<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[11px]" key={entry.id}>
                <span className="truncate">{formatPosPermissionAction(entry.action)} - {entry.result}</span>
                <span className="font-semibold text-primary">{entry.approvalStatus}</span>
              </div>))}
          </div>)}
      </div>
    </Panel>);
}
function DebugLine({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="flex min-w-0 justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>);
}
function ActionSummary({ actions, title }: {
    actions: PosPermissionAction[];
    title: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-2">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {actions.length === 0 ? (<span className="text-muted-foreground">None</span>) : actions.map((action) => (<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground" key={action}>{formatPosPermissionAction(action)}</span>))}
      </div>
    </div>);
}
function UnitSelectorModal({ onClose, onSelect, product, }: {
    onClose: () => void;
    onSelect: (unit: PosProductUnit) => void;
    product: PosProduct;
}) {
    const units = getSaleUnits(product);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Select sale unit</h2>
            <p className="mt-1 text-sm text-muted-foreground">{product.nameEn || product.nameLo}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close unit selector">
            <X className="size-4" aria-hidden="true"/>
          </button>
        </div>
        <div className="mt-5 grid gap-2">
          {units.map((unit) => (<button className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-left transition hover:border-primary" key={unit.id} type="button" onClick={() => onSelect(unit)}>
              <span>
                <span className="block font-semibold">{unit.unitName}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {unit.conversionQty} base units {unit.barcode ? `| ${unit.barcode}` : t("ui.manual.select")}
                </span>
              </span>
              <span className="text-right font-semibold text-primary">{formatLak(unit.sellingPriceLak)} LAK</span>
            </button>))}
        </div>
      </section>
    </div>);
}
function ActionButton({ icon: Icon, label, onClick }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return (<button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClick}>
      <Icon className="size-4" aria-hidden="true"/>
      {label}
    </button>);
}
function MixedPaymentModal({ cardAmount, cashAmount, onClose, qrAmount, setCardAmount, setCashAmount, setPaymentMode, setQrAmount, setTransferAmount, totalAmount, transferAmount, }: {
    cardAmount: number;
    cashAmount: number;
    onClose: () => void;
    qrAmount: number;
    setCardAmount: (value: number) => void;
    setCashAmount: (value: number) => void;
    setPaymentMode: (mode: PaymentMode) => void;
    setQrAmount: (value: number) => void;
    setTransferAmount: (value: number) => void;
    totalAmount: number;
    transferAmount: number;
}) {
    const paid = cashAmount + qrAmount + cardAmount + transferAmount;
    const valid = paid >= totalAmount;
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Mixed Payment</h2>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close mixed payment">
            <X aria-hidden="true"/>
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cash Amount">
            <PosNumberInput className="field-input" value={cashAmount} onValueChange={setCashAmount}/>
          </Field>
          <Field label="QR Amount">
            <PosNumberInput className="field-input" value={qrAmount} onValueChange={setQrAmount}/>
          </Field>
          <Field label="Card Amount">
            <PosNumberInput className="field-input" value={cardAmount} onValueChange={setCardAmount}/>
          </Field>
          <Field label="Transfer Amount">
            <PosNumberInput className="field-input" value={transferAmount} onValueChange={setTransferAmount}/>
          </Field>
        </div>
        <div className={cn("mt-4 rounded-md border p-3 text-sm font-semibold", valid ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning")}>
          Paid {formatLak(paid)} LAK / Total {formatLak(totalAmount)} LAK
        </div>
        <button className="mt-4 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" onClick={() => { setPaymentMode("mixed"); onClose(); }}>
          Apply Mixed Payment
        </button>
      </div>
    </div>);
}
function SaleCompletedModal({ onClose, onNewSale, onPrint, onView, printMode, receipt }: {
    onClose: () => void;
    onNewSale: () => void;
    onPrint: () => void;
    onView: () => void;
    printMode: ReceiptPrintMode;
    receipt: ReceiptSnapshot;
}) {
    return (<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl" data-print-mode={printMode}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("ui.payment.completed")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.do.you.want.to.print.receipt")}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label={t("ui.close")}>
            <X className="size-4" aria-hidden="true"/>
          </button>
        </div>
        <dl className="mt-4 grid gap-2 rounded-md border border-border bg-background p-3 text-sm">
          <InfoLine label="Bill number" value={receipt.saleNo}/>
          <InfoLine label="Total" value={`${formatLak(receipt.totalAmount)} LAK`}/>
          <InfoLine label="Payment method" value={receipt.paymentMode.toUpperCase()}/>
          <InfoLine label="Cashier" value={receipt.cashierName}/>
          <InfoLine label="Date/time" value={formatReceiptDateTime(receipt.createdAt)}/>
        </dl>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={onPrint}>
            {t("ui.print.receipt")}
          </button>
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onView}>
            {t("ui.view.receipt")}
          </button>
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onNewSale}>
            {t("ui.save.and.new.sale")}
          </button>
        </div>
      </div>
    </div>);
}
function ManagerApprovalModal({ action, onClose, onPinChange, onReasonChange, onSubmit, pin, reason, sale }: {
    action: "refund" | "void";
    onClose: () => void;
    onPinChange: (value: string) => void;
    onReasonChange: (value: string) => void;
    onSubmit: () => void;
    pin: string;
    reason: string;
    sale: DemoSaleRecord;
}) {
    const label = action === "refund" ? "Refund" : "Void";
    return (<PosModal title={`Manager approval: ${label}`} onClose={onClose}>
      <div className="grid gap-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-semibold">{sale.saleNo}</p>
              <p className="text-xs text-muted-foreground">{sale.customerName || "Guest"} · {formatReceiptDateTime(sale.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold">{formatLak(sale.totalAmount)} LAK</p>
            </div>
          </div>
        </div>
        <label className="grid gap-2 text-sm font-semibold">
          Reason
          <textarea className="field-input min-h-24 resize-y" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder={`${label} reason`}/>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Manager / Owner PIN
          <input className="field-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => onPinChange(event.target.value)} placeholder="Enter manager PIN"/>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onSubmit}>
            Approve {label}
          </button>
        </div>
      </div>
    </PosModal>);
}
function RecentSalesModal({ currentRole, customEnd, customStart, filter, onClose, onCustomEnd, onCustomStart, onDuplicate, onEditField, onExchange, onFilter, onRefund, onReprint, onSearch, onShowDeleted, onSoftDelete, onViewReceipt, onVoid, sales, search, showDeleted, }: {
    currentRole: string;
    customEnd: string;
    customStart: string;
    filter: "today" | "yesterday" | "week" | "month" | "custom";
    onClose: () => void;
    onCustomEnd: (value: string) => void;
    onCustomStart: (value: string) => void;
    onDuplicate: (sale: DemoSaleRecord) => void;
    onEditField: (sale: DemoSaleRecord, field: "note" | "customerName" | "paymentMode") => void;
    onExchange: (sale: DemoSaleRecord) => void;
    onFilter: (filter: "today" | "yesterday" | "week" | "month" | "custom") => void;
    onRefund: (sale: DemoSaleRecord) => void;
    onReprint: (sale: DemoSaleRecord) => void;
    onSearch: (value: string) => void;
    onShowDeleted: (value: boolean) => void;
    onSoftDelete: (sale: DemoSaleRecord) => void;
    onViewReceipt: (sale: DemoSaleRecord) => void;
    onVoid: (sale: DemoSaleRecord) => void;
    sales: DemoSaleRecord[];
    search: string;
    showDeleted: boolean;
}) {
    const canRefundSale = canUseStoreAction(currentRole, STORE_ACTIONS.SALE_REFUND)
      && canUseStoreAction(currentRole, STORE_ACTIONS.PAYMENT_REFUND);
    const canVoidSale = canUseStoreAction(currentRole, STORE_ACTIONS.SALE_VOID);
    const canRequestManagerApproval = resolveStoreUiRole(currentRole) === STORE_ROLES.CASHIER;
    const canDeleteSale = canVoidSale;
    const filterOptions: Array<{ label: string; value: "today" | "yesterday" | "week" | "month" | "custom" }> = [
        { label: "Today", value: "today" },
        { label: "Yesterday", value: "yesterday" },
        { label: "This Week", value: "week" },
        { label: "This Month", value: "month" },
        { label: "Custom", value: "custom" },
    ];
    return (<PosWorkspaceModal onClose={onClose} title="Recent Sales">
        <p className="text-sm text-muted-foreground">Search, view receipts, reprint, return, exchange, or void bills.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
            <input className="field-input pl-10" placeholder="Search bill, customer, cashier, phone, product..." value={search} onChange={(event) => onSearch(event.target.value)}/>
          </label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (<button className={cn("h-10 rounded-md border px-3 text-xs font-semibold", filter === option.value ? "border-primary bg-primary/10 text-primary" : "border-border")} key={option.value} type="button" onClick={() => onFilter(option.value)}>
                {option.label}
              </button>))}
          </div>
        </div>
        {filter === "custom" ? (<div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className="field-input" type="date" value={customStart} onChange={(event) => onCustomStart(event.target.value)}/>
            <input className="field-input" type="date" value={customEnd} onChange={(event) => onCustomEnd(event.target.value)}/>
          </div>) : null}
        {currentRole === "Owner" ? (<label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDeleted} onChange={(event) => onShowDeleted(event.target.checked)}/>
            Show deleted bills
          </label>) : null}
        <div className="mt-4 grid gap-3">
          {sales.length === 0 ? (<div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No recent sales found.</div>) : sales.map((sale) => {
            const statusVisual = resolveSaleStatusVisual(sale.status);
            return (
            <div className="overflow-hidden rounded-lg border border-border bg-background" key={sale.saleNo}>
              <div className="flex min-w-0">
                <SaleStatusIndicator status={sale.status} />
                <div className="grid min-w-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{t("ui.receipt.number")} {sale.receiptNo || sale.saleNo}</span>
                    <SaleStatusBadge status={sale.status} />
                    <span className="text-xs text-muted-foreground">{formatReceiptDateTime(sale.createdAt)}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <InfoLine label={t("ui.customer")} value={sale.customerName || "Guest"}/>
                    <InfoLine label={t("ui.cashier")} value={sale.cashierName}/>
                    <InfoLine label={t("ui.sale.items")} value={String((sale.items ?? []).length)}/>
                    <InfoLine label={t("ui.total")} value={`${formatLak(sale.totalAmount)} LAK`} muted={statusVisual.isVoided} strike={statusVisual.isVoided}/>
                    <InfoLine label={t("ui.payment")} value={sale.paymentMode.toUpperCase()} muted={statusVisual.isVoided}/>
                  </div>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-semibold text-foreground">Sale Timeline</summary>
                    <div className="mt-2 grid gap-1">
                      {(sale.timeline ?? []).map((event, index) => (<div className="flex justify-between gap-3" key={`${sale.saleNo}-timeline-${index}`}>
                          <span>{event.label} by {event.user}</span>
                          <span>{formatReceiptDateTime(event.at)}</span>
                        </div>))}
                    </div>
                  </details>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:max-w-[360px]">
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onViewReceipt(sale)}>View Receipt</button>
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onReprint(sale)}>Reprint Receipt</button>
                  {canRefundSale || canRequestManagerApproval ? (
                    <button className="h-9 rounded-md border border-warning/50 px-2 font-semibold text-warning" type="button" onClick={() => onRefund(sale)}>Return / Refund</button>
                  ) : null}
                  {canRefundSale || canRequestManagerApproval ? (
                    <button className="h-9 rounded-md border border-warning/50 px-2 font-semibold text-warning" type="button" onClick={() => onExchange(sale)}>Exchange</button>
                  ) : null}
                  {canVoidSale || canRequestManagerApproval ? (
                    <button className="h-9 rounded-md border border-danger/50 px-2 font-semibold text-danger" type="button" onClick={() => onVoid(sale)}>Void Sale</button>
                  ) : null}
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onDuplicate(sale)}>Duplicate</button>
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onEditField(sale, "note")}>Edit Note</button>
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onEditField(sale, "customerName")}>Edit Customer</button>
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onEditField(sale, "paymentMode")}>Edit Payment</button>
                  {canDeleteSale ? (
                    <button className="h-9 rounded-md border border-danger/50 px-2 font-semibold text-danger" type="button" onClick={() => onSoftDelete(sale)}>Delete</button>
                  ) : null}
                </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
    </PosWorkspaceModal>);
}
function ReceiptPreview({ autoPrint = false, branchName, cashierName, cartItems, changeAmount, createdAt, customerName, discountTotal, onClose, onReprint, paidAmount, paymentMode, receiptNo, receiptSettings, saleNo, showTaxOnReceipt, subtotal, taxAmount, totalAmount, }: {
    autoPrint?: boolean;
    branchName: string;
    cashierName: string;
    cartItems: PosCartItem[];
    changeAmount: number;
    createdAt: string;
    customerName: string;
    discountTotal: number;
    onClose: () => void;
    onReprint: () => boolean;
    paidAmount: number;
    paymentMode: PaymentMode;
    receiptNo: string;
    receiptSettings: PosReceiptSettings;
    saleNo: string;
    showTaxOnReceipt: boolean;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
}) {
    const [autoPrintStarted, setAutoPrintStarted] = useState(false);
    useEffect(() => {
        if (!autoPrint || autoPrintStarted)
            return;
        setAutoPrintStarted(true);
        const timeout = window.setTimeout(() => {
            if (onReprint()) {
                window.print();
            }
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [autoPrint, autoPrintStarted, onReprint]);
    const receiptTitle = receiptSettings.receiptHeader || receiptSettings.companyName;
    const receiptFooter = receiptSettings.receiptFooter || "Thank you";
    return (<PosWorkspaceModal headerClassName="print:hidden" onClose={onClose} title="Receipt preview">
        <div className="rounded-md border border-border bg-background p-5 font-mono text-sm">
          <div className="text-center">
            <div className="text-lg font-bold">{receiptTitle}</div>
            {receiptSettings.profileAddress ? <div>{receiptSettings.profileAddress}</div> : null}
            {receiptSettings.profilePhone ? <div>{receiptSettings.profilePhone}</div> : null}
            {receiptSettings.profileEmail ? <div>{receiptSettings.profileEmail}</div> : null}
            {receiptSettings.taxNumber ? <div>Tax: {receiptSettings.taxNumber}</div> : null}
            <div>{branchName}</div>
            <div>Bill: {saleNo}</div>
            <div>Receipt: {receiptNo}</div>
            <div>Customer: {customerName}</div>
            <div>{t("ui.cashier")}{cashierName}</div>
            <div>{formatReceiptDateTime(createdAt)}</div>
          </div>
          <div className="my-4 border-t border-dashed border-border"/>
          <div className="flex flex-col gap-3">
            {cartItems.length === 0 ? (<div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">No receipt items.</div>) : cartItems.map((item, index) => (<div key={cartLineKey(item, index)}>
                <div className="flex justify-between gap-3">
                  <span>{item.nameEn}</span>
                  <span>{formatLak(item.priceLak * item.quantity)}</span>
                </div>
                <div className="text-muted-foreground">{item.quantity} x {formatLak(item.priceLak)} LAK</div>
              </div>))}
          </div>
          <div className="my-4 border-t border-dashed border-border"/>
          <ReceiptRow label="Subtotal" value={subtotal}/>
          <ReceiptRow label="Discount" value={-discountTotal}/>
          {showTaxOnReceipt ? <ReceiptRow label="Tax" value={taxAmount}/> : null}
          <ReceiptRow label="Total" value={totalAmount} strong/>
          <ReceiptRow label={`Paid ${paymentMode.toUpperCase()}`} value={paidAmount}/>
          <ReceiptRow label="Change" value={changeAmount}/>
          <div className="my-4 border-t border-dashed border-border"/>
          <div className="text-center">{receiptFooter}</div>
        </div>
        <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground print:hidden" type="button" onClick={() => {
            if (onReprint()) {
                window.print();
            }
        }}>
          <Printer aria-hidden="true"/>
          Print receipt
        </button>
    </PosWorkspaceModal>);
}
function ReceiptRow({ label, strong = false, value }: {
    label: string;
    strong?: boolean;
    value: number;
}) {
    return (<div className={cn("flex justify-between gap-3", strong && "font-bold")}>
      <span>{label}</span>
      <span>{formatLak(value)} LAK</span>
    </div>);
}
function productKey(product: Pick<PosProduct, "id" | "sku" | "unitId">, index: number) {
    return `${product.id || product.sku || "product"}:${product.unitId ?? "default"}:${index}`;
}
function cartLineKey(item: Pick<PosCartItem, "cartLineId" | "id" | "sku" | "unitId">, index: number) {
    return item.cartLineId ?? `${item.id || item.sku || "cart"}:${item.unitId ?? "default"}:${index}`;
}
function isPaymentMode(value: string): value is PaymentMode {
    return ["cash", "qr", "transfer", "card", "mixed"].includes(value);
}
function formatReceiptDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value || "--";
    }
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        year: "numeric",
    });
}
function isSaleInDateFilter(createdAt: string, filter: "today" | "yesterday" | "week" | "month" | "custom", customStart: string, customEnd: string) {
    const saleDate = new Date(createdAt);
    if (Number.isNaN(saleDate.getTime())) {
        return false;
    }
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfSaleDay = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
    if (filter === "today") {
        return startOfSaleDay.getTime() === startOfToday.getTime();
    }
    if (filter === "yesterday") {
        const yesterday = new Date(startOfToday);
        yesterday.setDate(yesterday.getDate() - 1);
        return startOfSaleDay.getTime() === yesterday.getTime();
    }
    if (filter === "week") {
        const weekStart = new Date(startOfToday);
        weekStart.setDate(weekStart.getDate() - 6);
        return saleDate >= weekStart && saleDate <= now;
    }
    if (filter === "month") {
        return saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth();
    }
    const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
    if (start && saleDate < start)
        return false;
    if (end && saleDate > end)
        return false;
    return true;
}
function mapStoredProductToPosProduct(product: Record<string, any>): PosProduct {
    const activeUnits = Array.isArray(product.units) ? product.units.filter((unit: Record<string, any>) => unit.status !== "inactive") : [];
    const defaultUnit = activeUnits.find((unit: Record<string, any>) => unit.isDefaultSaleUnit) ?? activeUnits.find((unit: Record<string, any>) => unit.isBaseUnit) ?? activeUnits[0];
    return {
        barcode: String(product.barcode ?? ""),
        categoryName: String(product.categoryName ?? ""),
        conversionQty: Number(defaultUnit?.conversionQty ?? product.conversionQty ?? 1),
        costPriceLak: Number(defaultUnit?.costPriceLak ?? product.costPriceLak ?? 0),
        expiryDate: product.expiryDate ?? null,
        id: String(product.id),
        imageKey: String(product.imageUrl ?? product.imageKey ?? "generic"),
        isFavorite: Boolean(product.isFavorite),
        lowStockThreshold: Number(product.minStock ?? product.lowStockThreshold ?? 0),
        nameEn: String(product.nameEn ?? product.nameLo ?? "Product"),
        nameLo: String(product.nameLo ?? product.nameEn ?? "Product"),
        priceLak: Number(defaultUnit?.sellingPriceLak ?? product.sellingPriceLak ?? product.priceLak ?? 0),
        productCode: String(product.productCode ?? ""),
        sku: String(product.sku ?? ""),
        stockQty: Number(product.stockQty ?? product.currentStock ?? 0),
        unitId: defaultUnit?.id,
        unitImageUrl: defaultUnit?.imageUrl ?? product.unitImageUrl ?? product.imageUrl,
        unitName: String(defaultUnit?.unitName ?? product.unitName ?? "Piece"),
        units: activeUnits.map((unit: Record<string, any>, index: number) => ({
            allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
            barcode: String(unit.barcode ?? ""),
            conversionQty: Number(unit.conversionQty ?? 1),
            costPriceLak: Number(unit.costPriceLak ?? product.costPriceLak ?? 0),
            id: String(unit.id ?? `${product.id}-unit-${index}`),
            imageUrl: unit.imageUrl,
            isBaseUnit: Boolean(unit.isBaseUnit),
            isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
            isPurchaseUnit: Boolean(unit.isPurchaseUnit),
            sellingPriceLak: Number(unit.sellingPriceLak ?? product.sellingPriceLak ?? product.priceLak ?? 0),
            sortOrder: Number(unit.sortOrder ?? index),
            status: unit.status === "inactive" ? "inactive" : "active",
            unitName: String(unit.unitName ?? product.unitName ?? "Piece"),
        })),
    };
}
function isMembershipActive(customer: PosCustomer | null | undefined) {
    if (!customer || customer.membershipStatus !== "Active")
        return false;
    if (!customer.membershipExpiry)
        return true;
    const expiry = new Date(`${customer.membershipExpiry}T23:59:59`);
    return expiry.getTime() >= Date.now();
}
function getSaleUnits(product: PosProduct) {
    const units = (product.units ?? []).filter((unit) => unit.status !== "inactive" && unit.allowManualUnitSelect !== false);
    if (units.length === 0) {
        return [{
                allowManualUnitSelect: true,
                barcode: product.barcode,
                conversionQty: 1,
                costPriceLak: product.costPriceLak ?? 0,
                id: `${product.id}-default-unit`,
                isBaseUnit: true,
                isDefaultSaleUnit: true,
                isPurchaseUnit: true,
                sellingPriceLak: product.priceLak,
                sortOrder: 0,
                status: "active" as const,
                unitName: product.unitName,
            }];
    }
    return units;
}
function applyCustomerPricing(product: PosProduct, customer: PosCustomer | null): PosCartItem {
    const retailPriceLak = product.priceLak;
    if (!customer) {
        return { ...product, priceLak: retailPriceLak, quantity: 1, retailPriceLak };
    }
    if (customer.membershipType === "Student" && product.specialStudentPriceLak) {
        return {
            ...product,
            priceLak: product.specialStudentPriceLak,
            quantity: 1,
            retailPriceLak,
            pricingNote: "Student special price",
        };
    }
    if (customer.discountPercent && customer.discountPercent > 0) {
        return {
            ...product,
            priceLak: Math.round(retailPriceLak * (1 - customer.discountPercent / 100)),
            quantity: 1,
            retailPriceLak,
            pricingNote: `${customer.discountPercent}% member discount`,
        };
    }
    return { ...product, priceLak: retailPriceLak, quantity: 1, retailPriceLak };
}
function getStockWarning(product: PosProduct, referenceDate: Date): PosCartItem["stockWarning"] {
    if (product.expiryDate) {
        const expiry = new Date(`${product.expiryDate}T00:00:00`);
        const days = Math.ceil((expiry.getTime() - referenceDate.getTime()) / 86400000);
        if (days < 0)
            return { label: "Expired", tone: "red" };
        if (days <= 7)
            return { label: "Near Expiry", tone: "yellow" };
    }
    if (product.stockQty <= (product.lowStockThreshold ?? 5)) {
        return { label: "Low Stock", tone: "orange" };
    }
    return undefined;
}
function warningBadgeClass(tone: "orange" | "yellow" | "red") {
    if (tone === "red")
        return "bg-danger/10 text-danger";
    if (tone === "yellow")
        return "bg-warning/10 text-warning";
    return "bg-orange-500/10 text-orange-500";
}
function warningTextClass(tone: "orange" | "yellow" | "red") {
    if (tone === "red")
        return "text-danger";
    if (tone === "yellow")
        return "text-warning";
    return "text-orange-500";
}
function nextHoldName(index: number) {
    let value = index;
    let name = "";
    do {
        name = String.fromCharCode(65 + (value % 26)) + name;
        value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return name;
}
function formatPosTime(date: Date) {
    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}
function formatBusinessDate(date: Date) {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
}
function formatStaffTime(date: Date | null) {
    return date ? formatPosTime(date) : "-";
}
function calculateHours(start: Date | null, end: Date | null) {
    if (!start || !end)
        return 0;
    return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}
