import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { getApp } from '../src/api/app';
import { DEFAULT_SERVER_URL, normalizeServerUrl, testServerConnection } from '../src/api/client';

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

type Feedback = { kind: 'success' | 'error'; text: string };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function SettingsScreen() {
  const [value, setValue] = useState(DEFAULT_SERVER_URL);
  const [cached, setCached] = useState<number | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [serverLoaded, setServerLoaded] = useState(false);
  const [serverFeedback, setServerFeedback] = useState<Feedback | null>(null);
  const [connectionFeedback, setConnectionFeedback] = useState<Feedback | null>(null);
  const [cacheFeedback, setCacheFeedback] = useState<Feedback | null>(null);
  const [working, setWorking] = useState<'server' | 'cache' | null>(null);
  const workingRef = useRef(false);

  const refresh = useCallback(async (readServer = true) => {
    setLoading(true);
    setLoadError('');
    try {
      const { cache, library, storage } = await getApp();
      const [saved, entries, records] = await Promise.all([
        readServer ? storage.getItem('hb:serverUrl') : Promise.resolve(null),
        cache.listCachedEntries(),
        library.listHistory(),
      ]);
      if (readServer) {
        setValue(saved || DEFAULT_SERVER_URL);
        setServerLoaded(true);
      }
      setCached(entries.length);
      setHistory(records.length);
      return true;
    } catch (error) {
      setLoadError('读取设置失败：' + errorText(error));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveAndTest = async () => {
    if (workingRef.current || loading || !serverLoaded) return;
    workingRef.current = true;
    setWorking('server');
    setServerFeedback(null);
    setConnectionFeedback(null);
    try {
      const { storage } = await getApp();
      const next = normalizeServerUrl(value);
      await storage.setItem('hb:serverUrl', next);
      setValue(next);
      setServerFeedback({ kind: 'success', text: '地址已保存：' + next + '。重启 App 后切换实际数据连接。' });
      try {
        const index = await testServerConnection(next);
        setConnectionFeedback({
          kind: 'success',
          text: '测试地址 ' + next + ' 连接成功，服务端条目 ' + (index.items?.length ?? 0) + ' 条。',
        });
      } catch (error) {
        setConnectionFeedback({ kind: 'error', text: '测试地址 ' + next + ' 连接失败：' + errorText(error) });
      }
    } catch (error) {
      setServerFeedback({ kind: 'error', text: '保存失败：' + errorText(error) });
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  const clearCache = async () => {
    if (workingRef.current || loading) return;
    workingRef.current = true;
    setWorking('cache');
    setCacheFeedback(null);
    try {
      const { cache, library } = await getApp();
      const removed = await cache.clear();
      await library.clearHistory();
      setCacheFeedback({ kind: 'success', text: '已清除 ' + removed + ' 条缓存与全部历史，收藏保留。' });
      await refresh(false);
    } catch (error) {
      setCacheFeedback({ kind: 'error', text: '清除未完成：' + errorText(error) });
      await refresh(false);
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  const confirmClear = () => {
    Alert.alert('清除缓存与历史', '确定清除本地缓存和全部浏览历史吗？收藏会保留，此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: () => { void clearCache(); } },
    ]);
  };

  const disabled = loading || working !== null;
  const serverDisabled = disabled || !serverLoaded;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>设置</Text>
        <Text style={styles.subtitle}>管理服务器地址和本机数据。</Text>
      </View>

      {loading ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#10383A" />
          <Text style={styles.loadingText}>正在读取设置…</Text>
        </View>
      ) : null}
      {loadError ? (
        <View style={styles.loadError}>
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新读取设置"
            accessibilityState={{ disabled: working !== null }}
            disabled={working !== null}
            onPress={() => { void refresh(!serverLoaded); }}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed, working !== null && styles.disabled]}
          >
            <Text style={styles.retryText}>重新读取</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>服务器</Text>
        <Text style={styles.sectionDescription}>设置 App 使用的图录服务器。</Text>
        <View style={styles.panel}>
          <Text style={styles.fieldLabel}>服务器地址</Text>
          <TextInput
            accessibilityLabel="服务器地址"
            accessibilityHint="保存后重启 App 生效"
            accessibilityState={{ disabled: serverDisabled }}
            value={value}
            onChangeText={(text) => { setValue(text); setServerFeedback(null); setConnectionFeedback(null); }}
            editable={!serverDisabled}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={DEFAULT_SERVER_URL}
            placeholderTextColor="#526C68"
            selectionColor="#10383A"
            style={[styles.input, serverDisabled && styles.disabled]}
          />
          <Text style={styles.hint}>默认使用云端服务器。本机预演地址为 https://127.0.0.1:8444；更换服务器地址需要重新打包，以配置 App 内的证书信任锚。</Text>
          <View style={styles.testNote}>
            <Text style={styles.testTitle}>连接测试</Text>
            <Text style={styles.testDescription}>保存后会测试填写的地址。App 的实际数据连接将在重启后切换到新地址。</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存服务器地址并测试新地址"
            accessibilityState={{ disabled: serverDisabled, busy: working === 'server' }}
            disabled={serverDisabled}
            onPress={() => { void saveAndTest(); }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, serverDisabled && styles.disabled]}
          >
            {working === 'server' ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.primaryButtonText}>{working === 'server' ? '正在保存并测试…' : '保存并测试'}</Text>
          </Pressable>
          {serverFeedback ? <FeedbackMessage feedback={serverFeedback} /> : null}
          {connectionFeedback ? <FeedbackMessage feedback={connectionFeedback} /> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>本机数据</Text>
        <Text style={styles.sectionDescription}>收藏和浏览历史只保存在这台设备上。</Text>
        <View style={styles.panel}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>已缓存的档案详情</Text>
            <Text style={styles.statValue}>{cached === null ? '—' : cached + ' 条'}</Text>
          </View>
          <View style={[styles.statRow, styles.statRowBorder]}>
            <Text style={styles.statLabel}>浏览历史</Text>
            <Text style={styles.statValue}>{history === null ? '—' : history + ' 条'}</Text>
          </View>
          <Text style={styles.hint}>清除缓存会同时清除浏览历史，收藏会保留。</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清除缓存与历史"
            accessibilityHint="需要确认，收藏会保留"
            accessibilityState={{ disabled, busy: working === 'cache' }}
            disabled={disabled}
            onPress={confirmClear}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, disabled && styles.disabled]}
          >
            {working === 'cache' ? <ActivityIndicator color="#93483E" /> : null}
            <Text style={styles.secondaryButtonText}>{working === 'cache' ? '正在清除…' : '清除缓存与历史'}</Text>
          </Pressable>
          {cacheFeedback ? <FeedbackMessage feedback={cacheFeedback} /> : null}
        </View>
      </View>

      <View style={[styles.section, styles.about]}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>关于</Text>
        <Text style={styles.aboutText}>开放图录手机版 {APP_VERSION}</Text>
        <Text style={styles.hint}>只读云端 · 收藏与历史只存在本机</Text>
      </View>
    </ScrollView>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return (
    <View style={[styles.feedback, feedback.kind === 'error' && styles.feedbackError]}>
      <Text accessibilityLiveRegion="polite" style={[styles.feedbackText, feedback.kind === 'error' && styles.errorText]}>{feedback.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F2' },
  page: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 48 },
  intro: { marginBottom: 6 },
  title: { color: '#102B2C', fontSize: 28, lineHeight: 36, fontWeight: '700' },
  subtitle: { color: '#526C68', fontSize: 14, lineHeight: 22, marginTop: 6 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  loadingText: { color: '#526C68', fontSize: 14, lineHeight: 21 },
  loadError: { marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: '#FCEEEA' },
  retry: { minHeight: 48, minWidth: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: 16 },
  retryText: { color: '#10383A', fontSize: 14, fontWeight: '700' },
  section: { marginTop: 26 },
  sectionTitle: { color: '#102B2C', fontSize: 19, lineHeight: 26, fontWeight: '700' },
  sectionDescription: { color: '#526C68', fontSize: 14, lineHeight: 22, marginTop: 4, marginBottom: 12 },
  panel: { backgroundColor: '#FFFFFF', borderColor: '#D3E0D8', borderWidth: 1, borderRadius: 16, padding: 16 },
  fieldLabel: { color: '#102B2C', fontSize: 15, lineHeight: 22, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#B9CEC1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#102B2C', backgroundColor: '#F4F6F2', fontSize: 15 },
  hint: { color: '#526C68', fontSize: 13, lineHeight: 21, marginTop: 10 },
  testNote: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E7EEE9' },
  testTitle: { color: '#102B2C', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  testDescription: { color: '#526C68', fontSize: 13, lineHeight: 21, marginTop: 4 },
  primaryButton: { minHeight: 52, borderRadius: 12, marginTop: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#10383A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  feedback: { marginTop: 12, borderRadius: 10, backgroundColor: '#E7EEE9', padding: 12 },
  feedbackError: { backgroundColor: '#FCEEEA' },
  feedbackText: { color: '#10383A', fontSize: 13, lineHeight: 21 },
  errorText: { color: '#93483E', fontSize: 13, lineHeight: 21 },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  statRowBorder: { borderTopWidth: 1, borderTopColor: '#E7EEE9' },
  statLabel: { color: '#365A55', fontSize: 14, lineHeight: 21, flex: 1 },
  statValue: { color: '#102B2C', fontSize: 14, lineHeight: 21, fontWeight: '700' },
  secondaryButton: { minHeight: 52, borderWidth: 1, borderColor: '#D4AAA1', borderRadius: 12, marginTop: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: '#93483E', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  about: { paddingBottom: 4 },
  aboutText: { color: '#102B2C', fontSize: 14, lineHeight: 22, marginTop: 10 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
