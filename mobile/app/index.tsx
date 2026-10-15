import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { getApp } from '../src/api/app';
import { buildHomeModel, totalCount } from '../src/lib/home';

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
        <View>
          <Text style={styles.title}>向每一份好奇心开放。</Text>
          <Text style={styles.sub}>{total} 份资料 · 已同步到本机</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.world}>{item.title}</Text>
          <Text style={styles.en}>{item.en}</Text>
          <Text style={styles.line}>{item.tagline}</Text>
          <Text style={styles.count}>{item.total} 份资料</Text>
          <View style={styles.quickRow}>
            {item.quick.map((group: any) => (
              <Link key={group.id} href={{ pathname: '/list', params: { category: group.id, title: group.name } }} asChild>
                <Pressable style={styles.chip}><Text style={styles.chipText}>{group.name.replace(/^.*·\s*/, '')} {group.count}</Text></Pressable>
              </Link>
            ))}
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={item.recent}
            keyExtractor={(entry: any) => entry.key}
            renderItem={({ item: entry }) => (
              <Link href={{ pathname: '/entry/[key]', params: { key: entry.key } }} asChild>
                <Pressable style={styles.recent}>
                  {entry.image ? <Image source={{ uri: entry.image }} style={styles.thumb} /> : <View style={styles.thumb} />}
                  <Text numberOfLines={1} style={styles.recentName}>{entry.name}</Text>
                </Pressable>
              </Link>
            )}
          />
        </View>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Link href="/list" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>全部图鉴</Text></Pressable></Link>
          <Link href="/settings" asChild><Pressable style={styles.button}><Text style={styles.buttonText}>设置</Text></Pressable></Link>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#f2eefb', fontSize: 22, fontWeight: '700' },
  sub: { color: '#9c93b8', marginTop: 4, marginBottom: 8 },
  note: { color: '#e8b25c', marginBottom: 8 },
  card: { backgroundColor: '#171426', borderRadius: 16, padding: 16, gap: 6 },
  world: { color: '#f2eefb', fontSize: 20, fontWeight: '700' },
  en: { color: '#6f6890', fontSize: 11, letterSpacing: 1 },
  line: { color: '#c9c2e0', marginTop: 2 },
  count: { color: '#9c93b8', fontSize: 12 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { backgroundColor: '#241f3a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { color: '#d7d0ee', fontSize: 12 },
  recent: { width: 88, marginRight: 10, marginTop: 12 },
  thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: '#241f3a' },
  recentName: { color: '#b9b1d4', fontSize: 11, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { flex: 1, backgroundColor: '#2b2450', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#efe9ff', fontWeight: '600' },
});
