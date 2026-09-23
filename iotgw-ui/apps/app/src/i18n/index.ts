import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import all translation files
import translationEN from "./locales/en.json";
import translationES from "./locales/es.json";

// Resources object with translations
const resources = {
  en: {
    translation: translationEN,
  },
  es: {
    translation: translationES,
  },
};

void i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18n
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    // English by default. The browser language is NOT consulted — only an
    // explicit choice in the language switcher (persisted below) selects
    // another language. The key was renamed from i18next's default
    // `i18nextLng` so a language auto-detected from the browser in the past
    // no longer sticks.
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "iotgw-ui-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
