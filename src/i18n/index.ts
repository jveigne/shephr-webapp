import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const LANG_STORAGE_KEY = "shephr.admin.lang";

export type AppLang = "fr" | "en";

function initialLang(): AppLang {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  return stored === "en" ? "en" : "fr";
}

/** Maps a backend language code ('FR' | 'EN') to an app language. */
export function mapBackendLang(code?: string | null): AppLang | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === "EN") return "en";
  if (c === "FR") return "fr";
  return null;
}

export function setLanguage(lng: AppLang) {
  i18n.changeLanguage(lng);
  localStorage.setItem(LANG_STORAGE_KEY, lng);
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLang(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
