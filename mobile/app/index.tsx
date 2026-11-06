import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApp } from '../src/api/app';
import { buildHomeModel, totalCount } from '../src/lib/home';
import { CoverImage } from '../src/ui/Cover';
import { colors } from '../src/ui/theme';

type HomeWorld = {
  id: string;
  title: string;
  total: number;
  quick: { id: string; name: string; count: number }[];
  recent: { key: string; name: string; image: string | null; category: string }[];
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<HomeWorld[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    let hasCache = false;
    try {
      const { client, cache } = await getApp();
      const cached = await cache.readIndex();
      if (cached.data) {
        hasCache = true;
        setHome(buildHomeModel(cached.data));
        setTotal(totalCount(cached.data));
        setLoading(false);
        setNote(cached.stale ? '正在更新本地缓存' : '');
        if (!force && !cached.stale) return;
      }
      try {
        const index = await client.getIndex();
        setHome(buildHomeModel(index));
        setTotal(totalCount(index));
        setNote('');
        try {
          await cache.writeIndex(index);
        } catch {
          setNote('资料已更新，但无法保存到本地缓存');
        }
      } catch (error: any) {
        setNote(hasCache ? '连接失败，正在显示本地缓存' : '无法加载资料：' + (error?.message || String(error)));
      }
    } catch (error: any) {
      setNote('无法加载资料：' + (error?.message || String(error)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <FlatList
      data={home}
      keyExtractor={(item) => item.id}
      style={styles.screen}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}
      ListHeaderComponent={
        <View>
          <View style={[styles.brand, { paddingTop: insets.top + 20 }]}>
            <View style={styles.brandTop}>
              <View>
                <Text style={styles.eyebrow}>玩家资料库</Text>
                <Text style={styles.brandTitle}>开放图录</Text>
              </View>
              <Link href="/settings" asChild>
                <Pressable accessibilityRole="button" accessibilityLabel="设置" style={styles.settings}><Text style={styles.settingsText}>设置</Text></Pressable>
              </Link>
            </View>
            <Text style={styles.brandDescription}>查找角色、装备与世界资料</Text>
            <Link href="/list" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="搜索图鉴" style={styles.search}>
                <Text style={styles.searchIcon}>⌕</Text><Text style={styles.searchText}>搜索名称或浏览全部图鉴</Text><Text style={styles.arrow}>→</Text>
              </Pressable>
            </Link>
          </View>
          <View style={styles.sectionIntro}>
            <View><Text style={styles.sectionTitle}>探索世界</Text><Text style={styles.sectionSubtitle}>按游戏和分类查找资料</Text></View>
            {!loading && home.length > 0 ? <Text style={styles.total}>{total} 条资料</Text> : null}
          </View>
          {note ? <Text accessibilityLiveRegion="polite" style={styles.note}>{note}</Text> : null}
          {loading ? <View style={styles.loading}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>正在加载资料</Text></View> : null}
          {!loading && home.length === 0 ? (
            <View style={styles.empty}><Text style={styles.muted}>暂时没有可显示的资料</Text><Pressable accessibilityRole="button" accessibilityLabel="重试加载资料" onPress={() => void load(true)} style={styles.retry}><Text style={styles.retryText}>重新加载</Text></Pressable></View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View><Text style={styles.world}>{item.title}</Text><Text style={styles.worldMeta}>{item.total} 条资料</Text></View>
            <Text style={styles.worldMark}>{item.id.toUpperCase()}</Text>
          </View>
          <View style={styles.quickRow}>
            {item.quick.map((group) => (
              <Link key={group.id} href={{ pathname: '/list', params: { category: group.id, title: group.name } }} asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={`${group.name}，${group.count}条资料`} style={styles.chip}><Text style={styles.chipText}>{group.name.replace(/^.*·\s*/, '')} <Text style={styles.chipCount}>{group.count}</Text></Text></Pressable>
              </Link>
            ))}
          </View>
          {item.recent.length > 0 ? (
            <View style={styles.recentSection}>
              <Text style={styles.recentTitle}>近期条目</Text>
              <View style={styles.recentRow}>
                {item.recent.map((entry) => (
                  <Link key={entry.key} href={{ pathname: '/entry/[key]', params: { key: entry.key } }} asChild>
                    <Pressable accessibilityRole="button" accessibilityLabel={`查看${entry.name}`} style={styles.recent}>
                      <CoverImage path={entry.image} category={entry.category} style={styles.thumb} />
                      <Text numberOfLines={2} style={styles.recentName}>{entry.name}</Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { paddingBottom: 24 },
  brand: { backgroundColor: colors.brand, paddingHorizontal: 20, paddingBottom: 24 },
  brandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#C4D9CF', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  brandTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', marginTop: 5 },
  brandDescription: { color: '#C4D9CF', fontSize: 14, marginTop: 8 },
  settings: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#71918A', borderRadius: 12, paddingHorizontal: 12 },
  settingsText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  search: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 22, gap: 10 },
  searchIcon: { fontSize: 25, color: colors.ink },
  searchText: { fontSize: 15, color: colors.ink, flex: 1, fontWeight: '600' },
  arrow: { fontSize: 22, color: colors.ink },
  sectionIntro: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  sectionSubtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  total: { color: colors.muted, fontSize: 13 },
  note: { color: colors.ink, backgroundColor: colors.soft, marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 10, fontSize: 14 },
  loading: { padding: 28, alignItems: 'center', gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', padding: 24, gap: 12 },
  retry: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10, backgroundColor: colors.brand },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  world: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  worldMeta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  worldMark: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.soft, paddingHorizontal: 12, borderRadius: 10 },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chipCount: { color: colors.muted, fontWeight: '400' },
  recentSection: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 18, paddingTop: 16 },
  recentTitle: { color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  recent: { width: '30%', flexGrow: 1, maxWidth: '33%', minHeight: 48 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.soft },
  recentName: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 6 },
});
