import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeDomain, normalizeAddress, GENERIC_DOMAINS } from "./normalize";
import { generateDedupeKey } from "./dedupe";
import { calculateLeadScore } from "./scoring";
import { Budget, BudgetExceeded } from "./budget";
import type { LeadCandidate } from "./types";

describe("normalize", () => {
  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhone("(614) 555-0101")).toBe("+16145550101");
    expect(normalizePhone("1-614-555-0101")).toBe("+16145550101");
    expect(normalizePhone("123")).toBeUndefined();
  });

  it("normalizes domains and strips www", () => {
    expect(normalizeDomain("https://www.Foo.com/a?b")).toBe("foo.com");
    expect(normalizeDomain("nope")).toBeUndefined();
  });

  it("flags known generic domains", () => {
    expect(GENERIC_DOMAINS.has("facebook.com")).toBe(true);
    expect(GENERIC_DOMAINS.has("acme-clinic.com")).toBe(false);
  });

  it("collapses whitespace in addresses", () => {
    expect(normalizeAddress("100  N   High St")).toBe("100 N High St");
    expect(normalizeAddress(undefined)).toBeUndefined();
  });
});

describe("dedupe key generation", () => {
  it("prefers a non-generic website domain over everything else", () => {
    const key = generateDedupeKey({
      name: "Glow Aesthetics",
      website: "https://glowaesthetics.example.com",
      phone: "+16145550101",
    });
    expect(key).toBe("dom:glowaesthetics.example.com");
  });

  it("falls back to phone when there is no usable domain", () => {
    const key = generateDedupeKey({ name: "Columbus Skin Lab", phone: "614-555-0102" });
    expect(key).toBe("ph:+16145550102");
  });

  it("falls back to npi when present and no website/phone", () => {
    const key = generateDedupeKey({ name: "Dr. Jane Doe", npi: "1234567890" });
    expect(key).toBe("npi:1234567890");
  });

  it("is deterministic for identical inputs", () => {
    const lead: Partial<LeadCandidate> = { name: "Buckeye Med Clinic", city: "Columbus", state: "OH", zip: "43215" };
    expect(generateDedupeKey(lead)).toBe(generateDedupeKey({ ...lead }));
  });
});

describe("lead scoring", () => {
  it("penalizes uncontactable, generically-named leads", () => {
    const { score, reasons } = calculateLeadScore({ name: "Unnamed", niche: "med spa", signals: [] });
    expect(score).toBeLessThanOrEqual(10);
    expect(reasons.some((r) => r.includes("Uncontactable"))).toBe(true);
  });

  it("rewards a fully contactable lead with a named decision-maker", () => {
    const { score } = calculateLeadScore({
      name: "Glow Aesthetics",
      niche: "med spa",
      phone: "+16145550101",
      email: "info@glowaesthetics.com",
      website: "https://glowaesthetics.com",
      decisionMaker: { name: "Dr. Sarah Vance", title: "Medical Director", confidence: "HIGH" },
      signals: [{ type: "ad_active", value: true }],
    });
    expect(score).toBeGreaterThan(80);
  });

  it("clamps scores to the 0-100 range", () => {
    const { score } = calculateLeadScore({ name: "", niche: "x", signals: [] });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("budget", () => {
  it("is strict by default: an undeclared cost unit has zero allowance", () => {
    const b = new Budget({}, true);
    expect(() => b.spend("apify.usd", 1)).toThrow(BudgetExceeded);
  });

  it("allows spend up to the declared cap and hard-stops past it", () => {
    const b = new Budget({ "apify.usd": 5 });
    b.spend("apify.usd", 5);
    expect(b.remaining("apify.usd")).toBe(0);
    expect(() => b.spend("apify.usd", 0.01)).toThrow(BudgetExceeded);
  });

  it("snapshot reflects cumulative spend per unit", () => {
    const b = new Budget({ "moltsets.tokens": 100 });
    b.spend("moltsets.tokens", 30);
    b.spend("moltsets.tokens", 20);
    expect(b.snapshot()).toEqual({ "moltsets.tokens": 50 });
  });
});
