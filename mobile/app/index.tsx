import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { getApp } from '../src/api/app';
import { buildHomeModel, totalCount } from '../src/lib/home';
import { CoverImage } from '../src/ui/Cover';

export default function HomeScreen() {
  const [home, setHome] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  const load = useCallback(async (force = false) => {
    const { client, cache } = await getApp();
    const absolute = (model: any[]) => model.map((world) => ({
      ...world,
      recent: world.recent.map((entry: any) => ({ ...entry, image: client.imageUrl(entry.image) })),
    }));
    const cached = await cache.readIndex();
    if (cached.data) {
      const model = absolute(buildHomeModel(cached.data));
      setHome(model);
      setTotal(totalCount(cached.data));
      setLoading(false);
      if (!force && !cached.stale) return;
    }
    try {
      const index = await client.getIndex();
      await cache.writeIndex(index);
      setHome(absolute(buildHomeModel(index)));
      setTotal(totalCount(index));
      setNote('');
    } catch (error: any) {
      setNote(cached.data ? '离线：显示的是本地缓存' : '连不上服务器：' + (error?.message || error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <FlatList
      data={home}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true)} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.sub}>{total} 份资料 · 已同步到本机</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.world}>{item.title}</Text>
            <Text style={styles.count}>{item.total}</Text>
          </View>
          <View style={styles.quickRow}>
            {item.quick.map((group: any) => (
              <Link key={group.id} href={{ pathname: '/list', params: { category: group.id, title: group.name } }} asChild>
                <Pressable style={styles.chip}><Text style={styles.chipText}>{group.name.replace(/^.*·\s*/, '')} {group.count}</Text></Pressable>
              </Link>
            ))}
          </View>
          {item.recent.length > 0 ? (
            <View style={styles.recentRow}>
              {item.recent.map((entry: any) => (
                <Link key={entry.key} href={{ pathname: '/entry/[key]', params: { key: entry.key } }} asChild>
                  <Pressable style={styles.recent}>
                    <CoverImage path={entry.image} category={entry.category} style={styles.thumb} />
                    <Text numberOfLines={2} style={styles.recentName}>{entry.name}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          ) : null}
        </View>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Link href="/list" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>全部图鉴</Text></Pressable></Link>
          <Link href="/library" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>收藏与历史</Text></Pressable></Link>
          <Link href="/settings" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>设置</Text></Pressable></Link>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: 2, paddingBottom: 4 },
  sub: { color: '#9c93b8', fontSize: 12 },
  note: { color: '#e8b25c', fontSize: 12 },
  card: { backgroundColor: '#171426', borderRadius: 14, padding: 12, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  world: { color: '#f2eefb', fontSize: 17, fontWeight: '700' },
  count: { color: '#9c93b8', fontSize: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#241f3a', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  chipText: { color: '#d7d0ee', fontSize: 11 },
  recentRow: { flexDirection: 'row', gap: 8 },
  recent: { flex: 1, alignItems: 'center' },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#241f3a' },
  recentName: { color: '#b9b1d4', fontSize: 9, lineHeight: 12, marginTop: 4, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, backgroundColor: '#2b2450', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#efe9ff', fontWeight: '600' },
});
