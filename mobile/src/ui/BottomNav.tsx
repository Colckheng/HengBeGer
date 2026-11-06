import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

type Destination = '/' | '/list' | '/library';

const destinations: { href: Destination; label: string; symbol: string }[] = [
  { href: '/', label: '首页', symbol: '⌂' },
  { href: '/list', label: '图鉴', symbol: '▤' },
  { href: '/library', label: '我的', symbol: '◎' },
];

export function BottomNav({ active }: { active: Destination }) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {destinations.map(({ href, label, symbol }) => {
        const selected = active === href;
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected && href === '/list') router.replace('/list');
              else if (!selected) router.dismissTo(href);
            }}
            style={styles.item}
          >
            <Text accessible={false} style={[styles.symbol, selected && styles.active]}>{symbol}</Text>
            <Text style={[styles.label, selected && styles.active]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.brandDark, paddingTop: 6 },
  item: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 1 },
  symbol: { color: '#BDD1C8', fontSize: 23, lineHeight: 26 },
  label: { color: '#BDD1C8', fontSize: 13, fontWeight: '600' },
  active: { color: colors.accent },
});
