/**
 * HISTORY SCREEN
 *
 * New feature not in the original web app.
 * Shows the last 30 conversions with:
 * - Date/time
 * - From → To with flags
 * - Rate used
 * - Ability to clear history
 */

import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, useColorScheme } from 'react-native';
import {
  Text,
  Surface,
  IconButton,
  Divider,
  Dialog,
  Portal,
  Button,
  Chip,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { getHistory, clearHistory, CURRENCY_INFO, formatAmount } from '../ratesService';

export default function HistoryScreen() {
  const [history, setHistory] = useState([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const isDark = useColorScheme() === 'dark';

  const load = useCallback(() => {
    setHistory(getHistory(30));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleClear = () => {
    clearHistory();
    setHistory([]);
    setConfirmVisible(false);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' · '
      + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }) => {
    const fromInfo = CURRENCY_INFO[item.from_currency];
    const toInfo   = CURRENCY_INFO[item.to_currency];

    return (
      <Surface style={[styles.row, isDark && styles.rowDark]} elevation={1}>
        {/* Left: flags + currencies */}
        <View style={styles.left}>
          <View style={styles.pairRow}>
            <Text style={styles.flag}>{fromInfo.flag}</Text>
            <Text style={styles.arrow}> → </Text>
            <Text style={styles.flag}>{toInfo.flag}</Text>
          </View>
          <Text style={styles.date}>{formatDate(item.converted_at)}</Text>
        </View>

        {/* Right: amounts */}
        <View style={styles.right}>
          <Text style={styles.fromAmount}>
            {formatAmount(item.amount, item.from_currency)} {item.from_currency}
          </Text>
          <Text style={styles.toAmount}>
            {formatAmount(item.result, item.to_currency, item.to_currency === 'MGA')} {item.to_currency}
          </Text>
          <Text style={styles.rate}>
            1 {item.from_currency} = {formatAmount(item.rate, item.to_currency)} {item.to_currency}
          </Text>
        </View>
      </Surface>
    );
  };

  return (
    <View style={[styles.root, isDark && styles.rootDark]}>
      {/* Header row */}
      <View style={styles.header}>
        <Chip icon="swap-horizontal" textStyle={{ fontSize: 12 }}>
          {history.length} conversion{history.length !== 1 ? 's' : ''}
        </Chip>
        {history.length > 0 && (
          <IconButton
            icon="delete-outline"
            size={22}
            iconColor="#f44336"
            onPress={() => setConfirmVisible(true)}
          />
        )}
      </View>

      <Divider />

      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.emptyInner}>
            <Text style={styles.emptyText}>🔄</Text>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptySubtitle}>Your conversions will appear here</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Confirm clear dialog */}
      <Portal>
        <Dialog visible={confirmVisible} onDismiss={() => setConfirmVisible(false)}>
          <Dialog.Title>Clear History</Dialog.Title>
          <Dialog.Content>
            <Text>This will delete all conversion history. Continue?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmVisible(false)}>Cancel</Button>
            <Button textColor="#f44336" onPress={handleClear}>Clear</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4f8' },
  rootDark: { backgroundColor: '#0f0f1a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  list: { padding: 12 },
  emptyContainer: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptySubtitle: { fontSize: 14, color: '#999', marginTop: 4 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  rowDark: { backgroundColor: '#1a1a2e' },
  left: { gap: 4 },
  pairRow: { flexDirection: 'row', alignItems: 'center' },
  flag: { fontSize: 22 },
  arrow: { fontSize: 14, color: '#aaa', fontWeight: 'bold' },
  date: { fontSize: 11, color: '#aaa', marginTop: 2 },

  right: { alignItems: 'flex-end', gap: 2 },
  fromAmount: { fontSize: 13, color: '#888' },
  toAmount: { fontSize: 17, fontWeight: '700', color: '#E8352B' },
  rate: { fontSize: 10, color: '#bbb', marginTop: 2 },
});
