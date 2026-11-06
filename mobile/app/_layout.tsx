import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { BottomNav } from '../src/ui/BottomNav';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
  const pathname = usePathname();
  const active = pathname === '/' || pathname === '/list' || pathname === '/library' ? pathname : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.brandDark }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: '#F4F6F2',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="list" options={{ title: '图鉴' }} />
        <Stack.Screen name="entry/[key]" options={{ title: '档案' }} />
        <Stack.Screen name="library" options={{ title: '收藏与历史' }} />
        <Stack.Screen name="settings" options={{ title: '设置' }} />
      </Stack>
      {active ? <BottomNav active={active} /> : null}
    </View>
  );
}
