import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { setLocale as setParaglideLocale } from "@/paraglide/runtime.js";
import type { Locale } from "@/paraglide/runtime.js";
import { StorageKey } from "@/shared/constants/enums";

const STORAGE_KEY = StorageKey.Locale;

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
  const [language, setLanguageState] = useState<Locale>(() => {
    const initial = getInitialLocale();
    // Message functions run during the first child render. An effect is too
    // late, and receiving this same locale over IPC will not trigger a render.
    setParaglideLocale(initial, { reload: false });
    return initial;
  });
  const didChooseLanguage = useRef(false);

  const applyLanguage = useCallback((locale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    setParaglideLocale(locale, { reload: false });
    setLanguageState(locale);
  }, []);

  useEffect(() => {
    let disposed = false;
    let receivedLocale = false;
    const initial = getInitialLocale();
    const unsubscribe = window.scrcpyPlatform.onAppLocale((locale) => {
      if (!disposed) {
        receivedLocale = true;
        applyLanguage(locale);
      }
    });

    void window.scrcpyPlatform.getAppLocale().then((locale) => {
      if (disposed || receivedLocale || didChooseLanguage.current) {
        return;
      }
      if (locale === null) {
        // One-time migration from the legacy per-renderer localStorage value.
        return window.scrcpyPlatform.setAppLocale(initial);
      }
      applyLanguage(locale);
    }).catch((error: unknown) => {
      console.error("Failed to load the application locale", error);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [applyLanguage]);

  const setLanguage = useCallback((locale: Locale) => {
    didChooseLanguage.current = true;
    // Update this renderer first; IPC then persists and broadcasts to every
    // window, including windows with a different renderer/storage context.
    applyLanguage(locale);
    void window.scrcpyPlatform.setAppLocale(locale).catch((error: unknown) => {
      console.error("Failed to save the application locale", error);
    });
  }, [applyLanguage]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {/* Translation calls are not all React context consumers. Changing this
          key remounts the visible app tree so every direct message call is
          re-evaluated immediately. */}
      <Fragment key={language}>{children}</Fragment>
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
