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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  RefreshControl,
  useColorScheme,
  Keyboard,
} from 'react-native';
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
} from 'react-native-paper';

import {
  CURRENCIES,
  CURRENCY_INFO,
  getRates,
  convert,
  formatAmount,
  saveToHistory,
} from '../ratesService';

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
      <Text style={[styles.currencyCode, selected && styles.currencyCodeSelected]}>
        {currency}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Rate Row (the "rate board" at the bottom) ────────────────────────────────
function RateRow({ from, to, rates, amount, rounded }) {
  const fromInfo = CURRENCY_INFO[from];
  const toInfo   = CURRENCY_INFO[to];

  if (from === to) return null;

  const result = convert(amount || 1, from, to, rates);
  const display = amount
    ? formatAmount(result, to, rounded)
    : formatAmount(result, to, false); // show rate when no amount

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
  const isDark = colorScheme === 'dark';

  // Core state
  const [rates, setRates]         = useState(null);
  const [ratesMeta, setRatesMeta] = useState({ source: null, ageMinutes: null });
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Converter state
  const [amount, setAmount]           = useState('');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency]     = useState('MGA');
  const [rounded, setRounded]           = useState(false);
  const [snackbar, setSnackbar]         = useState('');

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
          source === 'live'
            ? '✅ Rates updated!'
            : '⚠️ Using cached rates — no internet'
        );
      }
    } catch (e) {
      setSnackbar('Could not load rates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  // ── Auto-save to history when a valid conversion happens ────────────────────
  useEffect(() => {
    if (!rates || !amount || isNaN(amount) || parseFloat(amount) <= 0) return;

    const result = convert(parseFloat(amount), fromCurrency, toCurrency, rates);
    const rate   = convert(1, fromCurrency, toCurrency, rates);
    saveToHistory(fromCurrency, toCurrency, parseFloat(amount), result, rate);
  }, [amount, fromCurrency, toCurrency, rates]);

  // ── Swap currencies ─────────────────────────────────────────────────────────
  const handleSwap = () => {
    // Animate the swap icon
    Animated.sequence([
      Animated.timing(spinAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(spinAnim, { toValue: 0, duration: 0,   useNativeDriver: true }),
    ]).start();

    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const spinDeg = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // ── Computed result ─────────────────────────────────────────────────────────
  const result = rates && amount && !isNaN(amount)
    ? convert(parseFloat(amount), fromCurrency, toCurrency, rates)
    : null;

  // ── Status badge ────────────────────────────────────────────────────────────
  const sourceBadge = () => {
    if (!ratesMeta.source) return null;
    const config = {
      live:     { icon: 'wifi',              color: '#4CAF50', label: 'Live rates'                           },
      cache:    { icon: 'clock-outline',      color: '#FF9800', label: `Cached · ${ratesMeta.ageMinutes}m ago` },
      fallback: { icon: 'wifi-off',           color: '#9E9E9E', label: 'Offline — fallback rates'             },
    }[ratesMeta.source];

    return (
      <Chip icon={config.icon} style={[styles.badge, { borderColor: config.color }]}
            textStyle={{ color: config.color, fontSize: 11 }}>
        {config.label}
      </Chip>
    );
  };

  // ── Other currencies to show in the rate board ──────────────────────────────
  const otherCurrencies = CURRENCIES.filter(c => c !== fromCurrency);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: '#999' }}>Fetching exchange rates…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadRates(true)} />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* ── Status badge ─────────────────────────────────────────────── */}
        <View style={styles.badgeRow}>
          {sourceBadge()}
          <IconButton
            icon="history"
            size={22}
            iconColor={isDark ? '#aaa' : '#555'}
            onPress={() => { Keyboard.dismiss(); navigation.navigate('History'); }}
          />
        </View>

        {/* ── FROM currency selector ────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={2}>
          <Text style={styles.sectionLabel}>FROM</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map(c => (
              <CurrencyButton
                key={c}
                currency={c}
                selected={fromCurrency === c}
                onPress={() => { if (c === toCurrency) setToCurrency(fromCurrency); setFromCurrency(c); }}
              />
            ))}
          </View>

          {/* Amount input */}
          <TextInput
            mode="outlined"
            label={`Amount in ${fromCurrency}`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            left={<TextInput.Affix text={CURRENCY_INFO[fromCurrency].symbol} />}
            style={styles.amountInput}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </Surface>

        {/* ── Swap + Round row ─────────────────────────────────────────── */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleSwap} style={styles.swapBtn} activeOpacity={0.7}>
            <Animated.Text style={[styles.swapIcon, { transform: [{ rotate: spinDeg }] }]}>
              ⇄
            </Animated.Text>
            <Text style={styles.swapLabel}>Swap</Text>
          </TouchableOpacity>

          <View style={styles.roundRow}>
            <Text style={[styles.roundLabel, isDark && styles.textDark]}>Round result</Text>
            <Switch value={rounded} onValueChange={setRounded} />
          </View>
        </View>

        {/* ── TO currency selector ──────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={2}>
          <Text style={styles.sectionLabel}>TO</Text>
          <View style={styles.currencyRow}>
            {CURRENCIES.map(c => (
              <CurrencyButton
                key={c}
                currency={c}
                selected={toCurrency === c}
                onPress={() => { if (c === fromCurrency) setFromCurrency(toCurrency); setToCurrency(c); }}
              />
            ))}
          </View>

          {/* Result display */}
          <View style={styles.resultBox}>
            {result !== null ? (
              <>
                <Text style={styles.resultValue}>
                  {CURRENCY_INFO[toCurrency].symbol}{' '}
                  {formatAmount(result, toCurrency, rounded)}
                </Text>
                <Text style={styles.resultCurrency}>{toCurrency} · {CURRENCY_INFO[toCurrency].name}</Text>
              </>
            ) : (
              <Text style={styles.resultPlaceholder}>Enter an amount above</Text>
            )}
          </View>
        </Surface>

        {/* ── Rate board ────────────────────────────────────────────────── */}
        <Surface style={[styles.card, isDark && styles.cardDark]} elevation={1}>
          <Text style={styles.sectionLabel}>
            {amount ? `${amount} ${fromCurrency} equals` : `1 ${fromCurrency} equals`}
          </Text>
          <Divider style={{ marginBottom: 8 }} />
          {otherCurrencies.map(c => (
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
          {[10, 50, 100, 500, 1000].map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => setAmount(String(v))}
              style={[styles.quickBtn, amount === String(v) && styles.quickBtnActive]}
            >
              <Text style={[styles.quickBtnText, amount === String(v) && styles.quickBtnTextActive]}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
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
    backgroundColor: '#f4f4f8',
  },
  rootDark: {
    backgroundColor: '#0f0f1a',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  // Badge
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },

  // Cards
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: '#1a1a2e',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#999',
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  // Currency selector buttons
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 6,
  },
  currencyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  currencyBtnSelected: {
    borderColor: '#E8352B',
    backgroundColor: '#fff0ef',
  },
  currencyFlag: {
    fontSize: 22,
    marginBottom: 2,
  },
  currencyCode: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
  },
  currencyCodeSelected: {
    color: '#E8352B',
  },

  // Amount input
  amountInput: {
    backgroundColor: 'transparent',
  },

  // Swap + round row
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8352B',
  },
  swapIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  swapLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundLabel: {
    fontSize: 14,
    color: '#555',
  },
  textDark: {
    color: '#bbb',
  },

  // Result
  resultBox: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
  },
  resultValue: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#E8352B',
    letterSpacing: -0.5,
  },
  resultCurrency: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  resultPlaceholder: {
    fontSize: 16,
    color: '#bbb',
    fontStyle: 'italic',
  },

  // Rate board
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rateRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateFlag: {
    fontSize: 20,
  },
  rateCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    width: 36,
  },
  rateName: {
    fontSize: 12,
    color: '#999',
  },
  rateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
    textAlign: 'right',
  },

  // Quick amounts
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 4,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  quickBtnActive: {
    borderColor: '#E8352B',
    backgroundColor: '#fff0ef',
  },
  quickBtnText: {
    fontWeight: '600',
    fontSize: 13,
    color: '#555',
  },
  quickBtnTextActive: {
    color: '#E8352B',
  },
});
