import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { getApp } from '../src/api/app';
import { categoriesOf, filterItems } from '../src/lib/list';
import { CoverImage } from '../src/ui/Cover';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 200;

export default function ListScreen() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [category, setCategory] = useState(params.category || '');
  const [query, setQuery] = useState('');
  // 搜索防抖：输入框立刻回显，过滤延迟 200ms。2675 条全量 toLowerCase 匹配
  // 每个按键都跑一遍会让打字明显卡手，低端机上更明显。
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const { client, cache } = await getApp();
    const cached = await cache.readIndex();
    if (cached.data) {
      setItems(cached.data.items || []);
      setCategories(categoriesOf(cached.data));
      setState('ready');
    }
    try {
      const index = await client.getIndex();
      await cache.writeIndex(index);
      setItems(index.items || []);
      setCategories(categoriesOf(index));
      setState('ready');
    } catch (error: any) {
      if (!cached.data) { setMessage(error?.message || String(error)); setState('error'); }
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCategory(params.category || ''); setPage(1); }, [params.category]);

  // 防抖：连续输入只在停顿 200ms 后触发一次过滤。卸载时清掉未触发的定时器，
  // 否则切走后会 setState 到已卸载的组件上。
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const view = useMemo(
    () => filterItems(items, { category, q: debouncedQuery, page, limit: PAGE_SIZE }),
    [items, category, debouncedQuery, page],
  );

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={styles.center}><Text style={styles.error}>{message}</Text></View>;

  return (
    <View style={styles.page}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={(text) => { setQuery(text); setPage(1); }}
          placeholder="搜索名称或 key"
          placeholderTextColor="#6f6890"
          returnKeyType="search"
          style={styles.search}
        />
        {query ? (
          <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); setPage(1); }} style={styles.clear}>
            <Text style={styles.clearText}>清除</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        data={[{ id: '', name: '全部', count: items.length }, ...categories]}
        keyExtractor={(group: any) => group.id || 'all'}
        renderItem={({ item: group }) => (
          <Pressable
            onPress={() => { setCategory(group.id); setPage(1); }}
            style={[styles.chip, category === group.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === group.id && styles.chipTextActive]}>
              {group.name.replace(/^.*·\s*/, '')} {group.count}
            </Text>
          </Pressable>
        )}
      />
      <View style={styles.totalRow}>
        <Text style={styles.total}>共 {view.total} 条</Text>
        <Text style={styles.total}>第 {view.page}/{view.pageCount} 页</Text>
      </View>
      <FlatList
        style={styles.grid}
        data={view.items}
        numColumns={3}
        keyExtractor={(item: any) => item.key}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.empty}>没有匹配的条目，换个关键词或分类试试。</Text>}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/entry/[key]', params: { key: item.key } }} asChild>
            <Pressable style={styles.cell}>
              <GridImage path={item.image} category={item.category} />
              <Text numberOfLines={2} style={styles.cellName}>{item.name || item.key}</Text>
            </Pressable>
          </Link>
        )}
      />
      <View style={styles.pager}>
        <Pressable disabled={view.page <= 1} onPress={() => setPage(view.page - 1)} style={[styles.pagerButton, view.page <= 1 && styles.pagerOff]}>
          <Text style={[styles.pagerText, view.page <= 1 && styles.pagerTextOff]}>上一页</Text>
        </Pressable>
        <Pressable disabled={view.page >= view.pageCount} onPress={() => setPage(view.page + 1)} style={[styles.pagerButton, view.page >= view.pageCount && styles.pagerOff]}>
          <Text style={[styles.pagerText, view.page >= view.pageCount && styles.pagerTextOff]}>下一页</Text>
        </Pressable>
      </View>
    </View>
  );
}

// 封面：有图走图，无封面/加载失败显示分类文字占位（不再是一块死灰色）。
function GridImage({ path, category }: { path?: string | null; category?: string | null }) {
  return <CoverImage path={path} category={category} style={styles.cellImage} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#e88' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, backgroundColor: '#171426', color: '#f2eefb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  clear: { backgroundColor: '#241f3a', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  clearText: { color: '#d7d0ee', fontSize: 12 },
  empty: { color: '#9c93b8', fontSize: 13, textAlign: 'center', paddingVertical: 40 },
  chipRow: { marginTop: 10, maxHeight: 40 },
  grid: { flex: 1 },
  chip: { backgroundColor: '#241f3a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 },
  chipActive: { backgroundColor: '#4b3f8f' },
  chipText: { color: '#d7d0ee', fontSize: 12 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  total: { color: '#9c93b8', fontSize: 12 },
  cell: { flex: 1 / 3, maxWidth: '33.33%' },
  cellImage: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#171426' },
  cellName: { color: '#b9b1d4', fontSize: 11, marginTop: 4 },
  pager: { flexDirection: 'row', gap: 12, paddingTop: 10 },
  pagerButton: { flex: 1, backgroundColor: '#2b2450', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  pagerOff: { backgroundColor: '#1b1730' },
  pagerText: { color: '#efe9ff', fontWeight: '600' },
  pagerTextOff: { color: '#6f6890' },
});
