/**
 * RATES SERVICE
 *
 * Handles fetching exchange rates from the API and caching them
 * locally in SQLite so the app works offline too.
 *
 * Strategy:
 *  - On first open, fetch live rates from the API
 *  - Cache the result in SQLite with a timestamp
 *  - On next open, if cache is < 1 hour old → use cache (no network)
 *  - If cache is stale or missing → fetch fresh rates
 *  - If fetch fails and cache exists → use stale cache (graceful offline)
 *  - If fetch fails and no cache → use built-in fallback rates
 */

import * as SQLite from 'expo-sqlite';

// ─── Constants ───────────────────────────────────────────────────────────────
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Supported currencies
export const CURRENCIES = ['MGA', 'USD', 'EUR', 'CNY'];

export const CURRENCY_INFO = {
  MGA: { name: 'Malagasy Ariary', flag: '🇲🇬', symbol: 'Ar' },
  USD: { name: 'US Dollar',       flag: '🇺🇸', symbol: '$'  },
  EUR: { name: 'Euro',            flag: '🇪🇺', symbol: '€'  },
  CNY: { name: 'Chinese Yuan',    flag: '🇨🇳', symbol: '¥'  },
};

// Fallback rates relative to USD (used when offline with no cache)
const FALLBACK_RATES_FROM_USD = {
  USD: 1,
  EUR: 0.92,
  CNY: 7.24,
  MGA: 4500,
};

// ─── Database setup ───────────────────────────────────────────────────────────
const db = SQLite.openDatabaseSync('manakalo.db');

export const initRatesDB = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS rates_cache (
      id       INTEGER PRIMARY KEY,
      base     TEXT NOT NULL,
      rates    TEXT NOT NULL,        -- JSON string
      fetched_at TEXT NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS conversion_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency TEXT NOT NULL,
      to_currency   TEXT NOT NULL,
      amount        REAL NOT NULL,
      result        REAL NOT NULL,
      rate          REAL NOT NULL,
      converted_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

// ─── Cache helpers ────────────────────────────────────────────────────────────
const saveRatesToCache = (rates) => {
  const now = new Date().toISOString();
  const existing = db.getFirstSync('SELECT id FROM rates_cache WHERE id = 1');
  if (existing) {
    db.runSync(
      'UPDATE rates_cache SET base = ?, rates = ?, fetched_at = ? WHERE id = 1',
      ['USD', JSON.stringify(rates), now]
    );
  } else {
    db.runSync(
      'INSERT INTO rates_cache (id, base, rates, fetched_at) VALUES (1, ?, ?, ?)',
      ['USD', JSON.stringify(rates), now]
    );
  }
};

const loadRatesFromCache = () => {
  const row = db.getFirstSync('SELECT * FROM rates_cache WHERE id = 1');
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.fetched_at).getTime();
  const isFresh = ageMs < CACHE_DURATION_MS;

  return {
    rates: JSON.parse(row.rates),
    isFresh,
    fetchedAt: row.fetched_at,
    ageMinutes: Math.floor(ageMs / 60000),
  };
};

// ─── API fetch ────────────────────────────────────────────────────────────────
const fetchLiveRates = async () => {
  // Using open.er-api.com — free, no key needed
  const response = await fetch(
    'https://open.er-api.com/v6/latest/USD',
    { signal: AbortSignal.timeout(8000) }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  // Extract only the currencies we need
  return {
    USD: data.rates.USD,
    EUR: data.rates.EUR,
    CNY: data.rates.CNY,
    MGA: data.rates.MGA,
  };
};

// ─── Main function ────────────────────────────────────────────────────────────
/**
 * getRates()
 * Returns rates relative to USD, plus metadata about the source.
 *
 * @returns {
 *   rates: { USD, EUR, CNY, MGA },
 *   source: 'live' | 'cache' | 'fallback',
 *   fetchedAt: string | null,
 *   ageMinutes: number | null,
 * }
 */
export const getRates = async () => {
  // 1. Check cache first
  const cached = loadRatesFromCache();

  if (cached?.isFresh) {
    return { rates: cached.rates, source: 'cache', fetchedAt: cached.fetchedAt, ageMinutes: cached.ageMinutes };
  }

  // 2. Try to fetch live
  try {
    const rates = await fetchLiveRates();
    saveRatesToCache(rates);
    return { rates, source: 'live', fetchedAt: new Date().toISOString(), ageMinutes: 0 };
  } catch (err) {
    console.warn('Rate fetch failed:', err.message);

    // 3. Use stale cache if available
    if (cached) {
      return { rates: cached.rates, source: 'cache', fetchedAt: cached.fetchedAt, ageMinutes: cached.ageMinutes };
    }

    // 4. Last resort: built-in fallback
    return { rates: FALLBACK_RATES_FROM_USD, source: 'fallback', fetchedAt: null, ageMinutes: null };
  }
};

// ─── Conversion logic ─────────────────────────────────────────────────────────
/**
 * Convert an amount from one currency to another.
 * All rates are relative to USD, so we go: FROM → USD → TO.
 */
export const convert = (amount, fromCurrency, toCurrency, rates) => {
  if (!rates || isNaN(amount) || amount === '') return 0;
  const amountUSD = parseFloat(amount) / rates[fromCurrency];
  return amountUSD * rates[toCurrency];
};

// ─── History helpers ──────────────────────────────────────────────────────────
export const saveToHistory = (from, to, amount, result, rate) => {
  try {
    db.runSync(
      'INSERT INTO conversion_history (from_currency, to_currency, amount, result, rate) VALUES (?, ?, ?, ?, ?)',
      [from, to, amount, result, rate]
    );
  } catch (e) {
    console.warn('History save failed:', e);
  }
};

export const getHistory = (limit = 30) => {
  try {
    return db.getAllSync(
      'SELECT * FROM conversion_history ORDER BY converted_at DESC LIMIT ?',
      [limit]
    );
  } catch (e) {
    return [];
  }
};

export const clearHistory = () => {
  db.runSync('DELETE FROM conversion_history');
};

// ─── Formatting ───────────────────────────────────────────────────────────────
export const formatAmount = (value, currency, rounded = false) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';

  const decimals = rounded ? 0 : currency === 'MGA' ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};
