import { create } from "zustand";
import { TRANSLATIONS, type Locale, type Translations } from "./translations";

export type { Locale, Translations } from "./translations";

const LANGUAGE_KEY = "specwright.language";

interface LanguageState {
  language: Locale;
  setLanguage: (language: Locale) => void;
}

function readLanguage(): Locale {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  return stored === "en" || stored === "nl" ? stored : "nl";
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readLanguage(),
  setLanguage: (language) => {
    window.localStorage.setItem(LANGUAGE_KEY, language);
    set({ language });
  },
}));

export function useTranslations(): Translations {
  const language = useLanguageStore((state) => state.language);
  return TRANSLATIONS[language];
}
