import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { getApp } from '../src/api/app';
import { categoryName, itemByKey } from '../src/lib/labels';
import { CoverImage } from '../src/ui/Cover';

type Row = { key: string; name: string; image: string | null; category: string; at: number };

function timeText(at: number) {
  if (!at) return '';
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<'favorites' | 'history'>('favorites');
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [state, setState] = useState<'loading' | 'ready'>('loading');

  const load = useCallback(async (nextTab: 'favorites' | 'history') => {
    const { cache, library } = await getApp();
    const [cachedIndex, favorites, history] = await Promise.all([
      cache.readIndex(),
      library.listFavorites(),
      library.listHistory(),
    ]);
    const index = cachedIndex.data || {};
    const byKey = itemByKey(index);
    setGroups(index.groups || []);
    const source = nextTab === 'favorites' ? favorites : history;
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
  }, []);

  useFocusEffect(useCallback(() => { load(tab); }, [load, tab]));

  const remove = async (key: string) => {
    const { library } = await getApp();
    if (tab === 'favorites') await library.toggleFavorite(key);
    else await library.removeHistory(key);
    await load(tab);
  };

  const clear = async () => {
    const { library } = await getApp();
    if (tab === 'favorites') {
      for (const row of rows) await library.toggleFavorite(row.key);
    } else {
      await library.clearHistory();
    }
    await load(tab);
  };

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <View style={styles.page}>
      <View style={styles.tabRow}>
        <Pressable onPress={() => { setTab('favorites'); setState('loading'); }} style={[styles.tab, tab === 'favorites' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'favorites' && styles.tabTextActive]}>收藏</Text>
        </Pressable>
        <Pressable onPress={() => { setTab('history'); setState('loading'); }} style={[styles.tab, tab === 'history' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>浏览历史</Text>
        </Pressable>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.total}>共 {rows.length} 条</Text>
        {rows.length > 0 ? (
          <Pressable onPress={clear}><Text style={styles.clearAll}>全部清空</Text></Pressable>
        ) : null}
      </View>
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'favorites' ? '还没有收藏。在档案详情页点「收藏」就会出现在这里。' : '还没有浏览记录。'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Link href={{ pathname: '/entry/[key]', params: { key: item.key } }} asChild>
              <Pressable style={styles.rowMain}>
                <RowImage path={item.image} category={item.category} />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.rowName}>{item.name}</Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>{categoryName(item.category, groups)}</Text>
                  {item.at ? <Text style={styles.rowTime}>{timeText(item.at)}</Text> : null}
                </View>
              </Pressable>
            </Link>
            <Pressable onPress={() => remove(item.key)} style={styles.remove}>
              <Text style={styles.removeText}>移除</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

// 封面：有图走图，无封面/加载失败显示分类文字占位。
function RowImage({ path, category }: { path?: string | null; category?: string | null }) {
  return <CoverImage path={path} category={category} style={styles.thumb} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: { backgroundColor: '#241f3a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabActive: { backgroundColor: '#4b3f8f' },
  tabText: { color: '#d7d0ee', fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  total: { color: '#9c93b8', fontSize: 12 },
  clearAll: { color: '#e88', fontSize: 12 },
  list: { flex: 1 },
  empty: { color: '#9c93b8', fontSize: 13, textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141122', borderRadius: 12, padding: 8, marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#171426' },
  rowText: { flex: 1 },
  rowName: { color: '#f2eefb', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#9c93b8', fontSize: 12, marginTop: 2 },
  rowTime: { color: '#6f6890', fontSize: 11, marginTop: 2 },
  remove: { paddingHorizontal: 10, paddingVertical: 8 },
  removeText: { color: '#8b83a8', fontSize: 12 },
});
