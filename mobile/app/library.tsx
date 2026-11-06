import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { getApp } from '../src/api/app';
import { categoryName, itemByKey } from '../src/lib/labels';
import { CoverImage } from '../src/ui/Cover';

type Tab = 'favorites' | 'history';
type Row = { key: string; name: string; image: string | null; category: string; at: number };

function timeText(at: number) {
  if (!at) return '';
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('favorites');
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const requestId = useRef(0);
  const workingRef = useRef(false);

  const load = useCallback(async (nextTab: Tab, preserveMessage = false) => {
    const request = ++requestId.current;
    setState('loading');
    if (!preserveMessage) setMessage('');
    try {
      const { cache, library } = await getApp();
      const [cachedIndex, favorites, history] = await Promise.all([
        cache.readIndex(),
        library.listFavorites(),
        library.listHistory(),
      ]);
      if (request !== requestId.current) return;
      const index = cachedIndex.data || {};
      const byKey = itemByKey(index);
      const source = nextTab === 'favorites' ? favorites : history;
      setGroups(index.groups || []);
      setRows(source.map((item: any) => {
        const meta = byKey.get(item.key) || ({} as any);
        return {
          key: item.key,
          name: meta.name || item.label || item.key,
          image: meta.image || null,
          category: meta.category || '',
          at: Number(item.at) || 0,
        };
      }));
      setState('ready');
    } catch (error) {
      if (request !== requestId.current) return;
      setMessage('读取失败：' + errorText(error));
      setState('error');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load(tab);
    return () => { requestId.current += 1; };
  }, [load, tab]));

  const remove = async (key: string) => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setMessage('');
    try {
      const { library } = await getApp();
      if (tab === 'favorites') await library.toggleFavorite(key);
      else await library.removeHistory(key);
      await load(tab);
    } catch (error) {
      setMessage('移除失败：' + errorText(error));
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  const confirmRemove = (item: Row) => {
    const label = tab === 'favorites' ? '收藏' : '浏览记录';
    Alert.alert('移除' + label, '确定移除「' + item.name + '」的' + label + '吗？', [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => { void remove(item.key); } },
    ]);
  };

  const clear = async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setMessage('');
    try {
      const { library } = await getApp();
      if (tab === 'favorites') {
        for (const row of rows) await library.toggleFavorite(row.key);
      } else {
        await library.clearHistory();
      }
      await load(tab);
    } catch (error) {
      setMessage('清空未完成：' + errorText(error));
      // 收藏逐条清除；重新读取以展示已经完成的更改。
      await load(tab, true);
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  const confirmClear = () => {
    const label = tab === 'favorites' ? '收藏' : '浏览历史';
    Alert.alert('清空' + label, '确定清空全部' + label + '吗？此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => { void clear(); } },
    ]);
  };

  const currentLabel = tab === 'favorites' ? '收藏' : '浏览历史';

  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={state === 'ready' ? rows : []}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <View>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>收藏与历史</Text>
            <Text style={styles.subtitle}>收藏的资料和浏览记录都保存在本机。</Text>
          </View>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['favorites', 'history'] as const).map((item) => {
              const selected = tab === item;
              const label = item === 'favorites' ? '收藏' : '浏览历史';
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected, disabled: working }}
                  disabled={working}
                  onPress={() => {
                    if (!selected) {
                      requestId.current += 1;
                      setState('loading');
                      setMessage('');
                      setTab(item);
                    }
                  }}
                  style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.listHeading}>
            <View style={styles.headingText}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{currentLabel}</Text>
              <Text style={styles.count}>
                {state === 'ready' ? '共 ' + rows.length + ' 条' : state === 'loading' ? '正在读取' : '暂时无法读取'}
              </Text>
            </View>
            {state === 'ready' && rows.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'清空全部' + currentLabel}
                accessibilityState={{ disabled: working }}
                disabled={working}
                onPress={confirmClear}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed, working && styles.disabled]}
              >
                <Text style={styles.clearText}>全部清空</Text>
              </Pressable>
            ) : null}
          </View>
          {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        state === 'loading' ? (
          <View style={styles.empty} accessibilityLiveRegion="polite">
            <ActivityIndicator color="#10383A" />
            <Text style={styles.emptyDescription}>正在读取{currentLabel}…</Text>
          </View>
        ) : state === 'error' ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>暂时无法显示{currentLabel}</Text>
            <Text style={styles.emptyDescription}>请重试读取本机数据。</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'重新读取' + currentLabel}
              onPress={() => { void load(tab); }}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>重新读取</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyMark} accessible={false}><View style={styles.emptyMarkLine} /><View style={styles.emptyMarkLineShort} /></View>
            <Text style={styles.emptyTitle}>{tab === 'favorites' ? '还没有收藏' : '还没有浏览记录'}</Text>
            <Text style={styles.emptyDescription}>
              {tab === 'favorites' ? '在档案详情页点击「收藏」，就能在这里找到它。' : '浏览过的档案会显示在这里，方便下次查看。'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const category = categoryName(item.category, groups);
        return (
          <View style={styles.row}>
            <Link href={{ pathname: '/entry/[key]', params: { key: item.key } }} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'查看档案 ' + item.name}
                accessibilityHint="打开档案详情"
                accessibilityState={{ disabled: working }}
                disabled={working}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              >
                <CoverImage path={item.image} category={item.category} style={styles.thumb} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {category ? <Text style={styles.rowMeta}>{category}</Text> : null}
                  {item.at ? <Text style={styles.rowTime}>{tab === 'favorites' ? '收藏于 ' : '浏览于 '}{timeText(item.at)}</Text> : null}
                </View>
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'移除' + item.name + '的' + (tab === 'favorites' ? '收藏' : '浏览记录')}
              accessibilityState={{ disabled: working }}
              disabled={working}
              onPress={() => confirmRemove(item)}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed, working && styles.disabled]}
            >
              <Text style={styles.removeText}>移除</Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F6F2' },
  content: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 40, flexGrow: 1 },
  intro: { marginBottom: 22 },
  title: { color: '#102B2C', fontSize: 28, lineHeight: 36, fontWeight: '700' },
  subtitle: { color: '#526C68', fontSize: 14, lineHeight: 22, marginTop: 6 },
  tabs: { flexDirection: 'row', gap: 8, padding: 5, borderRadius: 16, backgroundColor: '#E7EEE9' },
  tab: { flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12 },
  tabActive: { backgroundColor: '#10383A' },
  tabText: { color: '#365A55', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: '#FFFFFF' },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20, marginBottom: 8 },
  headingText: { flex: 1, minWidth: 0 },
  sectionTitle: { color: '#102B2C', fontSize: 18, lineHeight: 25, fontWeight: '700' },
  count: { color: '#526C68', fontSize: 13, lineHeight: 20, marginTop: 2 },
  clearButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  clearText: { color: '#93483E', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderColor: '#D3E0D8', borderWidth: 1, borderRadius: 16, marginBottom: 10, padding: 10 },
  rowMain: { flex: 1, minWidth: 0, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 58, height: 68, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D3E0D8' },
  rowText: { flex: 1, minWidth: 0, paddingVertical: 3 },
  rowName: { color: '#102B2C', fontSize: 16, lineHeight: 23, fontWeight: '700' },
  rowMeta: { color: '#526C68', fontSize: 13, lineHeight: 19, marginTop: 3 },
  rowTime: { color: '#526C68', fontSize: 12, lineHeight: 18, marginTop: 3 },
  remove: { minWidth: 48, minHeight: 48, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#526C68', fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48 },
  emptyMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#D6EE99', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 20 },
  emptyMarkLine: { width: 24, height: 3, borderRadius: 2, backgroundColor: '#10383A' },
  emptyMarkLineShort: { width: 16, height: 3, borderRadius: 2, backgroundColor: '#10383A', alignSelf: 'center' },
  emptyTitle: { color: '#102B2C', fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: '#526C68', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  error: { color: '#93483E', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  retry: { minHeight: 48, minWidth: 48, marginTop: 16, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#10383A', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
