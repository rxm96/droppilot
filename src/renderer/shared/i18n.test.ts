import { describe, expect, it } from "vitest";
import { translate, translations } from "./i18n";

const placeholders = (str: string) => [...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  const enKeys = Object.keys(translations.en);
  const deKeys = Object.keys(translations.de);

  it("has every English key in German", () => {
    expect(enKeys.filter((key) => !(key in translations.de))).toEqual([]);
  });

  it("has every German key in English", () => {
    expect(deKeys.filter((key) => !(key in translations.en))).toEqual([]);
  });

  it("uses the same placeholders in both languages", () => {
    const mismatched = enKeys
      .filter((key) => key in translations.de)
      .filter(
        (key) =>
          placeholders(translations.en[key]).join() !== placeholders(translations.de[key]).join(),
      );
    expect(mismatched).toEqual([]);
  });

  it("has no empty strings", () => {
    const empty = (["en", "de"] as const).flatMap((lang) =>
      Object.entries(translations[lang])
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => `${lang}:${key}`),
    );
    expect(empty).toEqual([]);
  });
});

describe("translate", () => {
  it("fills placeholders and falls back to the key", () => {
    expect(translate("en", "nav.dropsNeedYou", { count: 3 })).toBe("3 need you");
    expect(translate("de", "does.not.exist")).toBe("does.not.exist");
  });
});
