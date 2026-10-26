/**
 * The currencies PlusOne plans in: where our hosts plan and where their families
 * live, from India and the Gulf to North America, Europe and the wider diaspora.
 */

type CurrencyInfo = {
  /** A locale that writes amounts the way people there expect. */
  locale: string;
  /** Where a new event's budget starts, before the host sets their own. */
  startingBudget: number;
};

const SUPPORTED: Record<string, CurrencyInfo> = {
  INR: { locale: "en-IN", startingBudget: 2_500_000 },
  USD: { locale: "en-US", startingBudget: 35_000 },
  CAD: { locale: "en-CA", startingBudget: 45_000 },
  GBP: { locale: "en-GB", startingBudget: 28_000 },
  EUR: { locale: "en-IE", startingBudget: 30_000 },
  AUD: { locale: "en-AU", startingBudget: 45_000 },
  NZD: { locale: "en-NZ", startingBudget: 45_000 },
  AED: { locale: "en-AE", startingBudget: 150_000 },
  SAR: { locale: "en-SA", startingBudget: 150_000 },
  QAR: { locale: "en-QA", startingBudget: 150_000 },
  KWD: { locale: "en-KW", startingBudget: 12_000 },
  OMR: { locale: "en-OM", startingBudget: 15_000 },
  BHD: { locale: "en-BH", startingBudget: 15_000 },
  SGD: { locale: "en-SG", startingBudget: 50_000 },
  MYR: { locale: "en-MY", startingBudget: 100_000 },
  HKD: { locale: "en-HK", startingBudget: 300_000 },
  // South Asian currencies are grouped in lakhs and crores, as in India.
  PKR: { locale: "en-IN", startingBudget: 4_000_000 },
  NPR: { locale: "en-IN", startingBudget: 3_000_000 },
  LKR: { locale: "en-IN", startingBudget: 6_000_000 },
  BDT: { locale: "en-IN", startingBudget: 2_500_000 },
  MUR: { locale: "en-MU", startingBudget: 900_000 },
  FJD: { locale: "en-FJ", startingBudget: 50_000 },
  ZAR: { locale: "en-ZA", startingBudget: 300_000 },
  KES: { locale: "en-KE", startingBudget: 2_500_000 },
  TTD: { locale: "en-TT", startingBudget: 180_000 },
  GYD: { locale: "en-GY", startingBudget: 5_000_000 },
  CHF: { locale: "de-CH", startingBudget: 35_000 },
};

/** For currency dropdowns, roughly by how many of our hosts use each. */
export const CURRENCIES: string[] = Object.keys(SUPPORTED);

/** The locale to format an amount in, or undefined to leave it to the browser. */
export function moneyLocale(currency: string): string | undefined {
  return SUPPORTED[currency]?.locale;
}

/** A sensible first total for an event budget in each currency. */
export const DEFAULT_EVENT_BUDGET: Record<string, number> = Object.fromEntries(
  Object.entries(SUPPORTED).map(([code, info]) => [code, info.startingBudget]),
);

/** Region codes (ISO 3166-1) by the currency they spend, for the currencies above. */
const REGIONS_BY_CURRENCY: Record<string, string[]> = {
  INR: ["IN", "BT"],
  USD: ["US", "PR", "GU", "VI", "AS", "MP", "UM", "EC", "SV", "PA", "TL", "MH", "FM", "PW", "BQ", "TC", "VG"],
  CAD: ["CA"],
  GBP: ["GB", "IM", "JE", "GG"],
  EUR: [
    // the euro area, then the places that use the euro without being members, and overseas regions
    "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
    "AD", "ME", "MC", "SM", "VA", "XK", "AX", "BL", "GF", "GP", "MF", "MQ", "PM", "RE", "YT",
  ],
  AUD: ["AU", "CX", "CC", "NF", "KI", "NR", "TV"],
  NZD: ["NZ", "CK", "NU", "PN", "TK"],
  AED: ["AE"],
  SAR: ["SA"],
  QAR: ["QA"],
  KWD: ["KW"],
  OMR: ["OM"],
  BHD: ["BH"],
  SGD: ["SG"],
  MYR: ["MY"],
  HKD: ["HK"],
  PKR: ["PK"],
  NPR: ["NP"],
  LKR: ["LK"],
  BDT: ["BD"],
  MUR: ["MU"],
  FJD: ["FJ"],
  ZAR: ["ZA", "LS", "NA"],
  KES: ["KE"],
  TTD: ["TT"],
  GYD: ["GY"],
  CHF: ["CH", "LI"],
};

/** Short names people type, from before the country was picked from a list. */
const NICKNAMES: Record<string, string> = {
  usa: "US", "united states of america": "US", america: "US", uk: "GB", "great britain": "GB", britain: "GB",
  england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", uae: "AE", dubai: "AE", "hong kong": "HK",
  ksa: "SA", holland: "NL", "trinidad and tobago": "TT", ceylon: "LK",
};

let byCountry: Map<string, string> | undefined;

/** Country names as the onboarding country picker shows them, and their codes, to currency. */
function countryTable(): Map<string, string> {
  if (byCountry) return byCountry;
  const table = new Map<string, string>();
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = undefined;
  }
  for (const [currency, regions] of Object.entries(REGIONS_BY_CURRENCY)) {
    for (const code of regions) {
      table.set(code.toLowerCase(), currency);
      const name = names?.of(code);
      if (name && name !== code) table.set(name.toLowerCase(), currency);
    }
  }
  for (const [nickname, code] of Object.entries(NICKNAMES)) {
    const currency = table.get(code.toLowerCase());
    if (currency) table.set(nickname, currency);
  }
  byCountry = table;
  return table;
}

/** The currency for a country, by its name (or its two-letter code); US dollars when unsure. */
export function currencyForCountry(country: string): string {
  const key = country.trim().toLowerCase();
  if (!key) return "USD";
  return countryTable().get(key) ?? "USD";
}
