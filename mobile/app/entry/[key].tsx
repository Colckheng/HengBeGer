import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getApp } from '../../src/api/app';
import { prepareReaderContent, prepareSections } from '../../src/content/content';
import { describeFields } from '../../src/lib/fields';
import { dropIdLines, entryKeyFromLink, stripGameTags } from '../../src/lib/reader';
import { groupSections } from '../../src/lib/sections';
import { splitTables } from '../../src/lib/values';
import { SubTable } from '../../src/ui/Bars';

export default function EntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<any>(null);
  const [image, setImage] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [folded, setFolded] = useState<Record<string, boolean>>({});

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

  // 章节清洗 + 分区：服务端平均 18.9 个平铺 section，收成 5 个可折叠分区。
  const groups = useMemo(() => {
    if (!entry) return [];
    const sections = prepareSections(entry)
      .map((section: any) => ({ ...section, body: dropIdLines(stripGameTags(section.body || '')).trim() }))
      .filter((section: any) => section.body.length > 0);
    return groupSections(sections);
  }, [entry]);

  const rows = useMemo(() => (entry ? describeFields(entry) : []), [entry]);

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={styles.center}><Text style={styles.error}>{message}</Text></View>;
  if (!entry) return null;

  const reader = dropIdLines(stripGameTags(prepareReaderContent(entry.body || '', entry.key || key)));
  const isFolded = (id: string, def: boolean) => (folded[id] ?? def);
  const toggle = (id: string, def: boolean) => setFolded((prev) => ({ ...prev, [id]: !(prev[id] ?? def) }));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headRow}>
        {image ? <Image source={{ uri: image }} style={styles.hero} resizeMode="contain" /> : null}
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={3}>{entry.name || entry.rawName || key}</Text>
          <Text style={styles.meta} numberOfLines={2}>{entry.category}</Text>
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
      </View>

      {rows.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>属性</Text>
            <Text style={styles.cardHint}>{rows.length} 项</Text>
          </View>
          {rows.map((row: any) => (
            <View key={row.label + row.value} style={styles.kvRow}>
              <Text style={styles.kvKey}>{row.label}</Text>
              <Text numberOfLines={3} style={styles.kvValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {groups.map((group: any) => {
        const closed = isFolded(group.id, group.fold);
        return (
          <View key={group.id} style={styles.card}>
            <Pressable onPress={() => toggle(group.id, group.fold)} style={styles.cardHead}>
              <Text style={styles.cardTitle}>{group.name}</Text>
              <View style={styles.headRight}>
                <Text style={styles.cardHint}>{group.sections.length} 节</Text>
                <Text style={styles.chevron}>{closed ? '▸' : '▾'}</Text>
              </View>
            </Pressable>
            {closed ? null : group.sections.map((section: any) => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.blocks.map((block: any, index: number) => {
                  if (block.kind !== 'table') {
                    return (
                      <Markdown
                        key={index}
                        style={markdownStyles}
                        onLinkPress={(url: string) => openEntryLink(url)}
                      >
                        {block.text}
                      </Markdown>
                    );
                  }
                  if (!block.table) return null;
                  // 一个 block 里可能粘着多张子表（晋阶表 97 行其实是 9 张），逐张渲染。
                  // splitTables 认「表头 + 分隔行」定位边界，比只按首个表头切准确得多。
                  const parts = splitTables(block.tableLines || []);
                  const tables = parts.length ? parts : [block.table];
                  return (
                    <View key={index}>
                      {tables.map((part: any, partIndex: number) => (
                        <SubTable key={partIndex} table={part} markdownStyles={markdownStyles} onLinkPress={openEntryLink} />
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
            {group.hidden > 0 ? (
              <Text style={styles.moreHint}>还有 {group.hidden} 个同类章节未展示</Text>
            ) : null}
          </View>
        );
      })}

      {groups.length === 0 && reader ? (
        <Markdown style={markdownStyles} onLinkPress={(url: string) => openEntryLink(url)}>{reader}</Markdown>
      ) : null}
      {!entry.body && groups.length === 0 ? <Text style={styles.meta}>这条档案没有正文。</Text> : null}
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
  table: { borderWidth: 0 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  // 数据里的 > 引用块（2018 条条目有，比如 zzz 物品的 "> English name: ..."）。
  // 不显式给样式的话，react-native-markdown-display 会画成白底方块，深色主题下像
  // 一张贴错位置的卡片（用户截图里那两块白底高亮）。
  blockquote: {
    backgroundColor: '#1b1730',
    borderLeftWidth: 3,
    borderLeftColor: '#4b3f8f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
};

const styles = StyleSheet.create({
  page: { padding: 12, gap: 10, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#e88' },
  hero: { width: 108, height: 108, borderRadius: 12, backgroundColor: '#171426' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headText: { flex: 1, gap: 8 },
  name: { color: '#f2eefb', fontSize: 20, fontWeight: '700' },
  meta: { color: '#8b83a8', fontSize: 12 },
  fav: { backgroundColor: '#241f3a', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, alignSelf: 'flex-start' },
  favActive: { backgroundColor: '#4b3f8f' },
  favText: { color: '#efe9ff', fontWeight: '600' },
  card: { backgroundColor: '#141122', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  cardTitle: { color: '#f2eefb', fontSize: 15, fontWeight: '700' },
  cardHint: { color: '#8b83a8', fontSize: 12 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { color: '#8b83a8', fontSize: 12 },
  kvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#1d1832' },
  kvKey: { color: '#8b83a8', width: 76, fontSize: 13 },
  kvValue: { color: '#d7d0ee', flex: 1, fontSize: 13, lineHeight: 20 },
  kvTable: { marginTop: 2 },
  section: { marginTop: 8 },
  sectionTitle: { color: '#efe9ff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  moreHint: { color: '#8b83a8', fontSize: 12, marginTop: 6 },
});