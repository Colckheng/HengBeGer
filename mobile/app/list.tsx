import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { getApp } from '../src/api/app';
import { categoriesOf, filterItems } from '../src/lib/list';

const PAGE_SIZE = 30;

export default function ListScreen() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [category, setCategory] = useState(params.category || '');
  const [query, setQuery] = useState('');
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

  const view = useMemo(
    () => filterItems(items, { category, q: query, page, limit: PAGE_SIZE }),
    [items, category, query, page],
  );

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={styles.center}><Text style={styles.error}>{message}</Text></View>;

  return (
    <View style={styles.page}>
      <TextInput
        value={query}
        onChangeText={(text) => { setQuery(text); setPage(1); }}
        placeholder="搜索名称或 key"
        placeholderTextColor="#6f6890"
        style={styles.search}
      />
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
              {group.name} {group.count}
            </Text>
          </Pressable>
        )}
      />
      <Text style={styles.total}>共 {view.total} 条 · 第 {view.page}/{view.pageCount} 页</Text>
      <FlatList
        data={view.items}
        numColumns={3}
        keyExtractor={(item: any) => item.key}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/entry/[key]', params: { key: item.key } }} asChild>
            <Pressable style={styles.cell}>
              <GridImage path={item.image} />
              <Text numberOfLines={2} style={styles.cellName}>{item.name || item.key}</Text>
            </Pressable>
          </Link>
        )}
      />
      <View style={styles.pager}>
        <Pressable disabled={view.page <= 1} onPress={() => setPage(view.page - 1)} style={styles.pagerButton}>
          <Text style={styles.pagerText}>上一页</Text>
        </Pressable>
        <Pressable disabled={view.page >= view.pageCount} onPress={() => setPage(view.page + 1)} style={styles.pagerButton}>
          <Text style={styles.pagerText}>下一页</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GridImage({ path }: { path?: string | null }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getApp().then(({ client }) => { if (alive) setUri(client.imageUrl(path)); });
    return () => { alive = false; };
  }, [path]);
  if (!uri) return <View style={styles.cellImage} />;
  return <Image source={{ uri }} style={styles.cellImage} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#e88' },
  search: { backgroundColor: '#171426', color: '#f2eefb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  chipRow: { marginTop: 10, maxHeight: 40 },
  chip: { backgroundColor: '#241f3a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 8 },
  chipActive: { backgroundColor: '#4b3f8f' },
  chipText: { color: '#d7d0ee', fontSize: 12 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  total: { color: '#9c93b8', fontSize: 12, marginVertical: 10 },
  cell: { flex: 1 / 3, maxWidth: '33.33%' },
  cellImage: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#171426' },
  cellName: { color: '#b9b1d4', fontSize: 11, marginTop: 4 },
  pager: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  pagerButton: { flex: 1, backgroundColor: '#2b2450', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  pagerText: { color: '#efe9ff', fontWeight: '600' },
});
