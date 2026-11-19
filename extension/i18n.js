export const catalogPaths = {
  en: "_locales/en/messages.json",
  "zh-CN": "_locales/zh_CN/messages.json"
};

export function languageChoice(value) {
  return typeof value === "string" && Object.hasOwn(catalogPaths, value) ? value : "auto";
}

export function resolveLanguage(choice, uiLocale) {
  const manual = languageChoice(choice);
  if (manual !== "auto") return manual;
  try {
    const locale = new Intl.Locale(uiLocale.replaceAll("_", "-")).maximize();
    if (locale.language === "zh" && locale.script === "Hans") return "zh-CN";
  } catch { /* Chrome's default is English when the locale is unknown. */ }
  return "en";
}

export function formatMessage(catalog, key, values = {}) {
  const template = catalog[key]?.message ?? key;
  return template.replace(/\{([a-z_]+)\}/g, (token, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : token);
}
