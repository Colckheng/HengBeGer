import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { getApp } from '../src/api/app';
import { DEFAULT_SERVER_URL, normalizeServerUrl } from '../src/api/client';

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

export default function SettingsScreen() {
  const [value, setValue] = useState(DEFAULT_SERVER_URL);
  const [cached, setCached] = useState(0);
  const [history, setHistory] = useState(0);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const { cache, library, storage } = await getApp();
    setValue((await storage.getItem('hb:serverUrl')) || DEFAULT_SERVER_URL);
    setCached((await cache.listCachedEntries()).length);
    setHistory((await library.listHistory()).length);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.label}>云端地址</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={DEFAULT_SERVER_URL}
        placeholderTextColor="#6f6890"
        style={styles.input}
      />
      <Text style={styles.hint}>默认是云端 ECS（公网 IP + 8443，自签证书）。填本机预演栈就写 https://127.0.0.1:8444；证书靠 App 内置信任锚固定，换服务器地址要重打包。</Text>
      <Pressable
        style={styles.button}
        onPress={async () => {
          const { storage, client } = await getApp();
          const next = normalizeServerUrl(value);
          await storage.setItem('hb:serverUrl', next);
          setMessage('已保存：' + next + '（重启 App 生效）');
          try {
            const index = await client.getIndex();
            setMessage('已保存并连通，服务端条目 ' + (index.items?.length ?? 0) + ' 条');
          } catch (error: any) {
            setMessage('已保存，但连不上：' + (error?.message || error));
          }
        }}
      >
        <Text style={styles.buttonText}>保存并测试</Text>
      </Pressable>
      {message ? <Text style={styles.hint}>{message}</Text> : null}

      <Text style={styles.label}>本地缓存</Text>
      <Text style={styles.hint}>已缓存 {cached} 条档案详情、{history} 条浏览历史。</Text>
      <Pressable
        style={styles.button}
        onPress={async () => {
          const { cache, library } = await getApp();
          const removed = await cache.clear();
          await library.clearHistory();
          setMessage('已清除 ' + removed + ' 条缓存与全部历史（收藏保留）');
          await refresh();
        }}
      >
        <Text style={styles.buttonText}>清除缓存与历史</Text>
      </Pressable>

      <Text style={styles.label}>关于</Text>
      <Text style={styles.hint}>开放图录手机版 {APP_VERSION} · 只读云端 · 收藏与历史只存在本机。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8, paddingBottom: 48 },
  label: { color: '#f2eefb', fontWeight: '700', marginTop: 12 },
  input: { backgroundColor: '#171426', color: '#f2eefb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  hint: { color: '#9c93b8', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#2b2450', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#efe9ff', fontWeight: '600' },
});
