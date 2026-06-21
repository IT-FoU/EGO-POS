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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    runDemoStorageMigrations();
    const savedTheme = readStringFromStorage(DemoStorageKeys.theme) as Theme | null;
    const nextTheme = savedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStringToStorage(DemoStorageKeys.theme, theme);
  }, [theme]);

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
