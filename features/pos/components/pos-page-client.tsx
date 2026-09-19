"use client";

import {
    applyExactPaymentToMethod,
    type ExactPaymentMethod,
} from "@/features/pos/exact-payment";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillPosCopy, tPos as t } from "@/lib/i18n/pos-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Banknote, Barcode, CalendarDays, ChevronDown, ChevronUp, CreditCard, Minus, Plus, Printer, QrCode, ReceiptText, RotateCcw, Search, ShoppingCart, Star, Trash2, UserRoundSearch, WalletCards, X, } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HeldBillCartSnapshot, HeldSale, PaymentMode, PosCartItem, PosCashSessionContext, PosCustomer, PosDisplayState, PosLoyaltySettings, PosProduct, PosProductUnit, PosPromotion, PosReceiptSettings, QrBank, } from "@/features/pos/types";
import { PosProductImage } from "@/features/pos/components/pos-product-image";
import { OwnShiftReportModal } from "@/features/pos/components/own-shift-report-drawer";
import { PosSmallModal } from "@/features/pos/components/pos-small-modal";
import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import {
  EMPTY_SALE_OPTIONS,
  SaleOptionsDrawer,
  SaleOptionsSummaryChip,
  type SaleOptionsDraft,
} from "@/features/pos/components/sale-options-drawer";
import { ReturnExchangeVoidModal, type ReturnExchangeTab } from "@/features/pos/components/return-exchange-void-modal";
import { SaleStatusBadge, SaleStatusIndicator } from "@/features/pos/components/sale-status-badge";
import { resolveSaleStatusVisual } from "@/features/pos/sale-status-presentation";
import { formatLak } from "@/features/pos/format";
import { hasRestorableHeldCart, pickRestorableHeldSale, restoreCartFromHeldSale, slimHeldSnapshot } from "@/features/pos/held-cart";
import {
    cartExceedsStock,
    cartSubtotal,
    filterPosCatalogue,
    findPosScanMatch,
    maxSellQty,
    planPosCartAdd,
    productWithSaleUnit,
    projectPosCatalogueCards,
    removePosCartLine,
    resolvePosSaleUnits,
    updatePosCartQuantity,
} from "@/features/pos/pos-cart";
import {
  DEFAULT_POS_UNIT_DISPLAY_MODE,
  readPosUnitDisplayMode,
  writePosUnitDisplayMode,
  type PosUnitDisplayMode,
} from "@/features/pos/pos-unit-display-settings";
import { applyLoadedPromotions } from "@/features/promotions/promotion-checkout";
import { cn } from "@/lib/utils";
import {
  setPosFavorite,
  selectFavoriteCatalogueProducts,
  resolveFavoriteQtyAdjustTarget,
} from "@/features/pos/favorites-client";
import { completeSaleAction, loadPosCatalogueAction } from "@/features/pos/actions";
import {
  applyPosCatalogueRefresh,
  isPosCatalogueStorageEvent,
  POS_CATALOGUE_CHANNEL,
  shouldSkipPosCatalogueRefresh,
} from "@/features/pos/pos-catalogue-refresh";
import { receiptSnapshotFromPersistedSale } from "@/features/pos/checkout-receipt";
import {
  cashInRequest,
  cashOutRequest,
  closeCashSessionRequest,
  fetchCurrentCashSession,
  openCashSessionRequest,
} from "@/features/pos/cash-session-client";
import { CashInOutModal } from "@/features/pos/components/cash-in-out-modal";
import { MemberSearchPanel } from "@/features/pos/components/member-search-panel";
import { claimCashMovementSubmit, type CashMovementType } from "@/features/pos/cash-movement";
import {
  CASH_DENOMINATIONS_LAK,
  denominationLineSubtotal,
  emptyDenominationCounts,
  sumDenominationCounts,
  toDenominationCountMap,
  varianceKind,
} from "@/features/cash-sessions/denominations";
import { calculateVariance } from "@/features/cash-sessions/cash-session-calculator";
import {
  fetchRecentSales,
  fetchSaleReceipt,
  type PostSaleManagerApprovalPayload,
  refundSaleRequest,
  reprintSaleReceipt,
  voidSaleRequest,
} from "@/features/pos/post-sale-client";
import { RECENT_SALES_DEFAULT_LIMIT } from "@/features/pos/recent-sales-query";
import { cancelHeldBill, createHeldBill, fetchHeldBills, resumeHeldBill } from "@/features/pos/held-bills-client";
import { getFollowingPosSaleNo } from "@/features/pos/sale-no";
import { readCustomerDisplaySettingsFromStorage } from "@/features/pos/customer-display-settings";
import { readCompanyLogoUrl } from "@/features/brand/company-logo";
import {
    CUSTOMER_DISPLAY_QR_EVENT,
    hideCustomerDisplayQr,
    readCustomerDisplayQrIntent,
    writeCustomerDisplayQrCatalog,
} from "@/features/pos/customer-display-qr";
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
    paymentBreakdown?: Array<{ amountLak: number; method: string }>;
    paymentMode: PaymentMode;
    receiptNo: string;
    /** STEP 8: persisted DB sale id for canonical audited reprint. Absent in demo mode. */
    saleId?: string;
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
    itemCount?: number;
    items: PosCartItem[];
    note?: string;
    paidAmount: number;
    paymentBreakdown?: Array<{ amountLak: number; method: string }>;
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

export function PosPageClient({ branchName, branchId, cashierName, cashSession, customers: _bootCustomers, demoMode, devDebug, loyaltySettings, nextSaleNo, posPermissionPolicy, products, promotionBanners, promotions = [], qrBanks, receiptSettings, taxInclusive, taxRatePercent, warehouseId, }: {
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
    useAppLocale();
    const [isPending, startTransition] = useTransition();
    const checkoutInFlightRef = useRef(false);
    const postSaleInFlightRef = useRef(false);
    const [productQuery, setProductQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [productGridVisible, setProductGridVisible] = useState(true);
    const [unitDisplayMode, setUnitDisplayMode] = useState<PosUnitDisplayMode>(DEFAULT_POS_UNIT_DISPLAY_MODE);
    const [favoritesOpen, setFavoritesOpen] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [unitDisplayOpen, setUnitDisplayOpen] = useState(false);
    const [cashShiftCountOpen, setCashShiftCountOpen] = useState(false);
    const [cashInOutOpen, setCashInOutOpen] = useState(false);
    const [cashInOutBusy, setCashInOutBusy] = useState(false);
    const cashInOutInFlightRef = useRef(false);
    const cashCloseInFlightRef = useRef(false);
    const [ownShiftReportEpoch, setOwnShiftReportEpoch] = useState(0);
    const [heldBillsOpen, setHeldBillsOpen] = useState(false);
    const [memberSearchOpen, setMemberSearchOpen] = useState(false);
    const [cartCollapsed, setCartCollapsed] = useState(false);
    const cartPanelRef = useRef<HTMLElement>(null);
    const [cartOverlayMaxHeightPx, setCartOverlayMaxHeightPx] = useState<number | null>(null);
    const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
    const cartItemsRef = useRef<PosCartItem[]>([]);
    cartItemsRef.current = cartItems;
    const [unitSelectionProduct, setUnitSelectionProduct] = useState<PosProduct | null>(null);
    const [unitSelectionIntent, setUnitSelectionIntent] = useState<"add" | "decrement">("add");
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
    const [activeHeldBillId, setActiveHeldBillId] = useState<string | null>(null);
    const [heldBillsBusy, setHeldBillsBusy] = useState(false);
    const [heldBillConflict, setHeldBillConflict] = useState<HeldSale | null>(null);
    const [activeCashSession, setActiveCashSession] = useState<PosCashSessionContext>(cashSession);
    const [staffControlExpanded, setStaffControlExpanded] = useState(true);
    const [cashCloseBusy, setCashCloseBusy] = useState(false);
    const [closingSummaryVisible, setClosingSummaryVisible] = useState(false);
    const [lastCloseSummary, setLastCloseSummary] = useState<{
        countedCashLak: number;
        expectedCashLak: number;
        varianceLak: number;
    } | null>(null);
    const [openingCashCounts, setOpeningCashCounts] = useState<Record<number, number>>(emptyDenominationCounts);
    const [closingCashCounts, setClosingCashCounts] = useState<Record<number, number>>(emptyDenominationCounts);
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [lastReceipt, setLastReceipt] = useState<ReceiptSnapshot | null>(null);
    const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);
    /**
     * STEP 8: true when ReceiptPreview shows the initial print after checkout.
     * The sale-creation transaction itself is audited, so first-print skips the
     * reprint audit log to avoid duplicating the audit trail.
     */
    const [receiptIsFirstPrint, setReceiptIsFirstPrint] = useState(false);
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
    const [recentSalesCustomStart, setRecentSalesCustomStart] = useState("");
    const [recentSalesCustomEnd, setRecentSalesCustomEnd] = useState("");
    const [recentSalesCursor, setRecentSalesCursor] = useState<string | null>(null);
    const [recentSalesHasMore, setRecentSalesHasMore] = useState(false);
    const [recentSalesLoading, setRecentSalesLoading] = useState(false);
    const [recentSalesError, setRecentSalesError] = useState<string | null>(null);
    const recentSalesRequestId = useRef(0);
    const [ownShiftReportOpen, setOwnShiftReportOpen] = useState(false);
    const [managerApprovalRequest, setManagerApprovalRequest] = useState<ManagerApprovalRequest | null>(null);
    const [managerApprovalPin, setManagerApprovalPin] = useState("");
    const [managerApprovalReason, setManagerApprovalReason] = useState("");
    const [mixedPaymentOpen, setMixedPaymentOpen] = useState(false);
    const [saleOptionsOpen, setSaleOptionsOpen] = useState(false);
    const [saleOptionsCommitted, setSaleOptionsCommitted] = useState<SaleOptionsDraft>(EMPTY_SALE_OPTIONS);
    const [saleOptionsDraft, setSaleOptionsDraft] = useState<SaleOptionsDraft>(EMPTY_SALE_OPTIONS);
    const [message, setMessage] = useState<string | null>(null);
    const [pendingApprovals, setPendingApprovals] = useState<PosPendingApprovalRequest[]>([]);
    const [auditEntries, setAuditEntries] = useState<PosAuditEntry[]>([]);
    const [customerDisplayMode, setCustomerDisplayMode] = useState<PosDisplayState["displayMode"]>("advertising");
    const [customerQrVisible, setCustomerQrVisible] = useState(false);
    const [thankYouSnapshot, setThankYouSnapshot] = useState<PosDisplayState | null>(null);
    const [availableQrBanks, setAvailableQrBanks] = useState(qrBanks);
    const [selectedQrBankId, setSelectedQrBankId] = useState(qrBanks[0]?.id ?? "");
    const [visibleProducts, setVisibleProducts] = useState<PosProduct[]>(products);
    const [currentTime, setCurrentTime] = useState(HYDRATION_SAFE_TIME);
    const [businessDate, setBusinessDate] = useState(HYDRATION_SAFE_BUSINESS_DATE);
    const [stockReferenceDate, setStockReferenceDate] = useState(HYDRATION_SAFE_REFERENCE_DATE);
    const [billNo, setBillNo] = useState(nextSaleNo);
    useEffect(() => {
        setBillNo(nextSaleNo);
    }, [nextSaleNo]);
    useLayoutEffect(() => {
        if (cartCollapsed || !productGridVisible) {
            setCartOverlayMaxHeightPx(null);
            return;
        }
        const updateOverlayMaxHeight = () => {
            if (typeof window === "undefined" || window.innerWidth < 1280) {
                setCartOverlayMaxHeightPx(null);
                return;
            }
            const panel = cartPanelRef.current;
            if (!panel) return;
            const overlayTop = panel.getBoundingClientRect().bottom;
            const available = Math.floor(window.innerHeight - overlayTop - 16);
            setCartOverlayMaxHeightPx(Math.max(280, available));
        };
        updateOverlayMaxHeight();
        window.addEventListener("resize", updateOverlayMaxHeight);
        return () => window.removeEventListener("resize", updateOverlayMaxHeight);
    }, [cartCollapsed, productGridVisible, cartItems.length]);
    useEffect(() => {
        setActiveCashSession(cashSession);
        if (cashSession.status === "open") {
            setClosingSummaryVisible(false);
            setLastCloseSummary(null);
        }
    }, [cashSession]);
    useEffect(() => {
        setVisibleProducts(products);
    }, [products]);
    useEffect(() => {
        setAvailableQrBanks(qrBanks);
        setSelectedQrBankId((current) => current || qrBanks[0]?.id || "");
        writeCustomerDisplayQrCatalog(qrBanks);
    }, [qrBanks]);
    useEffect(() => {
        function syncQrIntent() {
            const intent = readCustomerDisplayQrIntent();
            setCustomerQrVisible(intent.visible);
            if (intent.bankId) {
                setSelectedQrBankId(intent.bankId);
            }
        }
        syncQrIntent();
        window.addEventListener("storage", syncQrIntent);
        window.addEventListener(CUSTOMER_DISPLAY_QR_EVENT, syncQrIntent);
        return () => {
            window.removeEventListener("storage", syncQrIntent);
            window.removeEventListener(CUSTOMER_DISPLAY_QR_EVENT, syncQrIntent);
        };
    }, []);
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
        if (demoMode) return;
        let cancelled = false;
        let lastRequestedAt = 0;
        async function refreshCatalogue() {
            if (shouldSkipPosCatalogueRefresh({
                checkoutInFlight: checkoutInFlightRef.current,
                demoMode,
                online: typeof navigator === "undefined" || navigator.onLine !== false,
            })) {
                return;
            }
            const now = Date.now();
            if (now - lastRequestedAt < 750) return;
            lastRequestedAt = now;
            const result = await loadPosCatalogueAction();
            if (cancelled || !result.ok || !Array.isArray(result.data)) return;
            if (checkoutInFlightRef.current) return;
            const next = applyPosCatalogueRefresh({
                cart: null,
                nextProducts: result.data as PosProduct[],
            });
            setVisibleProducts(next.products);
        }
        function onFocus() {
            void refreshCatalogue();
        }
        function onVisibility() {
            if (document.visibilityState === "visible") {
                void refreshCatalogue();
            }
        }
        function onStorage(event: StorageEvent) {
            if (isPosCatalogueStorageEvent(event)) {
                void refreshCatalogue();
            }
        }
        function onChannel(event: MessageEvent) {
            if (event.data?.type === "invalidate") {
                void refreshCatalogue();
            }
        }
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("storage", onStorage);
        let channel: BroadcastChannel | null = null;
        try {
            channel = new BroadcastChannel(POS_CATALOGUE_CHANNEL);
            channel.addEventListener("message", onChannel);
        } catch {
            channel = null;
        }
        return () => {
            cancelled = true;
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("storage", onStorage);
            channel?.removeEventListener("message", onChannel);
            channel?.close();
        };
    }, [demoMode]);
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
        if (!cashShiftCountOpen || demoMode) {
            return;
        }
        let cancelled = false;
        fetchCurrentCashSession()
            .then((session) => {
                if (!cancelled) {
                    setActiveCashSession(session);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [cashShiftCountOpen, demoMode]);
    useEffect(() => {
        const stored = window.localStorage.getItem(POS_PRODUCT_GRID_VISIBILITY_KEY);
        if (stored === "hidden") {
            setProductGridVisible(false);
        }
        if (stored === "visible") {
            setProductGridVisible(true);
        }
        setUnitDisplayMode(readPosUnitDisplayMode());
    }, []);
    const categories = useMemo(() => ["All", ...Array.from(new Set(visibleProducts.map((product) => product.categoryName)))], [visibleProducts]);
    const favoriteProducts = useMemo(() => {
        // Authoritative: only products flagged from branch_favorite_products (isFavorite).
        // Never fall back to the full catalogue when favorites are sparse.
        return projectPosCatalogueCards(selectFavoriteCatalogueProducts(visibleProducts), unitDisplayMode);
    }, [unitDisplayMode, visibleProducts]);
    const favoriteCartQtyByProductId = useMemo(() => {
        const totals = new Map<string, number>();
        for (const item of cartItems) {
            totals.set(item.id, (totals.get(item.id) ?? 0) + item.quantity);
        }
        return totals;
    }, [cartItems]);
    const filteredProducts = useMemo(
        () => projectPosCatalogueCards(
            filterPosCatalogue(visibleProducts, productQuery, selectedCategory),
            unitDisplayMode,
        ),
        [productQuery, selectedCategory, unitDisplayMode, visibleProducts],
    );
    const selectedQrBank = availableQrBanks.find((bank) => bank.id === selectedQrBankId) ?? null;
    const activeCustomer = isMembershipActive(selectedCustomer) ? selectedCustomer : null;
    const openingCashTotal = sumDenominationCounts(openingCashCounts);
    const countedClosingCash = sumDenominationCounts(closingCashCounts);
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
    const cashInLak = activeCashSession.status === "open" ? activeCashSession.cashInLak : 0;
    const cashOutLak = activeCashSession.status === "open" ? activeCashSession.cashOutLak : 0;
    const qrTransferSales = activeCashSession.status === "open" ? activeCashSession.nonCashSalesLak : qrAmount + transferAmount;
    const effectiveOpeningCash = activeCashSession.status === "open" ? activeCashSession.openingCashLak : openingCashTotal;
    const expectedCash = activeCashSession.status === "open"
        ? activeCashSession.expectedCashLak
        : lastCloseSummary?.expectedCashLak ?? openingCashTotal;
    const actualClosingCash = activeCashSession.status === "open"
        ? countedClosingCash
        : lastCloseSummary?.countedCashLak ?? countedClosingCash;
    const cashDifference = activeCashSession.status === "open"
        ? calculateVariance(countedClosingCash, activeCashSession.expectedCashLak)
        : lastCloseSummary?.varianceLak ?? calculateVariance(countedClosingCash, expectedCash);
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
    const filteredRecentSales = recentSales;
    async function refreshRecentSalesFromServer(options: { append?: boolean } = {}) {
        const append = Boolean(options.append);
        if (demoMode) {
            setRecentSales(demoSalesRepository.listSales<DemoSaleRecord>());
            setRecentSalesLoaded(true);
            setRecentSalesHasMore(false);
            setRecentSalesCursor(null);
            setRecentSalesError(null);
            return;
        }
        if (append && (!recentSalesHasMore || !recentSalesCursor || recentSalesLoading)) {
            return;
        }
        const requestId = ++recentSalesRequestId.current;
        setRecentSalesLoading(true);
        if (!append) {
            setRecentSalesError(null);
        }
        try {
            const page = await fetchRecentSales({
                cursor: append ? recentSalesCursor : null,
                customEnd: recentSalesCustomEnd,
                customStart: recentSalesCustomStart,
                datePreset: recentSalesFilter,
                limit: RECENT_SALES_DEFAULT_LIMIT,
                search: recentSalesSearch,
            });
            if (requestId !== recentSalesRequestId.current) {
                return;
            }
            const mapped = page.items as DemoSaleRecord[];
            setRecentSales((current) => (append ? [...current, ...mapped] : mapped));
            setRecentSalesCursor(page.nextCursor);
            setRecentSalesHasMore(page.hasMore);
            setRecentSalesLoaded(true);
            setRecentSalesError(null);
        } catch (error) {
            if (requestId !== recentSalesRequestId.current) {
                return;
            }
            setRecentSalesError(error instanceof Error ? error.message : t("ui.recent.sales.load.failed"));
            if (!append) {
                setRecentSalesLoaded(true);
            }
        } finally {
            if (requestId === recentSalesRequestId.current) {
                setRecentSalesLoading(false);
            }
        }
    }
    function refreshRecentSales() {
        setRecentSalesCursor(null);
        setRecentSalesHasMore(false);
        void refreshRecentSalesFromServer({ append: false });
    }
    useEffect(() => {
        if (!recentSalesOpen || demoMode) {
            return;
        }
        const timer = window.setTimeout(() => {
            setRecentSalesCursor(null);
            void refreshRecentSalesFromServer({ append: false });
        }, recentSalesSearch.trim() ? 300 : 0);
        return () => window.clearTimeout(timer);
        // Reload when filters/search change while modal is open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recentSalesOpen, recentSalesSearch, recentSalesFilter, recentSalesCustomStart, recentSalesCustomEnd, demoMode]);
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
        setMessage(t("ui.permission.denied"));
        return false;
    }
    function resolvePendingApproval(requestId: string, status: "approved" | "rejected") {
        if (posPermissionPolicy.role !== "Owner") {
            setMessage(t("ui.permission.denied"));
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
        if (customerDisplayMode === "thank_you" && thankYouSnapshot) {
            writeJsonToStorage(DemoStorageKeys.customerDisplayState, { ...thankYouSnapshot, showQr: false, selectedQrBank: null });
            return;
        }
        const state: PosDisplayState = {
            appliedPromotions,
            customer: selectedCustomer,
            displayMode: cartItems.length > 0 ? "checkout" : "advertising",
            items: cartItems,
            membershipDiscountLak: membershipSavings,
            membershipPoints: selectedCustomer?.pointsBalance ?? 0,
            membershipStatus: selectedCustomer
                ? `${selectedCustomer.membershipType} ${isMembershipActive(selectedCustomer) ? "Active" : "Expired"}`
                : t("ui.guest"),
            pointsEarned,
            promotionDiscountLak: promotionDiscountTotal,
            selectedQrBank: customerQrVisible ? selectedQrBank : null,
            showQr: customerQrVisible && Boolean(selectedQrBank),
            storeLogoUrl: readCompanyLogoUrl() || "",
            storeName: receiptSettings.companyName,
            subtotalLak: subtotal,
            totalLak: totalAmount,
        };
        writeJsonToStorage(DemoStorageKeys.customerDisplayState, state);
    }, [appliedPromotions, cartItems, customerDisplayMode, customerQrVisible, membershipSavings, pointsEarned, promotionDiscountTotal, receiptSettings.companyName, selectedCustomer, selectedQrBank, subtotal, thankYouSnapshot, totalAmount]);
    function addToCart(product: PosProduct, selectedUnit?: PosProductUnit) {
        const saleUnit = selectedUnit ?? resolvePosSaleUnits(product)[0];
        const unitProduct = saleUnit ? productWithSaleUnit(product, saleUnit) : product;
        const pricedProduct = applyCustomerPricing(unitProduct, activeCustomer);
        const stockWarning = getStockWarning(unitProduct, stockReferenceDate);
        const planned = planPosCartAdd(cartItemsRef.current, product, saleUnit, {
            ...pricedProduct,
            stockWarning,
        });
        if (!planned.result.added) {
            setMessage(fillPosCopy(t("ui.stock.insufficient"), { name: localizedProductName(product), available: product.stockQty, requested: planned.requestedBaseQty }));
            setUnitSelectionProduct(null);
            return;
        }
        cartItemsRef.current = planned.result.cart;
        setCartItems(planned.result.cart);
        setThankYouSnapshot(null);
        setCustomerDisplayMode("checkout");
        setUnitSelectionProduct(null);
        setMessage(stockWarning ? `${stockWarningLabel(stockWarning.tone)}: ${localizedProductName(product)}` : fillPosCopy(t("ui.added.to.cart"), { name: `${localizedProductName(product)} ${saleUnit?.unitName ?? ""}`.trim() }));
    }
    function selectProductForSale(product: PosProduct, matchedUnit?: PosProductUnit) {
        if (matchedUnit) {
            addToCart(product, matchedUnit);
            return;
        }
        if (unitDisplayMode === "separate" && product.unitId) {
            const cardUnit = (product.units ?? []).find((unit) => unit.id === product.unitId)
                ?? resolvePosSaleUnits(product).find((unit) => unit.id === product.unitId);
            if (cardUnit) {
                addToCart(product, cardUnit);
                return;
            }
        }
        const saleUnits = resolvePosSaleUnits(product);
        if (saleUnits.length <= 1) {
            addToCart(product, saleUnits[0]);
            return;
        }
        if (maxSellQty(product.stockQty, 1) < 1) {
            setMessage(fillPosCopy(t("ui.stock.insufficient"), { name: localizedProductName(product), available: product.stockQty, requested: 1 }));
            return;
        }
        setUnitSelectionIntent("add");
        setUnitSelectionProduct(product);
    }
    function adjustFavoriteCartQuantity(product: PosProduct, delta: -1 | 1) {
        const target = resolveFavoriteQtyAdjustTarget(cartItemsRef.current, product);
        if (delta === 1) {
            if (target.type === "line") {
                updateQuantity(target.line.id, target.line.quantity + 1, target.line.unitId);
                return;
            }
            // Multi-unit or not yet in cart: reuse unit-aware add path (may open Unit Selector).
            selectProductForSale(product);
            return;
        }
        if (target.type === "line") {
            const nextQty = target.line.quantity - 1;
            if (nextQty <= 0) {
                removeItem(target.line.id, target.line.unitId);
            }
            else {
                updateQuantity(target.line.id, nextQty, target.line.unitId);
            }
            return;
        }
        if (target.type === "multi") {
            // Do not guess Piece vs Pack vs Box — ask which unit line to decrease.
            setUnitSelectionIntent("decrement");
            setUnitSelectionProduct(product);
        }
    }
    async function toggleFavorite(product: PosProduct) {
        const nextFavorite = !Boolean(product.isFavorite);
        const previousProducts = visibleProducts;
        setVisibleProducts((current) =>
          current.map((entry) => (entry.id === product.id ? { ...entry, isFavorite: nextFavorite } : entry)),
        );
        try {
            await setPosFavorite(product.id, nextFavorite);
        } catch (error) {
            setVisibleProducts(previousProducts);
            setMessage(error instanceof Error ? error.message : t("ui.favorite.update.failed"));
        }
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
        if (match.conflict) {
            setMessage(t("ui.barcode.conflict"));
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
    function setPosUnitDisplayMode(mode: PosUnitDisplayMode) {
        setUnitDisplayMode(mode);
        writePosUnitDisplayMode(mode);
    }
    function selectMember(customer: PosCustomer) {
        // Attach canonical customer ID only — do not reprice existing cart lines.
        // New adds still use applyCustomerPricing via activeCustomer when membership is Active.
        setSelectedCustomer(customer);
        setRedeemPoints(0);
        setMessage(isMembershipActive(customer)
            ? fillPosCopy(t("ui.membership.active"), { name: customer.name })
            : fillPosCopy(t("ui.membership.expired"), { name: customer.name }));
    }
    function clearSelectedMember() {
        setSelectedCustomer(null);
        setRedeemPoints(0);
        setMessage(t("ui.member.cleared"));
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
            setMessage(error instanceof Error ? error.message : t("ui.unable.load.held"));
        }
    }
    function buildHeldBillSnapshot(): HeldBillCartSnapshot {
        return slimHeldSnapshot({
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
        })!;
    }
    function restoreHeldBill(sale: HeldSale) {
        const snapshot = sale.snapshot;
        // Prefer Hold snapshot identity (server-persisted). Boot-time customers list is no longer loaded.
        const restoredCustomer = snapshot?.customer ?? null;
        const restored = restoreCartFromHeldSale(sale);
        cartItemsRef.current = restored;
        setCartItems(restored);
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
            setActiveHeldBillId(null);
            clearSale();
            setSelectedCustomer(null);
            setMessage(fillPosCopy(t("ui.bill.held"), { saleNo: heldSale.saleNo }));
            return true;
        }
        setHeldBillsBusy(true);
        try {
            const heldSale = await createHeldBill(buildHeldBillSnapshot(), activeCashSession.sessionId);
            setHeldSales((current) => [heldSale, ...current]);
            setActiveHeldBillId(null);
            clearSale();
            setSelectedCustomer(null);
            setMessage(fillPosCopy(t("ui.bill.held"), { saleNo: heldSale.saleNo }));
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : t("ui.unable.hold.bill"));
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
            setActiveHeldBillId(heldSale.id);
            setSelectedHeldSaleId(heldSale.id);
            setMessage(fillPosCopy(t("ui.bill.resumed"), { saleNo: heldSale.saleNo }));
            return true;
        }
        setHeldBillsBusy(true);
        try {
            const result = await resumeHeldBill(heldSale.id);
            const restorable = pickRestorableHeldSale(result.sale, heldSale);
            if (!hasRestorableHeldCart(restorable)) {
                setMessage(t("ui.unable.restore.held"));
                return false;
            }
            restoreHeldBill(restorable);
            // Keep Hold discoverable + reservation ACTIVE until checkout/cancel.
            setHeldSales((current) => current.map((sale) => (sale.id === restorable.id ? { ...sale, ...restorable, reserved: true } : sale)));
            setActiveHeldBillId(restorable.id);
            setSelectedHeldSaleId(restorable.id);
            setMessage(result.availabilityWarnings.length > 0
                ? `${heldSale.saleNo} resumed with stock warnings: ${result.availabilityWarnings.join(" ")}`
                : fillPosCopy(t("ui.bill.resumed"), { saleNo: heldSale.saleNo }));
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : t("ui.unable.resume.bill"));
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
        if (!enforcePosAction("resume_bill")) {
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
            if (activeHeldBillId === sale.id) {
                setActiveHeldBillId(null);
            }
            setMessage(fillPosCopy(t("ui.bill.cancelled"), { saleNo: sale.saleNo }));
            return true;
        }
        setHeldBillsBusy(true);
        try {
            await cancelHeldBill(sale.id);
            setHeldSales((current) => current.filter((item) => item.id !== sale.id));
            setSelectedHeldSaleId("");
            if (activeHeldBillId === sale.id) {
                setActiveHeldBillId(null);
            }
            setMessage(fillPosCopy(t("ui.bill.cancelled"), { saleNo: sale.saleNo }));
            return true;
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : t("ui.unable.cancel.held"));
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
            customerName: selectedCustomer?.name ?? t("ui.guest"),
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
                heldFromId: activeHeldBillId,
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
            if (activeHeldBillId) {
                setHeldSales((current) => current.filter((sale) => sale.id !== activeHeldBillId));
                setActiveHeldBillId(null);
                setSelectedHeldSaleId("");
            }
            const assignedSaleNo = result.data?.saleNo ?? saleNo;
            const receipt = result.data
                ? receiptSnapshotFromPersistedSale(result.data, {
                    branchName,
                    cashierName,
                    customerName: selectedCustomer?.name ?? t("ui.guest"),
                })
                : buildReceiptSnapshot(payment, assignedSaleNo);
            setLastReceipt(receipt);
            setSaleCompletedReceipt(receipt);
            setMessage(fillPosCopy(t("ui.sale.completed"), { saleNo: assignedSaleNo }));
            beginThankYouDisplay();
            clearSale({ keepThankYou: true });
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
                setThankYouSnapshot(null);
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
            customerName: selectedCustomer?.name ?? t("ui.guest"),
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
            setMessage(fillPosCopy(t("ui.sale.completed"), { saleNo }));
            beginThankYouDisplay();
            clearSale({ keepThankYou: true });
            setBillNo(getFollowingPosSaleNo(saleNo, receiptSettings.receiptPrefix));
            handleReceiptPrintModeAfterSale(receipt);
            const displaySettings = readCustomerDisplaySettingsFromStorage();
            window.setTimeout(() => {
                setThankYouSnapshot(null);
                setCustomerDisplayMode("advertising");
            }, displaySettings.autoReturnSeconds * 1000);
        }
        catch {
            setMessage(t("ui.storage.save.failed"));
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
            paymentBreakdown: sale.paymentBreakdown,
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
                        saleId: sale.id,
                    };
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : t("ui.receipt.load.failed"));
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
            setReceiptIsFirstPrint(false);
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
        setReturnExchangeTab(tab);
        setReturnExchangeSaleId(sale?.id);
        setReturnExchangeOpen(true);
    }
    function backFromMoreChild(closeChild: () => void) {
        closeChild();
        setMoreMenuOpen(true);
    }
    function closeMoreChild(closeChild: () => void) {
        closeChild();
        setMoreMenuOpen(false);
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
                    setMessage(fillPosCopy(t("ui.sale.voided.stock"), { saleNo: sale.saleNo }));
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : t("ui.void.failed"));
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
        setMessage(fillPosCopy(t("ui.sale.voided.stock"), { saleNo: sale.saleNo }));
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
            setMessage(t("ui.manager.pin.reason.required"));
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
            setMessage(error instanceof Error ? error.message : t("ui.manager.approval.failed"));
        }
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
    function hideCustomerQrOverlay() {
        setCustomerQrVisible(false);
        hideCustomerDisplayQr(selectedQrBankId);
    }
    function beginThankYouDisplay() {
        hideCustomerQrOverlay();
        setThankYouSnapshot({
            appliedPromotions,
            customer: selectedCustomer,
            displayMode: "thank_you",
            items: cartItems,
            membershipDiscountLak: membershipSavings,
            membershipPoints: selectedCustomer?.pointsBalance ?? 0,
            membershipStatus: selectedCustomer
                ? `${selectedCustomer.membershipType} ${isMembershipActive(selectedCustomer) ? "Active" : "Expired"}`
                : t("ui.guest"),
            pointsEarned,
            promotionDiscountLak: promotionDiscountTotal,
            selectedQrBank: null,
            showQr: false,
            storeLogoUrl: readCompanyLogoUrl() || "",
            storeName: receiptSettings.companyName,
            subtotalLak: subtotal,
            totalLak: totalAmount,
        });
        setCustomerDisplayMode("thank_you");
    }
    function clearSale(options?: { keepThankYou?: boolean }) {
        setCartItems([]);
        setDiscountAmount(0);
        setDiscountPercent(0);
        setRedeemPoints(0);
        setCashAmount(0);
        setQrAmount(0);
        setTransferAmount(0);
        setCardAmount(0);
        setPaymentMode("cash");
        hideCustomerQrOverlay();
        if (!options?.keepThankYou) {
            setThankYouSnapshot(null);
            setCustomerDisplayMode("advertising");
        }
    }
    function updateOpeningCashCount(denomination: number, quantity: number) {
        setOpeningCashCounts((current) => ({ ...current, [denomination]: Math.max(0, Math.floor(quantity)) }));
    }
    function updateClosingCashCount(denomination: number, quantity: number) {
        setClosingCashCounts((current) => ({ ...current, [denomination]: Math.max(0, Math.floor(quantity)) }));
    }
    function openCashShiftSession() {
        if (!enforcePosAction("cash_in", { amountLak: openingCashTotal, newValue: `${formatLak(openingCashTotal)} LAK` })) {
            return;
        }
        if (demoMode) {
            setClosingSummaryVisible(false);
            setLastCloseSummary(null);
            setActiveCashSession({
                cashInLak: 0,
                cashOutLak: 0,
                cashSalesLak: 0,
                expectedCashLak: openingCashTotal,
                nonCashSalesLak: 0,
                openedAt: new Date().toISOString(),
                openingCashLak: openingCashTotal,
                sessionId: "demo-cash-session",
                status: "open",
            });
            setMessage(t("ui.cash.session.opened"));
            return;
        }
        startTransition(async () => {
            try {
                const session = await openCashSessionRequest(openingCashTotal, {
                    countBreakdown: { opening: toDenominationCountMap(openingCashCounts) },
                });
                setActiveCashSession(session);
                setClosingSummaryVisible(false);
                setLastCloseSummary(null);
                setClosingCashCounts(emptyDenominationCounts());
                setMessage(t("ui.cash.session.opened"));
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : t("ui.cash.session.open.failed"));
            }
        });
    }
    async function confirmClosingSummary() {
        if (!claimCashMovementSubmit(cashCloseInFlightRef)) {
            return;
        }
        setCashCloseBusy(true);
        try {
            if (!enforcePosAction("cash_out", { amountLak: countedClosingCash, newValue: `${formatLak(countedClosingCash)} LAK` })) {
                return;
            }
            if (!activeCashSession.sessionId || activeCashSession.status !== "open") {
                setMessage(t("ui.no.open.cash.session.to.close"));
                return;
            }
            if (demoMode) {
                const varianceLak = calculateVariance(countedClosingCash, activeCashSession.expectedCashLak);
                setLastCloseSummary({
                    countedCashLak: countedClosingCash,
                    expectedCashLak: activeCashSession.expectedCashLak,
                    varianceLak,
                });
                setActiveCashSession({
                    ...activeCashSession,
                    sessionId: null,
                    status: "closed",
                });
                setClosingSummaryVisible(true);
                setMessage(fillPosCopy(t("ui.shift.closed"), { amount: formatLak(varianceLak) }));
                return;
            }
            const sessionId = activeCashSession.sessionId;
            const closed = await closeCashSessionRequest(sessionId, countedClosingCash, {
                countBreakdown: { closing: toDenominationCountMap(closingCashCounts) },
            });
            setActiveCashSession(closed);
            setLastCloseSummary({
                countedCashLak: closed.countedCashLak,
                expectedCashLak: closed.expectedCashLak,
                varianceLak: closed.varianceLak,
            });
            setClosingSummaryVisible(true);
            setOwnShiftReportEpoch((current) => current + 1);
            setMessage(fillPosCopy(t("ui.shift.closed"), { amount: formatLak(closed.varianceLak) }));
            router.refresh();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : t("ui.cash.session.close.failed"));
            await fetchCurrentCashSession().then(setActiveCashSession).catch(() => undefined);
        } finally {
            cashCloseInFlightRef.current = false;
            setCashCloseBusy(false);
        }
    }
    async function submitCashMovement(input: { amountLak: number; reason: string; type: CashMovementType }) {
        if (!claimCashMovementSubmit(cashInOutInFlightRef)) {
            return;
        }
        setCashInOutBusy(true);
        try {
            if (!enforcePosAction(input.type, { amountLak: input.amountLak, newValue: `${formatLak(input.amountLak)} LAK` })) {
                return;
            }
            if (demoMode) {
                setMessage(input.type === "cash_in" ? `Cash in recorded: +${formatLak(input.amountLak)} LAK.` : `Cash out recorded: -${formatLak(input.amountLak)} LAK.`);
                setCashInOutOpen(false);
                return;
            }
            if (!activeCashSession.sessionId || activeCashSession.status !== "open") {
                throw new Error(t("ui.no.open.cash.shift"));
            }
            const session = input.type === "cash_in"
                ? await cashInRequest(activeCashSession.sessionId, input.amountLak, input.reason || undefined)
                : await cashOutRequest(activeCashSession.sessionId, input.amountLak, input.reason);
            setActiveCashSession(session);
            setOwnShiftReportEpoch((current) => current + 1);
            setCashInOutOpen(false);
            setMessage(
                input.type === "cash_in"
                    ? `Cash in recorded: +${formatLak(input.amountLak)} LAK.`
                    : `Cash out recorded: -${formatLak(input.amountLak)} LAK.`,
            );
        } catch (error) {
            setMessage(error instanceof Error ? error.message : t("ui.cash.movement.failed"));
            await fetchCurrentCashSession().then(setActiveCashSession).catch(() => undefined);
            throw error;
        } finally {
            cashInOutInFlightRef.current = false;
            setCashInOutBusy(false);
        }
    }
    function selectPaymentMode(nextMode: PaymentMode) {
        if (nextMode === "mixed" && !enforcePosAction("split_payment")) {
            return;
        }
        if ((nextMode === "qr" || nextMode === "transfer" || nextMode === "card" || nextMode === "mixed") && !enforcePosAction("multi_currency_payment")) {
            return;
        }
        setPaymentMode(nextMode);
        if (nextMode !== "qr" && nextMode !== "transfer" && nextMode !== "mixed") {
            hideCustomerQrOverlay();
        }
        if (nextMode === "mixed") {
            setMixedPaymentOpen(true);
        }
    }
    function applyExactPayment(method: ExactPaymentMethod) {
        const next = applyExactPaymentToMethod(method, totalAmount, {
            cashAmount,
            qrAmount,
            transferAmount,
            cardAmount,
        });
        if (!next) {
            return;
        }
        setCashAmount(next.cashAmount);
        setQrAmount(next.qrAmount);
        setTransferAmount(next.transferAmount);
        setCardAmount(next.cardAmount);
    }
    function openMixedPayment() {
        if (!enforcePosAction("split_payment")) {
            return;
        }
        setMixedPaymentOpen(true);
    }
    function openSaleOptions() {
        setSaleOptionsDraft(saleOptionsCommitted);
        setSaleOptionsOpen(true);
    }
    function cancelSaleOptions() {
        setSaleOptionsDraft(saleOptionsCommitted);
        setSaleOptionsOpen(false);
    }
    function applySaleOptions() {
        // STEP 2: shells only — commit draft UI state; placeholders must not alter totals/cart.
        setSaleOptionsCommitted(saleOptionsDraft);
        setSaleOptionsOpen(false);
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
            setClosingSummaryVisible(false);
            setMessage(`Cash in recorded${suffix}.`);
            return;
        }
        if (action === "cash_out") {
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
    return (<div className="flex min-w-0 flex-col gap-3" data-pos-ui="">
      {message ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
          {message}
        </div>) : null}

      <section className={cn("relative grid min-w-0 gap-4", productGridVisible ? "xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-[auto_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_460px]" : "flex flex-col")}>
          <Panel className={cn("order-1 min-w-0 overflow-hidden p-3 shadow-sm", productGridVisible && "xl:col-start-1 xl:row-start-1")}>
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
                  <span className="block max-w-36 truncate">{category === "All" ? t("ui.all") : category}</span>
                </button>))}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
              {promotionBanners.map((banner) => (<div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary" key={banner}>
                  <BadgePercent className="size-4" aria-hidden="true"/>
                  {banner}
                </div>))}
            </div>
          </Panel>

          {productGridVisible ? (<section className="order-2 grid min-w-0 max-h-[812px] grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-3 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:thin] xl:col-span-2 xl:row-start-2 xl:grid-cols-6">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm font-semibold text-muted-foreground">
                {productQuery ? t("ui.no.search.results") : t("ui.no.products")}
              </div>
            ) : filteredProducts.map((product, index) => (<ProductGridItem key={productKey(product, index)} product={product} stockReferenceDate={stockReferenceDate} onClick={() => selectProductForSale(product)} onToggleFavorite={() => void toggleFavorite(product)}/>))}
          </section>) : null}

        <aside className={cn(
          "order-3 flex min-w-0 flex-col gap-3",
          productGridVisible && "xl:order-none xl:col-start-2 xl:row-start-1",
          productGridVisible && (cartCollapsed ? "xl:h-full xl:self-stretch" : "xl:self-start"),
        )}>
          <Panel
            ref={cartPanelRef}
            className={cn(
              "relative flex flex-col shadow-lg",
              cartCollapsed ? "overflow-hidden" : "overflow-visible",
              productGridVisible && cartCollapsed && "h-full min-h-[96px]",
              !productGridVisible && (cartCollapsed ? "min-h-0 overflow-hidden" : "min-h-[420px] overflow-hidden"),
            )}
          >
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
            {/* OUTER STEP-3 overlay only — Production cart internals below remain unmodified */}
            <div
              className={cn(
                "bg-card",
                productGridVisible
                  ? "max-xl:contents xl:absolute xl:top-full xl:right-0 xl:z-40 xl:max-h-[calc(100dvh-11rem)] xl:w-[420px] xl:overflow-y-auto xl:rounded-b-xl xl:border xl:border-t-0 xl:border-border xl:shadow-2xl 2xl:w-[460px]"
                  : "contents",
              )}
              style={productGridVisible && cartOverlayMaxHeightPx != null ? { maxHeight: cartOverlayMaxHeightPx } : undefined}
            >
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
                          <PosProductImage className="size-full rounded-none border-0" imageClassName="object-cover" imageKey={item.imageKey} imageUrl={item.unitImageUrl} label={localizedProductName(item)}/>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-base font-bold" title={localizedProductName(item)}>{localizedProductName(item)}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" title={`${item.sku} / ${item.unitName}`}>{item.sku} / {item.unitName}</div>
                          {item.stockWarning ? (<div className={cn("mt-1 truncate text-xs font-semibold", warningTextClass(item.stockWarning.tone))} title={stockWarningLabel(item.stockWarning.tone)}>
                              {stockWarningLabel(item.stockWarning.tone)}
                            </div>) : null}
                          {item.pricingNote ? (<div className="mt-1 truncate text-xs font-semibold text-primary" title={item.pricingNote}>{item.pricingNote}</div>) : null}
                        </div>
                        <button className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-danger transition hover:border-danger/50 hover:bg-danger/10" type="button" onClick={() => removeItem(item.id, item.unitId)} aria-label={t("ui.remove.item")}>
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
            <div className="border-t border-border px-4 pt-3">
              <SaleOptionsSummaryChip options={saleOptionsCommitted} />
              <button
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-bold text-foreground transition hover:border-primary hover:text-primary"
                type="button"
                onClick={openSaleOptions}
              >
                <BadgePercent className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {t("ui.sale.options")}
              </button>
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
            </div>) : (<PaymentFields availableQrBanks={availableQrBanks} cardAmount={cardAmount} cashAmount={cashAmount} dueAmount={dueAmount} heldBillCount={heldSales.length} heldBillsLoaded={heldBillsLoaded} holdDisabled={cartItems.length === 0} mode={paymentMode} onExact={(method) => applyExactPayment(method)} onHoldBill={holdSale} onResumeBills={() => {
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
            </div>
            </>)}
          </Panel>

          {demoMode && devDebug ? (<PosPermissionPanel auditEntries={auditEntries} pendingApprovals={pendingApprovals} policy={posPermissionPolicy} onApprove={(requestId) => resolvePendingApproval(requestId, "approved")} onReject={(requestId) => resolvePendingApproval(requestId, "rejected")} onTestAction={runControlledPosAction}/>) : null}

        </aside>
      </section>

      {mixedPaymentOpen ? (<MixedPaymentModal cardAmount={cardAmount} cashAmount={cashAmount} onClose={() => setMixedPaymentOpen(false)} onExact={(method) => applyExactPayment(method)} qrAmount={qrAmount} setCardAmount={setCardAmount} setCashAmount={setCashAmount} setPaymentMode={setPaymentMode} setQrAmount={setQrAmount} setTransferAmount={setTransferAmount} totalAmount={totalAmount} transferAmount={transferAmount}/>) : null}

      {saleOptionsOpen ? (
        <SaleOptionsDrawer
          billContext={billNo || receiptSettings.receiptPrefix}
          customerName={selectedCustomer?.name ?? t("ui.guest")}
          draft={saleOptionsDraft}
          onApply={applySaleOptions}
          onCancel={cancelSaleOptions}
          onDraftChange={setSaleOptionsDraft}
        />
      ) : null}

      {moreMenuOpen ? (<PosModal title={t("ui.more")} onClose={() => setMoreMenuOpen(false)}>
        <div className="grid gap-2 sm:grid-cols-2">
          <MoreMenuButton label={t("ui.recent.sales")} onClick={() => {
            if (enforcePosAction("view_recent_sales")) {
                setRecentSalesOpen(true);
            }
          }}/>
          <MoreMenuButton label={t("ui.hold.bills.resume.bills")} onClick={() => {
            void refreshHeldBillsFromServer();
            setHeldBillsOpen(true);
        }}/>
          <MoreMenuButton label={t("ui.unit.display")} onClick={() => {
            setUnitDisplayOpen(true);
        }}/>
          <MoreMenuButton label={t("ui.cash.shift.count")} onClick={() => {
            setCashShiftCountOpen(true);
        }}/>
          <MoreMenuButton label={t("ui.own.shift.report")} onClick={() => {
            setOwnShiftReportOpen(true);
        }}/>
          <MoreMenuButton label={t("ui.member.search")} onClick={() => {
            setMemberSearchOpen(true);
        }}/>
          <MoreMenuButton label={t("ui.refund.void")} onClick={() => {
            if (enforcePosAction("view_recent_sales")) {
                openReturnExchange("return");
            }
        }}/>
          <MoreMenuButton label={t("ui.cash.in.cash.out")} onClick={() => {
            setCashInOutOpen(true);
            void fetchCurrentCashSession().then(setActiveCashSession).catch(() => undefined);
        }}/>
          <MoreMenuButton label={t("ui.print.reprint.receipt")} onClick={() => {
            /* ──────────────────────────────────────────────────────────────────
             * STEP 8 — Print / Reprint unification.
             * More "Print / Reprint Receipt" now resolves the persisted saleId
             * and goes through the same canonical audited reprint path used by
             * Recent Sales:
             *   reprintSaleReceipt(saleId) → fetchSaleReceipt(saleId) → window.print
             * This removes the prior unaudited lastReceipt-only print bypass.
             * ────────────────────────────────────────────────────────────────── */
            const saleId = lastReceipt?.saleId;
            if (saleId && !demoMode) {
                if (!enforcePosAction("reprint_receipt")) return;
                void (async () => {
                    try {
                        await reprintSaleReceipt(saleId);
                        const loaded = await fetchSaleReceipt(saleId);
                        const receipt: ReceiptSnapshot = {
                            ...loaded,
                            branchName: loaded.branchName || branchName,
                            cartItems: loaded.cartItems as PosCartItem[],
                            saleId,
                        };
                        setLastReceipt(receipt);
                        setReceiptIsFirstPrint(false);
                        // Match Recent Sales reprint: audit already recorded; auto-print as transport only.
                        setReceiptAutoPrint(true);
                        setReceiptOpen(true);
                    } catch (error) {
                        setMessage(error instanceof Error ? error.message : t("ui.receipt.load.failed"));
                    }
                })();
            } else if (lastReceipt && demoMode) {
                setReceiptIsFirstPrint(false);
                setReceiptAutoPrint(false);
                setReceiptOpen(true);
            } else if (enforcePosAction("view_recent_sales")) {
                setRecentSalesOpen(true);
            }
        }}/>
        </div>
      </PosModal>) : null}

      {unitDisplayOpen ? (<PosModal title={t("ui.unit.display")} onBack={() => backFromMoreChild(() => setUnitDisplayOpen(false))} onClose={() => closeMoreChild(() => setUnitDisplayOpen(false))}>
        <p className="text-sm text-muted-foreground">{t("ui.unit.display.hint")}</p>
        <div className="mt-4 grid gap-3" data-testid="pos-unit-display-mode">
          <button
            aria-pressed={unitDisplayMode === "separate"}
            className={cn(
              "rounded-xl border p-4 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              unitDisplayMode === "separate" ? "border-primary bg-primary/10" : "border-border bg-background",
            )}
            type="button"
            onClick={() => setPosUnitDisplayMode("separate")}
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", unitDisplayMode === "separate" ? "border-primary" : "border-muted-foreground")}>
                {unitDisplayMode === "separate" ? <span className="size-2 rounded-full bg-primary"/> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">{t("ui.unit.cards.separate")}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("ui.unit.cards.separate.hint")}</span>
              </span>
            </div>
          </button>
          <button
            aria-pressed={unitDisplayMode === "combined"}
            className={cn(
              "rounded-xl border p-4 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              unitDisplayMode === "combined" ? "border-primary bg-primary/10" : "border-border bg-background",
            )}
            type="button"
            onClick={() => setPosUnitDisplayMode("combined")}
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", unitDisplayMode === "combined" ? "border-primary" : "border-muted-foreground")}>
                {unitDisplayMode === "combined" ? <span className="size-2 rounded-full bg-primary"/> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">{t("ui.unit.cards.combined")}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("ui.unit.cards.combined.hint")}</span>
              </span>
            </div>
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-muted-foreground">
          {t("ui.unit.display.current")}: {unitDisplayMode === "separate" ? t("ui.unit.cards.separate") : t("ui.unit.cards.combined")}
        </p>
      </PosModal>) : null}

      {favoritesOpen ? (<PosModal title={t("ui.favorites")} onClose={() => setFavoritesOpen(false)}>
        {favoriteProducts.length === 0 ? (<div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="pos-favorites-empty">{t("ui.no.favorite.products.yet")}</div>) : (<div className="grid grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-3 xl:grid-cols-6" data-testid="pos-favorites-grid">
          {favoriteProducts.map((product, index) => (<ProductGridItem key={productKey(product, index)} product={product} stockReferenceDate={stockReferenceDate} cartQuantity={favoriteCartQtyByProductId.get(product.id) ?? 0} onCartQuantityDelta={(delta) => adjustFavoriteCartQuantity(product, delta)} onClick={() => {
            // Keep Favorites open so cashiers can add multiple items without reopening.
            selectProductForSale(product);
        }} onToggleFavorite={() => void toggleFavorite(product)}/>))}
        </div>)}
      </PosModal>) : null}

      {heldBillsOpen ? (<PosModal title={t("ui.hold.bills.resume.bills")} onBack={() => backFromMoreChild(() => setHeldBillsOpen(false))} onClose={() => closeMoreChild(() => setHeldBillsOpen(false))}>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton icon={RotateCcw} label={heldBillsBusy ? t("ui.loading") : t("ui.resume.bills")} onClick={() => {
            void resumeSale().then((resumed) => {
                if (resumed) setHeldBillsOpen(false);
            });
        }}/>
            <ActionButton icon={ReceiptText} label={heldBillsBusy ? t("ui.saving") : t("ui.hold.bills")} onClick={() => {
            void holdSale().then((held) => {
                if (held) setHeldBillsOpen(false);
            });
        }}/>
          </div>
          <select className="field-input h-11 text-sm" value={selectedHeldSaleId} onChange={(event) => setSelectedHeldSaleId(event.target.value)}>
            <option value="">{t("ui.held.bills")}</option>
            {heldSales.map((sale) => (<option key={sale.id} value={sale.id}>
                {sale.saleNo} · {formatLak(sale.totalLak)} LAK · {sale.itemCount} · {sale.cashierName || sale.cashierId || "—"} · {new Date(sale.createdAt).toLocaleString()}{sale.reserved ? " · reserved" : ""}{activeHeldBillId === sale.id ? " · in cart" : ""}
              </option>))}
          </select>
          <button className="h-11 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={heldBillsBusy || !selectedHeldSaleId} onClick={() => void deleteHeldSale()}>
            {t("ui.delete.held.bill")}
          </button>
        </div>
      </PosModal>) : null}

      {heldBillConflict ? (<PosModal title={t("ui.current.cart.has.items")} onClose={() => setHeldBillConflict(null)}>
        <div className="grid gap-3 text-sm">
          <p className="text-muted-foreground">{t("ui.hold.current.before.resume")} {heldBillConflict.saleNo}</p>
          <button className="h-11 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={heldBillsBusy} onClick={() => void holdCurrentAndResume()}>
            {heldBillsBusy ? t("ui.saving.current.bill") : t("ui.hold.current.resume")}
          </button>
          <button className="h-11 rounded-md border border-border px-3 font-semibold" type="button" onClick={() => setHeldBillConflict(null)}>
            {t("ui.continue.current.bill")}
          </button>
          <button className="h-11 rounded-md border border-danger/40 px-3 font-semibold text-danger" type="button" onClick={() => setHeldBillConflict(null)}>
            {t("ui.cancel")}
          </button>
        </div>
      </PosModal>) : null}

      {memberSearchOpen ? (<PosModal title={t("ui.member.search")} onBack={() => backFromMoreChild(() => setMemberSearchOpen(false))} onClose={() => closeMoreChild(() => setMemberSearchOpen(false))}>
        <MemberSearchPanel
          demoMode={demoMode}
          loyaltyEnabled={loyaltySettings.loyaltyEnabled}
          maxRedeemPoints={maxRedeemablePoints}
          minRedeemPoints={loyaltySettings.loyaltyMinRedeemPoints}
          redeemDiscountLak={loyaltyRedeemDiscount}
          redeemPoints={effectiveRedeemPoints}
          selected={selectedCustomer}
          onClear={clearSelectedMember}
          onRedeemPointsChange={setRedeemPoints}
          onSelect={selectMember}
        />
      </PosModal>) : null}

      {cashShiftCountOpen ? (<PosModal title={t("ui.cash.shift.count")} onBack={() => backFromMoreChild(() => setCashShiftCountOpen(false))} onClose={() => closeMoreChild(() => setCashShiftCountOpen(false))}>
        <StaffControl
          businessDate={businessDate}
          cashCloseBusy={cashCloseBusy}
          cashDifference={cashDifference}
          cashInLak={cashInLak}
          cashOutLak={cashOutLak}
          cashSales={cashSales}
          closingCashCounts={closingCashCounts}
          closingSummaryVisible={closingSummaryVisible}
          countedCash={actualClosingCash}
          expanded={staffControlExpanded}
          expectedCash={expectedCash}
          openingCashCounts={openingCashCounts}
          openingCashTotal={effectiveOpeningCash}
          qrTransferSales={qrTransferSales}
          sessionStatus={activeCashSession.status}
          onConfirmClosing={confirmClosingSummary}
          onOpenSession={openCashShiftSession}
          onToggleExpanded={() => setStaffControlExpanded((current) => !current)}
          onUpdateClosingCashCount={updateClosingCashCount}
          onUpdateOpeningCashCount={updateOpeningCashCount}
        />
      </PosModal>) : null}

      {unitSelectionProduct ? (<UnitSelectorModal overlayClassName={favoritesOpen ? "z-[70]" : undefined} product={unitSelectionProduct} onClose={() => {
        setUnitSelectionProduct(null);
        setUnitSelectionIntent("add");
      }} onSelect={(unit) => {
        const selectedProduct = unitSelectionProduct;
        if (unitSelectionIntent === "decrement") {
            const line = cartItemsRef.current.find((item) => item.id === selectedProduct.id && item.unitId === unit.id);
            if (line) {
                if (line.quantity <= 1) removeItem(line.id, line.unitId);
                else updateQuantity(line.id, line.quantity - 1, line.unitId);
            }
            setUnitSelectionProduct(null);
            setUnitSelectionIntent("add");
            return;
        }
        addToCart(selectedProduct, unit);
      }}/>) : null}

      {saleCompletedReceipt ? (<SaleCompletedModal receipt={saleCompletedReceipt} printMode={receiptPrintMode} onClose={() => setSaleCompletedReceipt(null)} onNewSale={() => setSaleCompletedReceipt(null)} onPrint={() => {
            setLastReceipt(saleCompletedReceipt);
            setReceiptIsFirstPrint(true);
            setReceiptAutoPrint(true);
            setReceiptOpen(true);
            setSaleCompletedReceipt(null);
        }} onView={() => {
            setLastReceipt(saleCompletedReceipt);
            setReceiptIsFirstPrint(true);
            setReceiptAutoPrint(false);
            setReceiptOpen(true);
            setSaleCompletedReceipt(null);
        }}/>) : null}

      {recentSalesOpen ? (<RecentSalesModal
        currentRole={posPermissionPolicy.role}
        customEnd={recentSalesCustomEnd}
        customStart={recentSalesCustomStart}
        error={recentSalesError}
        filter={recentSalesFilter}
        hasMore={recentSalesHasMore}
        loading={recentSalesLoading}
        sales={filteredRecentSales}
        search={recentSalesSearch}
        onBack={() => backFromMoreChild(() => setRecentSalesOpen(false))}
        onClose={() => closeMoreChild(() => setRecentSalesOpen(false))}
        onCustomEnd={setRecentSalesCustomEnd}
        onCustomStart={setRecentSalesCustomStart}
        onDuplicate={duplicateSaleToCart}
        onExchange={(sale) => openReturnExchange("exchange", sale)}
        onFilter={setRecentSalesFilter}
        onLoadMore={() => void refreshRecentSalesFromServer({ append: true })}
        onRefund={refundSale}
        onReprint={(sale) => openReceiptForSale(sale, true)}
        onRetry={() => void refreshRecentSalesFromServer({ append: false })}
        onSearch={setRecentSalesSearch}
        onViewReceipt={(sale) => openReceiptForSale(sale)}
        onVoid={voidSale}
      />) : null}
      {returnExchangeOpen ? (<ReturnExchangeVoidModal currentRole={posPermissionPolicy.role} initialSaleId={returnExchangeSaleId} initialTab={returnExchangeTab} onBack={() => backFromMoreChild(() => setReturnExchangeOpen(false))} onClose={() => closeMoreChild(() => setReturnExchangeOpen(false))} onCompleted={(nextMessage) => { setMessage(nextMessage); void refreshRecentSalesFromServer({ append: false }); }}/>) : null}

      {managerApprovalRequest ? (<ManagerApprovalModal action={managerApprovalRequest.action} pin={managerApprovalPin} reason={managerApprovalReason} sale={managerApprovalRequest.sale} onClose={closeManagerApprovalRequest} onPinChange={setManagerApprovalPin} onReasonChange={setManagerApprovalReason} onSubmit={submitManagerApprovalRequest}/>) : null}
      {cashInOutOpen ? (
        <CashInOutModal
          expectedCashLak={activeCashSession.status === "open" ? activeCashSession.expectedCashLak : 0}
          sessionOpen={activeCashSession.status === "open" && Boolean(activeCashSession.sessionId)}
          submitting={cashInOutBusy}
          onBack={() => backFromMoreChild(() => setCashInOutOpen(false))}
          onClose={() => {
            if (!cashInOutBusy) closeMoreChild(() => setCashInOutOpen(false));
          }}
          onSubmit={(input) => submitCashMovement(input)}
        />
      ) : null}
      {ownShiftReportOpen ? <OwnShiftReportModal key={ownShiftReportEpoch} storeRole={posPermissionPolicy.role} onBack={() => backFromMoreChild(() => setOwnShiftReportOpen(false))} onClose={() => closeMoreChild(() => setOwnShiftReportOpen(false))} /> : null}

      {receiptOpen && lastReceipt ? (<ReceiptPreview autoPrint={receiptAutoPrint} branchName={lastReceipt.branchName} cashierName={lastReceipt.cashierName} cartItems={lastReceipt.cartItems} changeAmount={lastReceipt.changeAmount} createdAt={lastReceipt.createdAt} customerName={lastReceipt.customerName} discountTotal={lastReceipt.discountTotal} isFirstPrint={receiptIsFirstPrint} onBack={moreMenuOpen && !recentSalesOpen ? () => backFromMoreChild(() => { setReceiptOpen(false); setReceiptAutoPrint(false); }) : undefined} onClose={() => {
            setReceiptOpen(false);
            setReceiptAutoPrint(false);
            if (!recentSalesOpen) setMoreMenuOpen(false);
        }} onReprint={() => enforcePosAction("reprint_receipt")} paidAmount={lastReceipt.paidAmount} paymentBreakdown={lastReceipt.paymentBreakdown} paymentMode={lastReceipt.paymentMode} receiptNo={lastReceipt.receiptNo} receiptSettings={receiptSettings} saleId={lastReceipt.saleId} saleNo={lastReceipt.saleNo} showTaxOnReceipt={receiptSettings.showTaxOnReceipt} subtotal={lastReceipt.subtotal} taxAmount={lastReceipt.taxAmount} totalAmount={lastReceipt.totalAmount}/>) : null}
    </div>);
}
function Panel({ children, className, ref }: {
    children: React.ReactNode;
    className?: string;
    ref?: React.Ref<HTMLElement>;
}) {
    return <section ref={ref} className={cn("min-w-0 rounded-lg border border-border bg-card", className)}>{children}</section>;
}
function PosModal({ children, headerActions, onBack, onClose, title }: {
    children: React.ReactNode;
    headerActions?: React.ReactNode;
    onBack?: () => void;
    onClose: () => void;
    title: string;
}) {
    return <PosWorkspaceModal headerActions={headerActions} onBack={onBack} onClose={onClose} title={title}>{children}</PosWorkspaceModal>;
}
function MoreMenuButton({ label, onClick }: {
    label: string;
    onClick: () => void;
}) {
    return (<button className="flex min-h-14 w-full items-center rounded-xl border border-border bg-background px-4 text-left text-sm font-bold transition hover:border-primary hover:bg-primary/10 hover:text-primary" type="button" onClick={onClick}>
      {label}
    </button>);
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
/** Owner STEP 2 — floating labels (CSS only). Two backdrop families: light chips vs solid capsules. */
/** Brighter emerald than #028A0F for price/stock legibility on photos. */
const POS_CARD_EMERALD_BRIGHT = "#2EDB45";
/** Name / Unit / SKU — light translucent, text-hugging (not solid). */
const posCardLightLabelBackdropClass =
  "inline-flex w-fit max-w-full rounded px-1 py-0.5 bg-black/35 shadow-[0_1px_2px_rgba(0,0,0,0.18)] ring-1 ring-black/15 xl:px-0.5 xl:py-0.5";
/** Price / normal stock — darker semi-solid capsule (distinct from light chips). Content-fit; text must stay inside. */
const posCardSolidCapsuleClass =
  "inline-flex w-fit max-w-full shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/45 bg-black/75 px-2 py-0.5 shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-1 ring-black/30 xl:px-1 xl:py-0.5";
const posCardFloatingNameClass =
  "block text-white [paint-order:stroke_fill] [-webkit-text-stroke:0.4px_rgba(0,0,0,0.65)] [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_1px_rgba(0,0,0,0.9)]";
const posCardFloatingUnitClass =
  "block text-white text-[11px] font-extrabold uppercase tracking-wide [paint-order:stroke_fill] [-webkit-text-stroke:0.35px_rgba(0,0,0,0.55)] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)] xl:text-[10px]";
const posCardFloatingSkuClass =
  "block font-mono text-[10px] font-semibold text-white/90 [paint-order:stroke_fill] [-webkit-text-stroke:0.25px_rgba(0,0,0,0.45)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] xl:text-[9px]";
const posCardFloatingPriceClass =
  "block whitespace-nowrap text-[18px] font-black leading-none [paint-order:stroke_fill] [-webkit-text-stroke:0.3px_rgba(0,0,0,0.72)] [text-shadow:0_1px_2px_rgba(0,0,0,0.88)] xl:text-[12px]";

function ProductGridItem({ cartQuantity, onCartQuantityDelta, onClick, onToggleFavorite, product, stockReferenceDate, }: {
    /** Favorites-only: sell-unit cart quantity badge / mini-stepper (hidden when 0 / omitted). */
    cartQuantity?: number;
    /** Favorites-only: +/- adjust without triggering card add click. */
    onCartQuantityDelta?: (delta: -1 | 1) => void;
    onClick: () => void;
    onToggleFavorite: () => void;
    product: PosProduct;
    stockReferenceDate: Date;
}) {
    const sellableQty = maxSellQty(product.stockQty, product.conversionQty ?? 1);
    const isFavorite = Boolean(product.isFavorite);
    const badgeQty = typeof cartQuantity === "number" && cartQuantity > 0 ? cartQuantity : 0;
    return (
      <div className="group relative min-h-[190px] min-w-0">
        {badgeQty > 0 ? (
          onCartQuantityDelta ? (
            <div
              className="absolute left-2 top-2 z-20 inline-flex h-7 items-center overflow-hidden rounded-full border border-white/30 bg-slate-900/90 text-white shadow-sm"
              data-testid="pos-favorites-cart-qty-stepper"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <button
                aria-label={t("ui.decrease.qty")}
                className="grid h-7 w-7 place-items-center text-[14px] font-bold leading-none transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                data-testid="pos-favorites-cart-qty-minus"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCartQuantityDelta(-1);
                }}
              >
                −
              </button>
              <span
                className="min-w-5 px-0.5 text-center text-[11px] font-bold tabular-nums leading-none"
                data-testid="pos-favorites-cart-qty-badge"
              >
                {badgeQty}
              </span>
              <button
                aria-label={t("ui.increase.qty")}
                className="grid h-7 w-7 place-items-center text-[14px] font-bold leading-none transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                data-testid="pos-favorites-cart-qty-plus"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCartQuantityDelta(1);
                }}
              >
                +
              </button>
            </div>
          ) : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-2 z-20 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900/90 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white shadow-sm"
              data-testid="pos-favorites-cart-qty-badge"
            >
              {badgeQty}
            </span>
          )
        ) : null}
        <button
          aria-label={isFavorite ? t("ui.remove.from.favorites") : t("ui.add.to.favorites")}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 z-20 grid size-9 place-items-center rounded-full border border-white/35 bg-black/55 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Star
            aria-hidden="true"
            className={cn("size-4", isFavorite ? "fill-[#FACC15] text-[#FACC15]" : "fill-transparent text-white")}
          />
        </button>
        <button className="relative min-h-[190px] w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15" type="button" onClick={onClick} title={`${localizedProductName(product)} — ${product.unitName} / ${product.sku}`}>
          <PosProductImage className="absolute inset-0 size-full rounded-none border-0" imageClassName="object-cover" imageKey={product.imageKey} imageUrl={product.unitImageUrl} label={localizedProductName(product)}/>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex min-w-0 flex-col items-start gap-1 p-2.5 xl:gap-0.5 xl:p-1.5">
            <div className="flex max-w-[calc(100%-0.25rem)] flex-col items-start gap-1 xl:max-w-full xl:gap-0.5">
              <span className={posCardLightLabelBackdropClass}>
                <span className={cn("line-clamp-2 max-w-[min(100%,14rem)] break-words text-[12px] font-black leading-snug xl:max-w-full xl:text-[11px] xl:leading-tight", posCardFloatingNameClass)} title={localizedProductName(product)}>{localizedProductName(product)}</span>
              </span>
              <span className={posCardLightLabelBackdropClass}>
                <span className={cn("max-w-[min(100%,10rem)] truncate xl:max-w-full", posCardFloatingUnitClass)} title={product.unitName}>{product.unitName}</span>
              </span>
              <span className={posCardLightLabelBackdropClass}>
                <span className={cn("max-w-[min(100%,11rem)] truncate xl:max-w-full", posCardFloatingSkuClass)} title={product.sku}>{product.sku}</span>
              </span>
            </div>
            <div className="flex w-full min-w-0 items-end justify-between gap-1 pt-0.5">
              <span className={posCardSolidCapsuleClass} title={`${formatLak(product.priceLak)} LAK`}>
                <span
                  className={posCardFloatingPriceClass}
                  style={{ color: POS_CARD_EMERALD_BRIGHT }}
                >
                  {formatLak(product.priceLak)} LAK
                </span>
              </span>
              <StockBadge className="shrink-0" product={product} sellableQty={sellableQty} stockReferenceDate={stockReferenceDate}/>
            </div>
          </div>
        </button>
      </div>
    );
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
function StockBadge({ className, product, sellableQty, stockReferenceDate, }: {
    className?: string;
    product: PosProduct;
    sellableQty?: number;
    stockReferenceDate: Date;
}) {
    const warning = getStockWarning(product, stockReferenceDate);
    const available = sellableQty ?? maxSellQty(product.stockQty, product.conversionQty ?? 1);
    const label = warning ? stockWarningLabel(warning.tone) : fillPosCopy(t("ui.stock.left"), { qty: available });
    if (warning) {
      return (<span className={cn("inline-flex w-fit max-w-full shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold shadow-sm xl:px-1.5 xl:py-0.5 xl:text-[9px]", warningBadgeClass(warning.tone), className)} title={`${label} (${product.unitName})`}>
        {label}
      </span>);
    }
    return (<span
      className={cn(posCardSolidCapsuleClass, "whitespace-nowrap text-[11px] font-bold leading-none xl:text-[8px]", className)}
      style={{ color: POS_CARD_EMERALD_BRIGHT }}
      title={`${label} (${product.unitName})`}
    >
      {label}
    </span>);
}
function QuantityStepper({ item, onChange }: {
    item: PosCartItem;
    onChange: (productId: string, quantity: number, unitId?: string) => void;
}) {
    const maxSaleQty = Math.max(1, maxSellQty(item.stockQty, item.conversionQty ?? 1));
    return (<div className="inline-flex h-11 items-center rounded-xl border border-border bg-card">
      <button className="grid size-11 place-items-center" type="button" onClick={() => onChange(item.id, item.quantity - 1, item.unitId)} aria-label={t("ui.decrease.qty")}>
        <Minus aria-hidden="true"/>
      </button>
      <PosNumberInput className="h-11 w-16 border-x border-border bg-transparent text-center text-base font-bold outline-none" max={maxSaleQty} min={1} value={item.quantity} onValueChange={(value) => onChange(item.id, value, item.unitId)}/>
      <button className="grid size-11 place-items-center" type="button" onClick={() => onChange(item.id, item.quantity + 1, item.unitId)} aria-label={t("ui.increase.qty")}>
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
function ExactPaymentButton({ disabled, onClick }: {
    disabled: boolean;
    onClick: () => void;
}) {
    return (<button
      className="h-11 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-border disabled:hover:bg-muted"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {t("ui.exact")}
    </button>);
}
function PaymentFields({ availableQrBanks, cardAmount, cashAmount, dueAmount, heldBillCount, heldBillsLoaded, holdDisabled, mode, onExact, onHoldBill, onResumeBills, qrAmount, selectedQrBankId, setCardAmount, setCashAmount, setQrAmount, setSelectedQrBankId, setTransferAmount, transferAmount, }: {
    availableQrBanks: QrBank[];
    cardAmount: number;
    cashAmount: number;
    dueAmount: number;
    heldBillCount: number;
    heldBillsLoaded: boolean;
    holdDisabled: boolean;
    mode: PaymentMode;
    onExact: (method: ExactPaymentMethod) => void;
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
    const exactDisabled = dueAmount <= 0;
    return (<div className="mt-3 grid gap-2 sm:grid-cols-2">
      {(mode === "cash" || mode === "mixed") ? (<div className="grid gap-1 text-xs font-semibold sm:col-span-2">
          <span>{t("ui.cash.amount")}</span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <PosNumberInput className="field-input" value={cashAmount} onValueChange={setCashAmount}/>
            <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("cash")}/>
            <button className="h-11 rounded-md border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-border disabled:hover:text-muted-foreground" type="button" onClick={onHoldBill} disabled={holdDisabled}>
              {t("ui.hold.bill")}
            </button>
            <button className={cn("h-11 rounded-md border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground", heldBillCount > 0 ? "border-[#F59E0B]/60 bg-[#F59E0B] text-white hover:bg-[#D97706]" : "")} type="button" onClick={onResumeBills} disabled={heldBillsLoaded && heldBillCount === 0}>
              {heldBillCount > 0 ? fillPosCopy(t("ui.resume.bills.count"), { count: heldBillCount }) : t("ui.resume.bills")}
            </button>
          </div>
        </div>) : null}
      {(mode === "qr" || mode === "mixed") ? (<>
          <Field label={t("ui.qr.bank")}>
            <select className="field-input" value={selectedQrBankId} onChange={(event) => setSelectedQrBankId(event.target.value)}>
              {availableQrBanks.length === 0 ? <option value="">{t("ui.no.qr.accounts")}</option> : availableQrBanks.map((bank) => (<option key={bank.id} value={bank.id}>{bank.bankName}</option>))}
            </select>
          </Field>
          <Field label={t("ui.qr.amount")}>
            <div className="flex gap-2">
              <PosNumberInput className="field-input min-w-0 flex-1" value={qrAmount} onValueChange={setQrAmount}/>
              <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("qr")}/>
            </div>
          </Field>
        </>) : null}
      {(mode === "transfer" || mode === "mixed") ? (<Field label={t("ui.bank.transfer")}>
          <div className="flex gap-2">
            <PosNumberInput className="field-input min-w-0 flex-1" value={transferAmount} onValueChange={setTransferAmount}/>
            <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("transfer")}/>
          </div>
        </Field>) : null}
      {(mode === "card" || mode === "mixed") ? (<Field label={t("ui.card.amount")}>
          <div className="flex gap-2">
            <PosNumberInput className="field-input min-w-0 flex-1" value={cardAmount} onValueChange={setCardAmount}/>
            <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("card")}/>
          </div>
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
function StaffControl({
  businessDate,
  cashCloseBusy,
  cashDifference,
  cashInLak,
  cashOutLak,
  cashSales,
  closingCashCounts,
  closingSummaryVisible,
  countedCash,
  expanded,
  expectedCash,
  openingCashCounts,
  openingCashTotal,
  onConfirmClosing,
  onOpenSession,
  onToggleExpanded,
  onUpdateClosingCashCount,
  onUpdateOpeningCashCount,
  qrTransferSales,
  sessionStatus,
}: {
  businessDate: string;
  cashCloseBusy: boolean;
  cashDifference: number;
  cashInLak: number;
  cashOutLak: number;
  cashSales: number;
  closingCashCounts: Record<number, number>;
  closingSummaryVisible: boolean;
  countedCash: number;
  expanded: boolean;
  expectedCash: number;
  openingCashCounts: Record<number, number>;
  openingCashTotal: number;
  onConfirmClosing: () => void;
  onOpenSession: () => void;
  onToggleExpanded: () => void;
  onUpdateClosingCashCount: (denomination: number, quantity: number) => void;
  onUpdateOpeningCashCount: (denomination: number, quantity: number) => void;
  qrTransferSales: number;
  sessionStatus: "closed" | "not_started" | "open";
}) {
  const CollapseIcon = expanded ? ChevronUp : ChevronDown;
  const sessionOpen = sessionStatus === "open";
  const variance = varianceKind(cashDifference);
  const varianceLabel =
    variance === "exact" ? t("ui.exact") : variance === "over" ? t("ui.over") : t("ui.short");
  const statusLabel =
    sessionStatus === "open"
      ? t("ui.session.open")
      : sessionStatus === "closed"
        ? t("ui.session.closed")
        : t("ui.staff.not.started");
  return (
    <section className="min-w-0 scroll-mt-24 rounded-lg border border-border bg-card p-3" data-testid="cash-shift-count" id="staff-control">
      <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={onToggleExpanded} aria-expanded={expanded}>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true"/>
          <div className="min-w-0 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">{t("ui.cash.shift.count")}</h3>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{businessDate}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sessionStatusClassName(sessionStatus))}>{statusLabel}</span>
            </div>
          </div>
        </div>
        <CollapseIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
      </button>

      {!expanded ? null : (
        <>
          <div className="mt-3 rounded-md border border-[#FFD700]/35 bg-[#FFD700]/10 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#FFD700]">{t("ui.opening.cash.total")}</div>
            <div className="mt-1 text-2xl font-black leading-none text-[#FFD700]">{formatLak(openingCashTotal)} LAK</div>
          </div>

          {!sessionOpen ? (
            <>
              <div className="mt-2 rounded-md border border-border bg-background p-2">
                <div className="mb-2 text-xs font-semibold">{t("ui.opening.cash.count")}</div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {CASH_DENOMINATIONS_LAK.map((denomination) => {
                    const qty = openingCashCounts[denomination] ?? 0;
                    const line = denominationLineSubtotal(denomination, qty);
                    return (
                      <label className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 text-[11px]" key={`open-${denomination}`}>
                        <span className="font-semibold">{formatLak(denomination)}</span>
                        <PosNumberInput
                          className="h-8 min-w-0 rounded-md border border-border bg-card px-1 text-center text-[11px] font-semibold outline-none transition focus:border-primary"
                          data-testid={`opening-denom-${denomination}`}
                          min={0}
                          value={qty}
                          onValueChange={(value) => onUpdateOpeningCashCount(denomination, value)}
                        />
                        <span className="min-w-[4.5rem] text-right font-semibold text-muted-foreground">{formatLak(line)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                className="mt-2 h-9 w-full rounded-md border border-success/40 bg-success/10 text-xs font-semibold text-success transition hover:bg-success hover:text-white disabled:opacity-50"
                data-testid="open-cash-session"
                type="button"
                onClick={onOpenSession}
              >
                {t("ui.start.work")}
              </button>
            </>
          ) : (
            <div className="mt-2 rounded-md border border-border bg-background p-2">
              <div className="mb-2 text-xs font-semibold">{t("ui.closing.cash.count")}</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {CASH_DENOMINATIONS_LAK.map((denomination) => {
                  const qty = closingCashCounts[denomination] ?? 0;
                  const line = denominationLineSubtotal(denomination, qty);
                  return (
                    <label className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 text-[11px]" key={`close-${denomination}`}>
                      <span className="font-semibold">{formatLak(denomination)}</span>
                      <PosNumberInput
                        className="h-8 min-w-0 rounded-md border border-border bg-card px-1 text-center text-[11px] font-semibold outline-none transition focus:border-primary"
                        data-testid={`closing-denom-${denomination}`}
                        min={0}
                        value={qty}
                        onValueChange={(value) => onUpdateClosingCashCount(denomination, value)}
                      />
                      <span className="min-w-[4.5rem] text-right font-semibold text-muted-foreground">{formatLak(line)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 rounded-md border border-border bg-background p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">{t("ui.closing.summary")}</div>
              {closingSummaryVisible && sessionStatus === "closed" ? (
                <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">{t("ui.cash.session.closed")}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <SettlementValue label={t("ui.cash.sales")} value={`${formatLak(cashSales)} LAK`}/>
              <SettlementValue label={t("ui.qr.transfer")} value={`${formatLak(qrTransferSales)} LAK`}/>
              <SettlementValue label={t("ui.cash.in")} value={`${formatLak(cashInLak)} LAK`}/>
              <SettlementValue label={t("ui.cash.out")} value={`${formatLak(cashOutLak)} LAK`}/>
              <SettlementValue label={t("ui.expected.cash")} value={`${formatLak(expectedCash)} LAK`} strong/>
              <SettlementValue label={t("ui.counted.cash")} value={`${formatLak(countedCash)} LAK`} strong/>
            </div>
            <div
              className={cn(
                "mt-2 rounded-md border px-2 py-2 text-xs font-semibold",
                variance === "exact"
                  ? "border-success/30 bg-success/10 text-success"
                  : variance === "over"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-danger/40 bg-danger/10 text-danger",
              )}
              data-testid="cash-variance"
            >
              <div>{varianceLabel}</div>
              <div>{fillPosCopy(t("ui.cash.difference.amount"), { amount: formatLak(cashDifference) })}</div>
            </div>
            {sessionOpen ? (
              <button
                className="mt-2 h-9 w-full rounded-md border border-primary/40 bg-primary/10 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="confirm-closing-summary"
                disabled={cashCloseBusy}
                type="button"
                onClick={onConfirmClosing}
              >
                {cashCloseBusy ? t("ui.confirming") : t("ui.confirm.closing.summary")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
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
function sessionStatusClassName(status: "closed" | "not_started" | "open") {
    if (status === "open") return "bg-success/15 text-success";
    if (status === "closed") return "bg-danger/15 text-danger";
    return "bg-muted text-muted-foreground";
}
function PosNumberInput({ className, "data-testid": dataTestId, max, min = 0, onValueChange, value, }: {
    className?: string;
    "data-testid"?: string;
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
    return (<input className={className} data-testid={dataTestId} inputMode="numeric" type="text" value={draft} onBlur={() => commit(draft)} onChange={(event) => {
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
function UnitSelectorModal({ onClose, onSelect, overlayClassName, product, }: {
    onClose: () => void;
    onSelect: (unit: PosProductUnit) => void;
    /** Elevated overlay when nested above Favorites (workspace z-[60]). */
    overlayClassName?: string;
    product: PosProduct;
}) {
    const units = resolvePosSaleUnits(product);
    return (<PosSmallModal closeAriaLabel={t("ui.close.unit.selector")} closeOnBackdrop={true} closeOnEscape={true} description={localizedProductName(product)} onClose={onClose} overlayClassName={overlayClassName} size="md" title={t("ui.select.sale.unit")}>
        <div className="grid gap-2">
          {units.map((unit) => (<button className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-left transition hover:border-primary" key={unit.id} type="button" onClick={() => onSelect(unit)}>
              <span>
                <span className="block font-semibold">{unit.unitName}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {fillPosCopy(t("ui.base.units"), { qty: unit.conversionQty })} {unit.barcode ? `| ${unit.barcode}` : t("ui.manual.select")}
                </span>
              </span>
              <span className="text-right font-semibold text-primary">{formatLak(unit.sellingPriceLak)} LAK</span>
            </button>))}
        </div>
      </PosSmallModal>);
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
function MixedPaymentModal({ cardAmount, cashAmount, onClose, onExact, qrAmount, setCardAmount, setCashAmount, setPaymentMode, setQrAmount, setTransferAmount, totalAmount, transferAmount, }: {
    cardAmount: number;
    cashAmount: number;
    onClose: () => void;
    onExact: (method: ExactPaymentMethod) => void;
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
    const due = Math.max(totalAmount - paid, 0);
    const valid = paid >= totalAmount;
    const exactDisabled = due <= 0;
    return (<PosSmallModal closeOnBackdrop={false} closeOnEscape={false} footer={<button className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" onClick={() => { setPaymentMode("mixed"); onClose(); }}>
          {t("ui.apply.mixed.payment")}
        </button>} onClose={onClose} size="md" title={t("ui.mixed.payment")}>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="mixed-payment-amounts">
          <Field label={t("ui.cash.amount")}>
            <div className="flex gap-2" data-mixed-method="cash">
              <PosNumberInput className="field-input min-w-0 flex-1" data-testid="mixed-amount-cash" value={cashAmount} onValueChange={setCashAmount}/>
              <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("cash")}/>
            </div>
          </Field>
          <Field label={t("ui.qr.amount")}>
            <div className="flex gap-2" data-mixed-method="qr">
              <PosNumberInput className="field-input min-w-0 flex-1" data-testid="mixed-amount-qr" value={qrAmount} onValueChange={setQrAmount}/>
              <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("qr")}/>
            </div>
          </Field>
          <Field label={t("ui.card.amount")}>
            <div className="flex gap-2" data-mixed-method="card">
              <PosNumberInput className="field-input min-w-0 flex-1" data-testid="mixed-amount-card" value={cardAmount} onValueChange={setCardAmount}/>
              <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("card")}/>
            </div>
          </Field>
          <Field label={t("ui.transfer.amount")}>
            <div className="flex gap-2" data-mixed-method="transfer">
              <PosNumberInput className="field-input min-w-0 flex-1" data-testid="mixed-amount-transfer" value={transferAmount} onValueChange={setTransferAmount}/>
              <ExactPaymentButton disabled={exactDisabled} onClick={() => onExact("transfer")}/>
            </div>
          </Field>
        </div>
        <div className={cn("mt-4 rounded-md border p-3 text-sm font-semibold", valid ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning")}>
          {fillPosCopy(t("ui.paid.total"), { paid: formatLak(paid), total: formatLak(totalAmount) })}
        </div>
      </PosSmallModal>);
}
function SaleCompletedModal({ onClose, onNewSale, onPrint, onView, printMode, receipt }: {
    onClose: () => void;
    onNewSale: () => void;
    onPrint: () => void;
    onView: () => void;
    printMode: ReceiptPrintMode;
    receipt: ReceiptSnapshot;
}) {
    return (<PosSmallModal closeOnBackdrop={false} closeOnEscape={false} dataPrintMode={printMode} description={t("ui.do.you.want.to.print.receipt")} onClose={onClose} size="sm" title={t("ui.payment.completed")}>
        <dl className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm">
          <InfoLine label={t("ui.bill.number")} value={receipt.saleNo}/>
          <InfoLine label={t("ui.total")} value={`${formatLak(receipt.totalAmount)} LAK`}/>
          <InfoLine label={t("ui.payment.method")} value={receipt.paymentMode.toUpperCase()}/>
          <InfoLine label={t("ui.cashier")} value={receipt.cashierName}/>
          <InfoLine label={t("ui.date.time")} value={formatReceiptDateTime(receipt.createdAt)}/>
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
      </PosSmallModal>);
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
    const title = action === "refund" ? t("ui.manager.approval.refund") : t("ui.manager.approval.void");
    return (<PosModal title={title} onClose={onClose}>
      <div className="grid gap-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-semibold">{sale.saleNo}</p>
              <p className="text-xs text-muted-foreground">{sale.customerName || t("ui.guest")} · {formatReceiptDateTime(sale.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t("ui.total")}</p>
              <p className="font-semibold">{formatLak(sale.totalAmount)} LAK</p>
            </div>
          </div>
        </div>
        <label className="grid gap-2 text-sm font-semibold">
          {t("ui.reason")}
          <textarea className="field-input min-h-24 resize-y" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder={action === "refund" ? t("ui.refund.reason") : t("ui.void.reason")}/>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t("ui.manager.owner.pin")}
          <input className="field-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => onPinChange(event.target.value)} placeholder={t("ui.enter.manager.pin")}/>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>
            {t("ui.cancel")}
          </button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onSubmit}>
            {action === "refund" ? t("ui.approve.refund") : t("ui.approve.void")}
          </button>
        </div>
      </div>
    </PosModal>);
}
function RecentSalesModal({ currentRole, customEnd, customStart, error, filter, hasMore, loading, onBack, onClose, onCustomEnd, onCustomStart, onDuplicate, onExchange, onFilter, onLoadMore, onRefund, onReprint, onRetry, onSearch, onViewReceipt, onVoid, sales, search }: {
    currentRole: string;
    customEnd: string;
    customStart: string;
    error: string | null;
    filter: "today" | "yesterday" | "week" | "month" | "custom";
    hasMore: boolean;
    loading: boolean;
    onBack?: () => void;
    onClose: () => void;
    onCustomEnd: (value: string) => void;
    onCustomStart: (value: string) => void;
    onDuplicate: (sale: DemoSaleRecord) => void;
    onExchange: (sale: DemoSaleRecord) => void;
    onFilter: (filter: "today" | "yesterday" | "week" | "month" | "custom") => void;
    onLoadMore: () => void;
    onRefund: (sale: DemoSaleRecord) => void;
    onReprint: (sale: DemoSaleRecord) => void;
    onRetry: () => void;
    onSearch: (value: string) => void;
    onViewReceipt: (sale: DemoSaleRecord) => void;
    onVoid: (sale: DemoSaleRecord) => void;
    sales: DemoSaleRecord[];
    search: string;
}) {
    const canRefundSale = canUseStoreAction(currentRole, STORE_ACTIONS.SALE_REFUND)
      && canUseStoreAction(currentRole, STORE_ACTIONS.PAYMENT_REFUND);
    const canVoidSale = canUseStoreAction(currentRole, STORE_ACTIONS.SALE_VOID);
    const canRequestManagerApproval = resolveStoreUiRole(currentRole) === STORE_ROLES.CASHIER;
    const filterOptions: Array<{ label: string; value: "today" | "yesterday" | "week" | "month" | "custom" }> = [
        { label: t("ui.today"), value: "today" },
        { label: t("ui.yesterday"), value: "yesterday" },
        { label: t("ui.this.week"), value: "week" },
        { label: t("ui.this.month"), value: "month" },
        { label: t("ui.custom"), value: "custom" },
    ];
    const emptyMessage = search.trim() ? t("ui.no.search.results") : t("ui.no.recent.sales");
    return (<PosWorkspaceModal onBack={onBack} onClose={onClose} title={t("ui.recent.sales")}>
        <p className="text-sm text-muted-foreground">{t("ui.search.or.select.sale")}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
            <input className="field-input pl-10" placeholder={t("ui.search.recent.sales")} value={search} onChange={(event) => onSearch(event.target.value)}/>
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
        {error ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            <span>{error}</span>
            <button className="h-8 rounded-md border border-danger/40 px-3 text-xs font-semibold" type="button" onClick={onRetry}>{t("ui.retry")}</button>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3">
          {loading && sales.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("ui.loading")}</div>
          ) : !error && sales.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : sales.map((sale) => {
            const statusVisual = resolveSaleStatusVisual(sale.status);
            const mutationBlocked = statusVisual.isVoided || statusVisual.tone === "refunded";
            const itemCount = sale.itemCount ?? (sale.items ?? []).length;
            const paymentLabel = (sale.paymentBreakdown?.length ?? 0) > 1
              ? sale.paymentBreakdown!.map((row) => `${row.method} ${formatLak(row.amountLak)}`).join(" · ")
              : sale.paymentMode.toUpperCase();
            return (
            <div className="overflow-hidden rounded-lg border border-border bg-background" key={sale.id ?? sale.saleNo}>
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
                    <InfoLine label={t("ui.customer")} value={sale.customerName || t("ui.guest")}/>
                    <InfoLine label={t("ui.cashier")} value={sale.cashierName}/>
                    <InfoLine label={t("ui.sale.items")} value={String(itemCount)}/>
                    <InfoLine label={t("ui.subtotal")} value={`${formatLak(sale.subtotal)} LAK`}/>
                    <InfoLine label={t("ui.discount")} value={`${formatLak(sale.discountAmount)} LAK`}/>
                    <InfoLine label={t("ui.total")} value={`${formatLak(sale.totalAmount)} LAK`} muted={statusVisual.isVoided} strike={statusVisual.isVoided}/>
                    <InfoLine label={t("ui.payment")} value={paymentLabel} muted={statusVisual.isVoided}/>
                  </div>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-semibold text-foreground">{t("ui.sale.timeline")}</summary>
                    <div className="mt-2 grid gap-1">
                      {(sale.timeline ?? []).map((event, index) => (<div className="flex justify-between gap-3" key={`${sale.saleNo}-timeline-${index}`}>
                          <span>{event.label} by {event.user}</span>
                          <span>{formatReceiptDateTime(event.at)}</span>
                        </div>))}
                    </div>
                  </details>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:max-w-[360px]">
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onViewReceipt(sale)}>{t("ui.view.receipt")}</button>
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onReprint(sale)}>{t("ui.reprint.receipt")}</button>
                  {!mutationBlocked && (canRefundSale || canRequestManagerApproval) ? (
                    <button className="h-9 rounded-md border border-warning/50 px-2 font-semibold text-warning" type="button" onClick={() => onRefund(sale)}>{t("ui.return.refund")}</button>
                  ) : null}
                  {!mutationBlocked && (canRefundSale || canRequestManagerApproval) ? (
                    <button className="h-9 rounded-md border border-warning/50 px-2 font-semibold text-warning" type="button" onClick={() => onExchange(sale)}>{t("ui.exchange")}</button>
                  ) : null}
                  {!mutationBlocked && (canVoidSale || canRequestManagerApproval) ? (
                    <button className="h-9 rounded-md border border-danger/50 px-2 font-semibold text-danger" type="button" onClick={() => onVoid(sale)}>{t("ui.void.sale")}</button>
                  ) : null}
                  <button className="h-9 rounded-md border border-border px-2 font-semibold" type="button" onClick={() => onDuplicate(sale)}>{t("ui.duplicate")}</button>
                </div>
                </div>
              </div>
            </div>
            );
          })}
          {hasMore ? (
            <button
              className="h-11 rounded-md border border-border text-sm font-semibold disabled:opacity-60"
              disabled={loading}
              type="button"
              onClick={onLoadMore}
            >
              {loading ? t("ui.loading") : t("ui.load.more")}
            </button>
          ) : null}
        </div>
    </PosWorkspaceModal>);
}
function ReceiptPreview({ autoPrint = false, branchName, cashierName, cartItems, changeAmount, createdAt, customerName, discountTotal, isFirstPrint = false, onBack, onClose, onReprint, paidAmount, paymentBreakdown, paymentMode, receiptNo, receiptSettings, saleId, saleNo, showTaxOnReceipt, subtotal, taxAmount, totalAmount, }: {
    autoPrint?: boolean;
    branchName: string;
    cashierName: string;
    cartItems: PosCartItem[];
    changeAmount: number;
    createdAt: string;
    customerName: string;
    discountTotal: number;
    /** STEP 8: true for initial print after checkout — skips reprint audit. */
    isFirstPrint?: boolean;
    onBack?: () => void;
    onClose: () => void;
    onReprint: () => boolean;
    paidAmount: number;
    paymentBreakdown?: Array<{ amountLak: number; method: string }>;
    paymentMode: PaymentMode;
    receiptNo: string;
    receiptSettings: PosReceiptSettings;
    /** STEP 8: persisted sale id — enables canonical audited reprint. */
    saleId?: string;
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
            /* STEP 8: Auto-print audit is handled by the caller (More menu calls
             * reprintSaleReceipt before opening; Recent Sales likewise). First-print
             * after checkout is audited by the sale creation itself. So auto-print
             * only checks permission, then delegates to window.print as transport. */
            if (onReprint()) {
                window.print();
            }
        }, 250);
        return () => window.clearTimeout(timeout);
    }, [autoPrint, autoPrintStarted, onReprint]);
    const receiptTitle = receiptSettings.receiptHeader || receiptSettings.companyName;
    const receiptFooter = receiptSettings.receiptFooter || t("ui.thank.you");
    return (<PosWorkspaceModal headerClassName="print:hidden" onBack={onBack} onClose={onClose} title={t("ui.receipt.preview")}>
        <div className="rounded-md border border-border bg-background p-5 font-mono text-sm">
          <div className="text-center">
            <div className="text-lg font-bold">{receiptTitle}</div>
            {receiptSettings.profileAddress ? <div>{receiptSettings.profileAddress}</div> : null}
            {receiptSettings.profilePhone ? <div>{receiptSettings.profilePhone}</div> : null}
            {receiptSettings.profileEmail ? <div>{receiptSettings.profileEmail}</div> : null}
            {receiptSettings.taxNumber ? <div>{t("ui.tax.label")} {receiptSettings.taxNumber}</div> : null}
            <div>{branchName}</div>
            <div>{t("ui.bill.label")} {saleNo}</div>
            <div>{t("ui.receipt.label")} {receiptNo}</div>
            <div>{t("ui.customer.label")} {customerName}</div>
            <div>{t("ui.cashier")}{cashierName}</div>
            <div>{formatReceiptDateTime(createdAt)}</div>
          </div>
          <div className="my-4 border-t border-dashed border-border"/>
          <div className="flex flex-col gap-3">
            {cartItems.length === 0 ? (<div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{t("ui.no.receipt.items")}</div>) : cartItems.map((item, index) => (<div key={cartLineKey(item, index)}>
                <div className="flex justify-between gap-3">
                  <span>{localizedProductName(item)}{item.unitName ? ` — ${item.unitName}` : ""}</span>
                  <span>{formatLak(item.priceLak * item.quantity)}</span>
                </div>
                <div className="text-muted-foreground">{item.quantity} x {formatLak(item.priceLak)} LAK{item.unitName ? ` / ${item.unitName}` : ""}</div>
              </div>))}
          </div>
          <div className="my-4 border-t border-dashed border-border"/>
          <ReceiptRow label="Subtotal" value={subtotal}/>
          <ReceiptRow label="Discount" value={-discountTotal}/>
          {showTaxOnReceipt ? <ReceiptRow label="Tax" value={taxAmount}/> : null}
          <ReceiptRow label="Total" value={totalAmount} strong/>
          {(paymentBreakdown?.length ?? 0) > 1
            ? paymentBreakdown!.map((row) => (
                <ReceiptRow key={`${row.method}-${row.amountLak}`} label={`Paid ${String(row.method).toUpperCase()}`} value={row.amountLak}/>
              ))
            : <ReceiptRow label={`Paid ${paymentMode.toUpperCase()}`} value={paidAmount}/>}
          <ReceiptRow label="Change" value={changeAmount}/>
          <div className="my-4 border-t border-dashed border-border"/>
          <div className="text-center">{receiptFooter}</div>
        </div>
        <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground print:hidden" type="button" onClick={async () => {
            if (!onReprint()) return;
            /* ──────────────────────────────────────────────────────────────
             * STEP 8 — Canonical audited reprint from ReceiptPreview button.
             * For non-first-print scenarios the manual "Print Receipt" button
             * calls reprintSaleReceipt(saleId) so every reprint is logged in
             * the audit trail. First-print after checkout is excluded because
             * the sale-creation transaction is itself audited.
             * window.print() is used purely as browser transport.
             * ────────────────────────────────────────────────────────────── */
            if (saleId && !isFirstPrint) {
                try { await reprintSaleReceipt(saleId); } catch { /* audit failure must not block print transport */ }
            }
            window.print();
        }}>
          <Printer aria-hidden="true"/>
          {t("ui.print.receipt")}
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
        productImageUrl: product.productImageUrl ?? product.imageUrl ?? undefined,
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
            pricingNote: t("ui.student.price"),
        };
    }
    if (customer.discountPercent && customer.discountPercent > 0) {
        return {
            ...product,
            priceLak: Math.round(retailPriceLak * (1 - customer.discountPercent / 100)),
            quantity: 1,
            retailPriceLak,
            pricingNote: fillPosCopy(t("ui.member.discount.pct"), { pct: customer.discountPercent }),
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
function stockWarningLabel(tone: "orange" | "yellow" | "red") {
    if (tone === "red") return t("ui.expired");
    if (tone === "yellow") return t("ui.near.expiry");
    return t("ui.low.stock");
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
