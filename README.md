# 🇲🇬 Manakalo — React Native Currency Converter

A clean, offline-capable React Native port of [Manakalo](https://github.com/Timmyway/manakalo) with improvements.

> "Manakalo" = exchange / conversion in Malagasy 🇲🇬

## ✨ What's New vs the Web App

| Feature | Web | Mobile |
|---------|-----|--------|
| USD ↔ MGA, EUR ↔ MGA, CNY ↔ MGA | ✅ | ✅ |
| Any ↔ Any currency | ❌ | ✅ |
| Swap button | ✅ | ✅ |
| Round toggle | ✅ | ✅ |
| Live rate badge | ❌ | ✅ |
| Rate board (all 3 rates at once) | ❌ | ✅ |
| Quick amount buttons (10, 50…) | ❌ | ✅ |
| Conversion history | ❌ | ✅ |
| Offline fallback | Partial | ✅ Full |
| Dark mode | ❌ | ✅ Auto |
| Native mobile UI | ❌ | ✅ |

## 🚀 Setup

```bash
npm install
npx expo start -c
```

Scan QR with Expo Go (SDK 54).

## 📁 Structure

```
manakalo/
├── App.js                  # Navigation + theme
├── ratesService.js         # API, cache, SQLite, convert logic
├── screens/
│   ├── ConverterScreen.js  # Main converter UI
│   └── HistoryScreen.js    # Conversion history
├── package.json
└── app.json
```

## 🔌 How Rates Work

```
Open app
  ↓
Cache fresh? (< 1 hour)
  ├── YES → use cache (instant, no network)
  └── NO → fetch from open.er-api.com
              ↓
           Success? → save to SQLite cache
           Fail?    → use stale cache
                        ↓
                     No cache? → use built-in fallback rates
```

## 💱 Supported Currencies

| Flag | Code | Currency |
|------|------|----------|
| 🇲🇬 | MGA | Malagasy Ariary |
| 🇺🇸 | USD | US Dollar |
| 🇪🇺 | EUR | Euro |
| 🇨🇳 | CNY | Chinese Yuan |

## 📄 License

MIT — same as the original project.
