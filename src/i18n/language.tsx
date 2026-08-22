import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { setLocale as setParaglideLocale } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";

const STORAGE_KEY = "app.locale";

type LanguageContextValue = {
  language: Locale;
  setLanguage: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh-cn") {
    return stored;
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    setParaglideLocale(language, { reload: false });
  }, [language]);

  useEffect(() => {
    const initial = getInitialLocale();
    if (initial !== "en") {
      setParaglideLocale(initial, { reload: false });
    }
  }, []);

  const setLanguage = useCallback((locale: Locale) => {
    setLanguageState(locale);
    window.localStorage.setItem(STORAGE_KEY, locale);
    setParaglideLocale(locale, { reload: false });
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === null) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
