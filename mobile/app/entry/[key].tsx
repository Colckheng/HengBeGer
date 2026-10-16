import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getApp } from '../../src/api/app';
import { prepareReaderContent, prepareSections } from '../../src/content/content';
import { describeFields } from '../../src/lib/fields';
import { dropIdLines, entryKeyFromLink, stripGameTags } from '../../src/lib/reader';

export default function EntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<any>(null);
  const [image, setImage] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!key) return;
    const { client, cache, library } = await getApp();
    const cached = await cache.readEntry(key);
    if (cached?.data) {
      setEntry(cached.data);
      setImage(client.imageUrl(cached.data.imageLarge || cached.data.image));
      setState('ready');
    }
    setFavorite(await library.isFavorite(key));
    try {
      const fresh = await client.getEntry(key);
      await cache.writeEntry(key, fresh);
      await library.pushHistory(key, fresh.name || key);
      setEntry(fresh);
      setImage(client.imageUrl(fresh.imageLarge || fresh.image));
      setState('ready');
    } catch (error: any) {
      if (!cached?.data) { setMessage(error?.message || String(error)); setState('error'); }
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  // 正文里的站内条目链接（[名称](entry:xxx)）：留在 App 内跳转，别交给 Linking。
  const openEntryLink = (url: string) => {
    const target = entryKeyFromLink(url);
    if (target) {
      router.push({ pathname: '/entry/[key]', params: { key: target } });
      return true;
    }
    return false;
  };

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={styles.center}><Text style={styles.error}>{message}</Text></View>;
  if (!entry) return null;

  const reader = dropIdLines(stripGameTags(prepareReaderContent(entry.body || '', entry.key || key)));
  // 清洗之后整节只剩空行的章节不再展示（例：某些条目的「概述」只有一行 **ID**：1001）
  const sections = prepareSections(entry)
    .map((section: any) => ({ ...section, body: dropIdLines(stripGameTags(section.body || '')).trim() }))
    .filter((section: any) => section.body.length > 0);
  const rows = describeFields(entry);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {image ? <Image source={{ uri: image }} style={styles.hero} resizeMode="contain" /> : null}
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text style={styles.name} numberOfLines={2}>{entry.name || entry.rawName || key}</Text>
          <Text style={styles.meta} numberOfLines={1}>{entry.category}</Text>
        </View>
        <Pressable
          onPress={async () => {
            const { library } = await getApp();
            const next = await library.toggleFavorite(key, entry.name || key);
            setFavorite(next.active);
          }}
          style={[styles.fav, favorite && styles.favActive]}
        >
          <Text style={styles.favText}>{favorite ? '已收藏' : '收藏'}</Text>
        </Pressable>
      </View>

      {rows.length > 0 ? (
        <View style={styles.table}>
          {rows.map((row) => (
            <View key={row.label + row.value} style={styles.row}>
              <Text style={styles.cellKey}>{row.label}</Text>
              <Text numberOfLines={2} style={styles.cellValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {sections.map((section: any) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Markdown style={markdownStyles} onLinkPress={(url: string) => openEntryLink(url)}>{section.body}</Markdown>
        </View>
      ))}

      {sections.length === 0 && reader ? (
        <Markdown style={markdownStyles} onLinkPress={(url: string) => openEntryLink(url)}>{reader}</Markdown>
      ) : null}
      {!entry.body && sections.length === 0 ? <Text style={styles.meta}>这条档案没有正文。</Text> : null}
    </ScrollView>
  );
}

const markdownStyles = {
  body: { color: '#d7d0ee', fontSize: 14, lineHeight: 22 },
  heading1: { color: '#f2eefb', fontSize: 18, marginTop: 12 },
  heading2: { color: '#f2eefb', fontSize: 16, marginTop: 10 },
  strong: { color: '#fff' },
  link: { color: '#8ea8ff' },
  code_inline: { color: '#e8b25c' },
};

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#e88' },
  hero: { width: '100%', height: 180, borderRadius: 16, backgroundColor: '#171426' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleText: { flex: 1 },
  name: { color: '#f2eefb', fontSize: 20, fontWeight: '700' },
  meta: { color: '#8b83a8', fontSize: 12, marginTop: 2 },
  fav: { backgroundColor: '#241f3a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  favActive: { backgroundColor: '#4b3f8f' },
  favText: { color: '#efe9ff', fontWeight: '600' },
  table: { backgroundColor: '#141122', borderRadius: 12, paddingVertical: 4, marginTop: 6 },
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6 },
  cellKey: { color: '#8b83a8', width: 96 },
  cellValue: { color: '#d7d0ee', flex: 1 },
  section: { marginTop: 12 },
  sectionTitle: { color: '#f2eefb', fontSize: 16, fontWeight: '700', marginBottom: 6 },
});
