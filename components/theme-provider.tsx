"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, runDemoStorageMigrations, writeStringToStorage } from "@/lib/demo/storage";

type Theme = "dark" | "light";

type ThemeContextValue = {
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function parseStoredTheme(value: string | null): Theme {
  return value === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    runDemoStorageMigrations();
    const nextTheme = parseStoredTheme(readStringFromStorage(DemoStorageKeys.theme));
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStringToStorage(DemoStorageKeys.theme, theme);
  }, [hydrated, theme]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== DemoStorageKeys.theme || event.newValue == null) {
        return;
      }

      setTheme(parseStoredTheme(event.newValue));
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({
      setTheme,
      theme,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
