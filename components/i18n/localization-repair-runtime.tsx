"use client";

import { useEffect } from "react";
import { DEFAULT_LOCALE } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants";
import { LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";

const textOriginals = new WeakMap<Text, string>();
const textAppliedValues = new WeakMap<Text, string>();
const attrOriginalPrefix = "data-ego-original-";
const attrAppliedPrefix = "data-ego-applied-";
const translatedAttrs = ["aria-label", "placeholder", "title", "alt"];

export function LocalizationRepairRuntime() {
  useEffect(() => {
    let rafId = 0;

    function getLocale(): SupportedLocale {
      return readClientLocale(document.documentElement.dataset.locale ?? DEFAULT_LOCALE);
    }

    function translateTextNode(node: Text, _locale: SupportedLocale) {
      const current = node.nodeValue ?? "";
      // React reuses text nodes across renders. If the node no longer holds
      // the value this runtime last wrote, the change came from React and the
      // stale snapshot must be discarded, otherwise live state (cart totals,
      // clocks, counters) would be reverted to first-seen SSR text.
      if (textAppliedValues.get(node) !== current) {
        textOriginals.set(node, current);
      }
      const original = textOriginals.get(node) ?? current;
      const next = original;
      if (next !== current) {
        node.nodeValue = next;
      }
      textAppliedValues.set(node, next);
    }

    function translateElementAttrs(element: Element, _locale: SupportedLocale) {
      for (const attr of translatedAttrs) {
        const originalAttr = `${attrOriginalPrefix}${attr}`;
        const appliedAttr = `${attrAppliedPrefix}${attr}`;
        const current = element.getAttribute(attr);
        if (!current) {
          continue;
        }
        if (element.getAttribute(appliedAttr) !== current) {
          element.setAttribute(originalAttr, current);
        }
        const original = element.getAttribute(originalAttr) ?? current;
        const next = original;
        if (next !== current) {
          element.setAttribute(attr, next);
        }
        element.setAttribute(appliedAttr, next);
      }
    }

    function translateRoot(root: ParentNode) {
      const locale = getLocale();

      if (root instanceof Element) {
        translateElementAttrs(root, locale);
      }

      const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (elementWalker.nextNode()) {
        const element = elementWalker.currentNode as Element;
        if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) {
          continue;
        }
        translateElementAttrs(element, locale);
      }

      const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      while (textWalker.nextNode()) {
        translateTextNode(textWalker.currentNode as Text, locale);
      }
    }

    function scheduleTranslate(root: ParentNode = document.body) {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => translateRoot(root));
    }

    scheduleTranslate();

    const observer = new MutationObserver((mutations) => {
      const localeAttributeChanged = mutations.some(
        (mutation) => mutation.type === "attributes" && mutation.target === document.documentElement,
      );
      if (localeAttributeChanged) {
        scheduleTranslate();
        return;
      }

      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleTranslate(node.parentNode ?? document.body);
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributeFilter: ["data-locale", "lang"],
      attributes: true,
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("focus", () => scheduleTranslate());
    window.addEventListener(LOCALE_CHANGE_EVENT, () => scheduleTranslate());

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("focus", () => scheduleTranslate());
      window.removeEventListener(LOCALE_CHANGE_EVENT, () => scheduleTranslate());
    };
  }, []);

  return null;
}
