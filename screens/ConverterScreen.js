/**
 * CONVERTER SCREEN
 *
 * Improvements over the original web app:
 * - Live rate status badge (live / cached / offline fallback)
 * - Full multi-directional conversion: any currency → any currency
 * - Swap button
 * - Round toggle
 * - All 4 output rates shown simultaneously (like a rate board)
 * - Conversion history saved automatically
 * - Pull-to-refresh for live rates
 * - Clean, native mobile UI
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  RefreshControl,
  useColorScheme,
  Keyboard,
} from "react-native";
import {
  Text,
  TextInput,
  Surface,
  Chip,
  IconButton,
  Divider,
  ActivityIndicator,
  Switch,
  Snackbar,
} from "react-native-paper";

import {
  CURRENCIES,
  CURRENCY_INFO,
  getRates,
  convert,
  formatAmount,
  saveToHistory,
} from "../ratesService";

// ─── Currency Selector Button ─────────────────────────────────────────────────
function CurrencyButton({ currency, selected, onPress }) {
  const info = CURRENCY_INFO[currency];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.currencyBtn, selected && styles.currencyBtnSelected]}
      activeOpacity={0.7}
    >
      <Text style={styles.currencyFlag}>{info.flag}</Text>
      <Text
        style={[styles.currencyCode, selected && styles.currencyCodeSelected]}
      >
        {currency}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Rate Row (the "rate board" at the bottom) ────────────────────────────────
function RateRow({ from, to, rates, amount, rounded }) {
  if (from === to) return null;

  const toInfo = CURRENCY_INFO[to];
  const result = convert(amount || 1, from, to, rates);
  const display = amount
    ? formatAmount(result, to, rounded)
    : formatAmount(result, to, false);

  return (
    <View style={styles.rateRow}>
      <View style={styles.rateRowLeft}>
        <Text style={styles.rateFlag}>{toInfo.flag}</Text>
        <Text style={styles.rateCode}>{to}</Text>
        <Text style={styles.rateName}>{toInfo.name}</Text>
      </View>
      <Text style={styles.rateValue}>
        {amount ? display : `1 ${from} = ${display} ${to}`}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ConverterScreen({ navigation }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Core state
  const [rates, setRates] = useState(null);
  const [ratesMeta, setRatesMeta] = useState({
    source: null,
    ageMinutes: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Converter state — default: CNY → MGA as requested
  // `amount` holds the raw numeric string (used for all calculations)
  // `displayAmount` holds the formatted string with thousand separators (shown in the input)
  const [amount, setAmount] = useState("");
  const [displayAmount, setDisplayAmount] = useState("");
  const [fromCurrency, setFromCurrency] = useState("CNY");
  const [toCurrency, setToCurrency] = useState("MGA");
  const [rounded, setRounded] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  // ── Thousand-separator formatter ────────────────────────────────────────────
  // Called on every keystroke. Strips non-numeric chars, keeps one decimal
  // point, then re-formats with commas: "1234567.8" → "1,234,567.8"
  const handleAmountChange = (text) => {
    // 1. Strip everything except digits and one decimal point
    const cleaned = text.replace(/[^0-9.]/g, "");

    // 2. Prevent more than one decimal point
    const parts = cleaned.split(".");
    const raw =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("") // collapse extra dots
        : cleaned;

    // 3. Format the integer part with commas, preserve decimal part as-is
    const [intPart, decPart] = raw.split(".");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const formatted =
      decPart !== undefined ? formattedInt + "." + decPart : formattedInt;

    setAmount(raw); // plain value for math
    setDisplayAmount(formatted); // pretty value for display
  };

  // Debounce timer ref — we save to history only after the user
  // stops typing for 800 ms, so intermediate keystrokes and
  // rate-board side-renders are NOT recorded.
  const saveTimer = useRef(null);

  // Animated spin for the swap button
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ── Load rates ──────────────────────────────────────────────────────────────
  const loadRates = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { rates: r, source, ageMinutes } = await getRates();
      setRates(r);
      setRatesMeta({ source, ageMinutes });

      if (isRefresh) {
        setSnackbar(
          source === "live"
            ? "✅ Rates updated!"
            : "⚠️ Using cached rates — no internet",
        );
      }
    } catch (e) {
      setSnackbar("Could not load rates");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // ── Save to history — debounced, only for the main conversion ───────────────
  // We deliberately do NOT put this in a useEffect that watches `rates`,
  // because that would fire for every rate-board row automatically.
  // Instead we trigger it only when the user actively changes amount or
  // currency, with an 800 ms idle wait so each "session" = 1 history entry.
  const scheduleHistorySave = useCallback((from, to, amt, currentRates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!currentRates || !amt || isNaN(amt) || parseFloat(amt) <= 0) return;

    saveTimer.current = setTimeout(() => {
      const numericAmount = parseFloat(amt);
      const result = convert(numericAmount, from, to, currentRates);
      const rate = convert(1, from, to, currentRates);
      saveToHistory(from, to, numericAmount, result, rate);
    }, 800);
  }, []);

  // Trigger debounced save whenever the user changes amount or currency pair
  useEffect(() => {
    scheduleHistorySave(fromCurrency, toCurrency, amount, rates);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [amount, fromCurrency, toCurrency, scheduleHistorySave, rates]);

  // ── Swap currencies ─────────────────────────────────────────────────────────
  const handleSwap = () => {
    Animated.sequence([
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(spinAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const spinDeg = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  // ── Computed result ─────────────────────────────────────────────────────────
  const result =
    rates && amount && !isNaN(amount)
      ? convert(parseFloat(amount), fromCurrency, toCurrency, rates)
      : null;

  // The rate used for this pair (shown below the result)
  const currentRate = rates
    ? convert(1, fromCurrency, toCurrency, rates)
    : null;

  // ── Status badge ────────────────────────────────────────────────────────────
  const sourceBadge = () => {
    if (!ratesMeta.source) return null;
    const config = {
      live: { icon: "wifi", color: "#4CAF50", label: "Live rates" },
      cache: {
        icon: "clock-outline",
        color: "#FF9800",
        label: `Cached · ${ratesMeta.ageMinutes}m ago`,
      },
      fallback: {
        icon: "wifi-off",
        color: "#9E9E9E",
        label: "Offline — fallback rates",
      },
    }[ratesMeta.source];

    return (
      <Chip
        icon={config.icon}
        style={[styles.badge, { borderColor: config.color }]}
        textStyle={{ color: config.color, fontSize: 11 }}
      >
        {config.label}
      </Chip>
    );
  };

  const otherCurrencies = CURRENCIES.filter((c) => c !== fromCurrency);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: "#999" }}>
          Fetching exchange rates…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadRates(true)}
          />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* ── Status badge ─────────────────────────────────────────────── */}
        <View style={styles.badgeRow}>
          {sourceBadge()}
          <IconButton
            icon="history"
            size={22}
            iconColor={isDark ? "#aaa" : "#555"}
            onPress={() => {
              Keyboard.dismiss();
              navigation.navigate("History");
            }}
          />
        </View>

        {/* ── FROM currency selector ────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={2}>
          <Text style={styles.sectionLabel}>FROM</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <CurrencyButton
                key={c}
                currency={c}
                selected={fromCurrency === c}
                onPress={() => {
                  if (c === toCurrency) setToCurrency(fromCurrency);
                  setFromCurrency(c);
                }}
              />
            ))}
          </View>

          <TextInput            
            label={`Amount in ${fromCurrency}`}
            value={displayAmount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            placeholder="0"
            left={<TextInput.Affix text={CURRENCY_INFO[fromCurrency].symbol} />}
            style={styles.amountInput}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            theme={{ colors: { background: isDark ? "#1a1a2e" : "#ffffff" } }}
          />
        </Surface>

        {/* ── Swap + Round row ─────────────────────────────────────────── */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={handleSwap}
            style={styles.swapBtn}
            activeOpacity={0.7}
          >
            <Animated.Text
              style={[styles.swapIcon, { transform: [{ rotate: spinDeg }] }]}
            >
              ⇄
            </Animated.Text>
            <Text style={styles.swapLabel}>Swap</Text>
          </TouchableOpacity>

          <View style={styles.roundRow}>
            <Text style={[styles.roundLabel, isDark && styles.textDark]}>
              Round
            </Text>
            <Switch value={rounded} onValueChange={setRounded} />
          </View>
        </View>

        {/* ── TO currency selector ──────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={2}>
          <Text style={styles.sectionLabel}>TO</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => (
              <CurrencyButton
                key={c}
                currency={c}
                selected={toCurrency === c}
                onPress={() => {
                  if (c === fromCurrency) setFromCurrency(toCurrency);
                  setToCurrency(c);
                }}
              />
            ))}
          </View>

          {/* Result display */}
          <View style={[styles.resultBox, isDark && styles.resultBoxDark]}>
            {result !== null ? (
              <>
                <Text style={styles.resultValue}>
                  {CURRENCY_INFO[toCurrency].symbol}{" "}
                  {formatAmount(result, toCurrency, rounded)}
                </Text>
                <Text style={styles.resultCurrency}>
                  {toCurrency} · {CURRENCY_INFO[toCurrency].name}
                </Text>
                {/* ── Rate used — answers remark #1 ── */}
                {currentRate !== null && (
                  <Text style={styles.rateUsed}>
                    1 {fromCurrency} = {formatAmount(currentRate, toCurrency)}{" "}
                    {toCurrency}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.resultPlaceholder}>
                  Enter an amount above
                </Text>
                {/* Show rate even with no amount */}
                {currentRate !== null && (
                  <Text style={styles.rateUsed}>
                    1 {fromCurrency} = {formatAmount(currentRate, toCurrency)}{" "}
                    {toCurrency}
                  </Text>
                )}
              </>
            )}
          </View>
        </Surface>

        {/* ── Rate board ────────────────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={1}>
          <Text style={styles.sectionLabel}>
            {amount
              ? `${displayAmount} ${fromCurrency} equals`
              : `1 ${fromCurrency} equals`}
          </Text>
          <Divider style={{ marginBottom: 8 }} />
          {otherCurrencies.map((c) => (
            <RateRow
              key={c}
              from={fromCurrency}
              to={c}
              rates={rates}
              amount={amount ? parseFloat(amount) : null}
              rounded={rounded}
            />
          ))}
        </Surface>

        {/* ── Quick amounts ─────────────────────────────────────────────── */}
        <View style={styles.quickRow}>
          {[10, 50, 100, 500, 1000].map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => handleAmountChange(String(v))}
              style={[
                styles.quickBtn,
                amount === String(v) && styles.quickBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.quickBtnText,
                  amount === String(v) && styles.quickBtnTextActive,
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2500}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f4f8",
  },
  rootDark: {
    backgroundColor: "#0f0f1a",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  // Badge
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },

  // Cards
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: "#1a1a2e",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#999",
    marginBottom: 10,
    textTransform: "uppercase",
  },

  // Currency selector buttons
  currencyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 6,
  },
  currencyBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  currencyBtnSelected: {
    borderColor: "#E8352B",
    backgroundColor: "#fff0ef",
  },
  currencyFlag: {
    fontSize: 22,
    marginBottom: 2,
  },
  currencyCode: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
  },
  currencyCodeSelected: {
    color: "#E8352B",
  },

  // Amount input — extra top margin so the floating label isn't clipped
  amountInput: {
    backgroundColor: "transparent",
    marginTop: 8,    
    fontSize: 25,
    paddingLeft: 6,
  },

  // Swap + round row
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#E8352B",
  },
  swapIcon: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "bold",
  },
  swapLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  roundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roundLabel: {
    fontSize: 14,
    color: "#555",
  },
  textDark: {
    color: "#bbb",
  },

  // Result
  resultBox: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#f9f9f9",
  },
  resultBoxDark: {
    backgroundColor: "#0f0f1a",
  },
  resultValue: {
    fontSize: 38,
    fontWeight: "bold",
    color: "#E8352B",
    letterSpacing: -0.5,
  },
  resultCurrency: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
  },
  // Rate used — small line shown below the result
  rateUsed: {
    fontSize: 11,
    color: "#bbb",
    marginTop: 6,
    fontStyle: "italic",
  },
  resultPlaceholder: {
    fontSize: 16,
    color: "#bbb",
    fontStyle: "italic",
  },

  // Rate board
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  rateRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rateFlag: {
    fontSize: 20,
  },
  rateCode: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    width: 36,
  },
  rateName: {
    fontSize: 12,
    color: "#999",
  },
  rateValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    flexShrink: 1,
    textAlign: "right",
  },

  // Quick amounts
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
  },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  quickBtnActive: {
    borderColor: "#E8352B",
    backgroundColor: "#fff0ef",
  },
  quickBtnText: {
    fontWeight: "600",
    fontSize: 13,
    color: "#555",
  },
  quickBtnTextActive: {
    color: "#E8352B",
  },
});
