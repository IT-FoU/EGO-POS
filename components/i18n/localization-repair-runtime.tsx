"use client";

import { useEffect } from "react";
import { translateToLao } from "@/lib/i18n/lao-ui-translations";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";

const textOriginals = new WeakMap<Text, string>();
const attrOriginalPrefix = "data-ego-original-";
const translatedAttrs = ["aria-label", "placeholder", "title", "alt"];

export function LocalizationRepairRuntime() {
  useEffect(() => {
    let rafId = 0;

    function getLocale() {
      const stored = readStringFromStorage(DemoStorageKeys.locale);
      if (stored === "lo" || stored === "en") {
        return stored;
      }
      return document.documentElement.dataset.locale === "en" ? "en" : "lo";
    }

    function translateTextNode(node: Text, locale: "lo" | "en") {
      const original = textOriginals.get(node) ?? node.nodeValue ?? "";
      if (!textOriginals.has(node)) {
        textOriginals.set(node, original);
      }
      node.nodeValue = locale === "lo" ? translateToLao(original) : original;
    }

    function translateElementAttrs(element: Element, locale: "lo" | "en") {
      for (const attr of translatedAttrs) {
        const originalAttr = `${attrOriginalPrefix}${attr}`;
        const current = element.getAttribute(attr);
        const storedOriginal = element.getAttribute(originalAttr);

        if (current && !storedOriginal) {
          element.setAttribute(originalAttr, current);
        }

        const original = storedOriginal ?? current;
        if (!original) {
          continue;
        }

        element.setAttribute(attr, locale === "lo" ? translateToLao(original) : original);
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

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("focus", () => scheduleTranslate());
    };
  }, []);

  return null;
}
