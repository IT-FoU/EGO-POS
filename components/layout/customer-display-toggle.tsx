"use client";

import { tPos } from "@/lib/i18n/pos-copy";
import { t } from "@/lib/i18n/ui";
import { fillPosCopy } from "@/lib/i18n/pos-copy";
import { useState } from "react";
import { Maximize2, Monitor, Settings2 } from "lucide-react";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import {
  discoverCustomerDisplayScreens,
  customerDisplayTargetBounds,
  openCustomerDisplayPopup,
  placeCustomerDisplayWindow,
  requestCustomerDisplayFullscreen,
  screenDisplayLabel,
  screenIsCurrent,
  writeCustomerDisplayScreenPreference,
  type CustomerDisplayScreen,
} from "@/features/pos/customer-display-window";

let customerDisplayWindow: Window | null = null;
let configuredCustomerDisplayScreen: CustomerDisplayScreen | null = null;

export function CustomerDisplayToggle() {
  const locale = useAppLocale();
  const [hint, setHint] = useState<string | null>(null);
  const [hintKey, setHintKey] = useState<string | null>(null);
  const [hintVars, setHintVars] = useState<Record<string, string | number>>({});
  const [screenOptions, setScreenOptions] = useState<CustomerDisplayScreen[]>([]);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [canRetrySetup, setCanRetrySetup] = useState(false);

  function clearHint() {
    setHint(null);
    setHintKey(null);
    setHintVars({});
  }

  function setPlainHint(value: string | null) {
    setHint(value);
    setHintKey(null);
    setHintVars({});
  }

  function setCopyHint(key: string, vars: Record<string, string | number> = {}) {
    clearHint();
    setHintKey(key);
    setHintVars(vars);
  }

  function openOrReuse() {
    if (customerDisplayWindow && !customerDisplayWindow.closed) {
      return customerDisplayWindow;
    }
    const preferredBounds = configuredCustomerDisplayScreen
      ? customerDisplayTargetBounds(configuredCustomerDisplayScreen)
      : null;
    const popup = openCustomerDisplayPopup(window, preferredBounds);
    customerDisplayWindow = popup;
    if (!popup) {
      setPlainHint(t("ui.allow.window.management.to.open.customer.di"));
      setCanRetrySetup(true);
      return null;
    }
    return popup;
  }

  function openCustomerDisplay() {
    if (customerDisplayWindow && !customerDisplayWindow.closed) {
      customerDisplayWindow.close();
      customerDisplayWindow = null;
      clearHint();
      return;
    }
    const popup = openOrReuse();
    if (!popup) {
      return;
    }

    void placeCustomerDisplayWindow(popup).then((result) => {
      setCanRetrySetup(["denied", "unsupported", "disconnected", "setup_required"].includes(result));
      const messageKey = placementMessage(result);
      if (messageKey) setCopyHint(messageKey);
      else clearHint();
    });
  }

  function placementMessage(result: Awaited<ReturnType<typeof placeCustomerDisplayWindow>>) {
    if (result === "denied") return "ui.window.management.permission.denied";
    if (result === "unsupported") return "ui.window.management.unsupported";
    if (result === "single") return "ui.only.one.display.available";
    if (result === "disconnected" || result === "setup_required") {
      return "ui.display.disconnected.setup.required";
    }
    return null;
  }

  async function setupCustomerDisplayScreen() {
    setIsSettingUp(true);
    setScreenOptions([]);
    clearHint();
    setCanRetrySetup(false);
    const discovery = await discoverCustomerDisplayScreens();
    setIsSettingUp(false);
    if (discovery.status === "unsupported") {
      setCopyHint("ui.window.management.unsupported");
      setCanRetrySetup(true);
      return;
    }
    if (discovery.status === "denied") {
      setCopyHint("ui.window.management.permission.denied");
      setCanRetrySetup(true);
      return;
    }
    if (discovery.details.screens.length < 2) {
      setCopyHint("ui.only.one.display.available");
      return;
    }

    const candidates = discovery.details.screens.filter(
      (screen) => !screenIsCurrent(screen, discovery.details.currentScreen),
    );
    if (candidates.length === 1) {
      configuredCustomerDisplayScreen = candidates[0]!;
      writeCustomerDisplayScreenPreference(candidates[0]!);
      setCopyHint("ui.customer.display.screen.auto.selected", {
          display: screenDisplayLabel(candidates[0]!, "Display 2"),
      });
      return;
    }
    setScreenOptions(candidates);
  }

  function selectCustomerDisplayScreen(screen: CustomerDisplayScreen) {
    configuredCustomerDisplayScreen = screen;
    writeCustomerDisplayScreenPreference(screen);
    setScreenOptions([]);
    setCopyHint("ui.customer.display.screen.selected", {
        display: screenDisplayLabel(screen),
    });
  }

  async function openCustomerDisplayFullscreen() {
    const popup = openOrReuse();
    if (!popup) {
      return;
    }

    const placement = await placeCustomerDisplayWindow(popup);
    const fullscreen = await requestCustomerDisplayFullscreen(popup);
    if (fullscreen === "entered") {
      clearHint();
      setCanRetrySetup(false);
      return;
    }
    if (placement === "denied") setCopyHint("ui.window.management.permission.denied");
    else setPlainHint(t("ui.customer.display.fullscreen.denied"));
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        aria-label={tPos("ui.open.customer.display")}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        onClick={openCustomerDisplay}
        type="button"
      >
        <Monitor className="size-4" aria-hidden="true" />
      </button>
      <button
        aria-label={tPos("ui.set.customer.display.screen", locale)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        data-cd-screen-setup="true"
        disabled={isSettingUp}
        onClick={() => void setupCustomerDisplayScreen()}
        title={tPos("ui.set.customer.display.screen", locale)}
        type="button"
      >
        <Settings2 className="size-4" aria-hidden="true" />
      </button>
      <button
        aria-label={tPos("ui.fullscreen.customer.display")}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        onClick={() => void openCustomerDisplayFullscreen()}
        type="button"
      >
        <Maximize2 className="size-4" aria-hidden="true" />
      </button>
      {hint || hintKey ? (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground shadow-sm">
          {hintKey ? fillPosCopy(tPos(hintKey, locale), hintVars) : hint}
          {canRetrySetup ? (
            <button
              className="mt-2 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-background"
              onClick={() => void setupCustomerDisplayScreen()}
              type="button"
            >
              {tPos("ui.try.again", locale)}
            </button>
          ) : null}
        </div>
      ) : null}
      {screenOptions.length > 0 ? (
        <div
          className="absolute right-0 top-11 z-50 w-80 rounded-md border border-border bg-card p-2 shadow-lg"
          data-cd-screen-selector="open"
        >
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            {tPos("ui.select.display", locale)}
          </div>
          <div className="grid gap-1">
            {screenOptions.map((screen, index) => (
              <button
                className="rounded-md border border-transparent px-3 py-2 text-left text-sm hover:border-primary hover:bg-background"
                data-cd-screen-option="true"
                key={`${screen.label ?? "display"}-${screen.availLeft}-${screen.availTop}-${index}`}
                onClick={() => selectCustomerDisplayScreen(screen)}
                type="button"
              >
                <span className="block font-semibold">{screenDisplayLabel(screen, `Display ${index + 2}`)}</span>
                <span className="block text-xs text-muted-foreground">
                  {screen.availWidth}×{screen.availHeight} · ({screen.availLeft}, {screen.availTop})
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
