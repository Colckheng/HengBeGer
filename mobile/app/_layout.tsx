import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#12101c' },
          headerTintColor: '#f2eefb',
          contentStyle: { backgroundColor: '#0b0913' },
        }}
      >
        <Stack.Screen name="index" options={{ title: '开放图录' }} />
        <Stack.Screen name="list" options={{ title: '图鉴' }} />
        <Stack.Screen name="entry/[key]" options={{ title: '档案' }} />
        <Stack.Screen name="library" options={{ title: '收藏与历史' }} />
        <Stack.Screen name="settings" options={{ title: '设置' }} />
      </Stack>
    </>
  );
}
