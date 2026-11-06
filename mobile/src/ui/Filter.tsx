import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

/**
 * 世界 / 赛季 / 分类 / 二级字段共用同一套 chip 规格：
 * 同圆角、同字号、同内边距、同选中态，只有排布方向不同。
 */
export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** 筛选面板的一行：左侧固定标签，右侧换行排布的 chip。 */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValues}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#C8D7CE',
    backgroundColor: colors.surface,
    borderRadius: 999,
  },
  chipSelected: { backgroundColor: colors.brandDark, borderColor: colors.brandDark },
  chipText: { color: colors.ink, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  chipTextSelected: { color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  rowLabel: { width: 60, color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 20, paddingTop: 13 },
  rowValues: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0 },
});
