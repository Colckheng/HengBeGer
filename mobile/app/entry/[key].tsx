import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getApp } from '../../src/api/app';
import { prepareReaderContent, prepareSections } from '../../src/content/content';
import { describeFields } from '../../src/lib/fields';
import { categoryName } from '../../src/lib/labels';
import { dropIdLines, stripGameTags } from '../../src/lib/reader';
import { groupSections, handleReaderLink, readerParts, splitBlocks } from '../../src/lib/sections';
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
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [fullReader, setFullReader] = useState(false);
  const [showParts, setShowParts] = useState(true);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const readingY = useRef(0);
  const goReading = () => requestAnimationFrame(() => scroll.current?.scrollTo({ y: readingY.current, animated: false }));

  const load = useCallback(async () => {
    const current = ++request.current;
    const active = () => request.current === current;
    setState('loading');
    setMessage('');
    setNotice('');
    if (!key) { setMessage('缺少档案标识'); setState('error'); return; }
    let cachedData: any = null;
    try {
      const { client, cache, library } = await getApp();
      try { cachedData = (await cache.readEntry(key))?.data; } catch { /* 网络仍可使用 */ }
      if (!active()) return;
      if (cachedData) {
        setEntry(cachedData);
        setImage(client.imageUrl(cachedData.imageLarge || cachedData.image));
        setNotice('正在显示缓存，正在检查更新。');
        setState('ready');
      }
      void library.isFavorite(key).then((value: boolean) => { if (active()) setFavorite(value); }).catch(() => {});
      let fresh;
      try {
        fresh = await client.getEntry(key);
      } catch (error: any) {
        if (!active()) return;
        if (cachedData) setNotice('网络读取失败，当前显示缓存。');
        else { setMessage(error?.message || String(error)); setState('error'); }
        return;
      }
      if (!active()) return;
      setEntry(fresh);
      setImage(client.imageUrl(fresh.imageLarge || fresh.image));
      setNotice('');
      setState('ready');
      const results = await Promise.allSettled([
        cache.writeEntry(key, fresh),
        library.pushHistory(key, fresh.name || key),
      ]);
      if (active() && results.some(result => result.status === 'rejected')) setNotice('内容已加载，但缓存或浏览历史保存失败。');
    } catch (error: any) {
      if (active()) { setMessage(error?.message || String(error)); setState('error'); }
    }
  }, [key]);

  useEffect(() => {
    setEntry(null); setSelectedSection(null); setSelectedPart(null); setFullReader(false); setFavorite(false);
    void load();
    return () => { request.current += 1; };
  }, [load]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fullReader) { setFullReader(false); goReading(); return true; }
      if (selectedPart != null) { setSelectedPart(null); setShowParts(true); goReading(); return true; }
      if (selectedSection != null) { setSelectedSection(null); setShowParts(false); goReading(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [fullReader, selectedPart, selectedSection]));

  // 正文里的站内条目链接（[名称](entry:xxx)）：留在 App 内跳转，别交给 Linking。
  const openEntryLink = (url: string) => handleReaderLink(url, (target: string) => {
    router.push({ pathname: '/entry/[key]', params: { key: target } });
  });

  const sections = useMemo(() => {
    if (!entry) return [];
    return prepareSections(entry)
      .map((section: any) => ({ ...section, body: dropIdLines(stripGameTags(prepareReaderContent(section.body || '', entry.key || key))).trim() }))
      .filter((section: any) => section.body.length > 0)
      .map((section: any, index: number) => ({ ...section, id: String(index) }));
  }, [entry, key]);
  const groups = useMemo(() => groupSections(sections), [sections]);
  const sectionReader = useMemo(() => readerParts(selectedSection == null ? '' : sections[selectedSection]?.body || ''), [sections, selectedSection]);
  const parts = sectionReader.parts;
  const rows = useMemo(() => (entry ? describeFields(entry) : []), [entry]);

  if (state === 'loading') return <View style={styles.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={styles.center}><Text style={styles.error}>{message}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.fav}><Text style={styles.favText}>重试</Text></Pressable></View>;
  if (!entry) return null;

  const reader = dropIdLines(stripGameTags(prepareReaderContent(entry.body || '', entry.key || key)));
  const selected = selectedSection == null ? null : sections[selectedSection];
  const content = selectedPart == null ? selected?.body || '' : sectionReader.preamble + (parts[selectedPart]?.body || '');
  const blocks = selected ? splitBlocks(content) : [];

  return (
    <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={styles.page}>
      {image ? (
        <View style={styles.heroWrap}>
          <Image source={{ uri: image }} style={styles.hero} resizeMode="contain" accessibilityLabel={`${entry.name || entry.rawName || key}的图片`} />
        </View>
      ) : null}
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.meta}>{categoryName(entry.category)}</Text>
          <Text style={styles.name}>{entry.name || entry.rawName || key}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? '取消收藏' : '收藏'}
            accessibilityState={{ selected: favorite }}
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
              <Text style={styles.kvValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{notice}</Text> : null}
      <View onLayout={(event) => { readingY.current = event.nativeEvent.layout.y; }}>
      {!selected && !fullReader ? groups.map((group: any) => (
        <View key={group.id} style={styles.card}>
          <View style={styles.cardHead}><Text style={styles.cardTitle}>{group.name}</Text></View>
          {group.sections.map((section: any) => (
            <Pressable key={section.id} accessibilityRole="button" onPress={() => { setSelectedSection(Number(section.id)); setSelectedPart(null); setShowParts(false); goReading(); }} style={styles.navRow}>
              <Text style={styles.sectionTitle}>{section.title}</Text><Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )) : null}
      {!selected && !fullReader && entry.body ? <Pressable accessibilityRole="button" onPress={() => { setFullReader(true); goReading(); }} style={styles.navRow}><Text style={styles.favText}>完整阅读原文 ›</Text></Pressable> : null}
      {fullReader ? (
        <View style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => { setFullReader(false); goReading(); }} style={styles.navRow}><Text style={styles.favText}>‹ 返回章节目录</Text></Pressable>
          <Text selectable style={styles.rawText}>{entry.body}</Text>
        </View>
      ) : null}
      {selected ? (
        <View style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => { setSelectedSection(null); setSelectedPart(null); goReading(); }} style={styles.navRow}><Text style={styles.favText}>‹ 返回章节目录</Text></Pressable>
          <Text accessibilityRole="header" style={styles.cardTitle}>{selected.title}</Text>
          {parts.length ? (
            <View style={styles.section}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showParts }} onPress={() => setShowParts(!showParts)} style={styles.navRow}><Text style={styles.favText}>{showParts ? '收起小节目录' : `选择小节 · ${selectedPart == null ? '完整章节' : parts[selectedPart]?.title || '完整章节'}`}</Text></Pressable>
              {showParts ? <>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedPart == null }} onPress={() => { setSelectedPart(null); setShowParts(false); }} style={styles.navRow}><Text style={styles.favText}>完整章节{selectedPart == null ? ' ✓' : ''}</Text></Pressable>
                {parts.map((part, index) => (
                  <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected: selectedPart === index }} onPress={() => { setSelectedPart(index); setShowParts(false); goReading(); }} style={styles.navRow}>
                    <Text style={styles.navText}>{part.title}{parts.filter(item => item.title === part.title).length > 1 ? `（${parts.slice(0, index + 1).filter(item => item.title === part.title).length}）` : ''}{selectedPart === index ? ' ✓' : ''}</Text>
                  </Pressable>
                ))}
              </> : null}
            </View>
          ) : null}
          <View style={styles.section}>
            {blocks.map((block: any, index: number) => {
              if (block.kind !== 'table') return <Markdown key={index} style={markdownStyles} onLinkPress={openEntryLink}>{block.text}</Markdown>;
              if (!block.table) return <Markdown key={index} style={markdownStyles} onLinkPress={openEntryLink}>{'```\n' + (block.tableLines || []).join('\n') + '\n```'}</Markdown>;
              const tables = splitTables(block.tableLines || []);
              return <View key={index}>{(tables.length ? tables : [block.table]).map((table: any, tableIndex: number) => <SubTable key={tableIndex} table={table} markdownStyles={markdownStyles} onLinkPress={openEntryLink} />)}</View>;
            })}
          </View>
        </View>
      ) : null}
      {groups.length === 0 && !fullReader && reader ? <Markdown style={markdownStyles} onLinkPress={openEntryLink}>{reader}</Markdown> : null}
      {!entry.body && groups.length === 0 ? <Text style={styles.meta}>这条档案没有正文。</Text> : null}
      </View>
    </ScrollView>
  );
}

const markdownStyles = {
  body: { color: '#102B2C', fontSize: 15, lineHeight: 24 },
  heading1: { color: '#10383A', fontSize: 20, marginTop: 12 },
  heading2: { color: '#10383A', fontSize: 18, marginTop: 10 },
  strong: { color: '#10383A' },
  link: { color: '#176665', textDecorationLine: 'underline' as const },
  code_inline: { color: '#285C4D' },
  table: { borderWidth: 0 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  // 数据里的 > 引用块（2018 条条目有，比如 zzz 物品的 "> English name: ..."）。
  // 不显式给样式的话，react-native-markdown-display 会画成白底方块，深色主题下像
  // 一张贴错位置的卡片（用户截图里那两块白底高亮）。
  blockquote: {
    backgroundColor: '#E7EEE9',
    borderLeftWidth: 3,
    borderLeftColor: '#6C9881',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F2' },
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#963F36' },
  heroWrap: { backgroundColor: '#E7EEE9', borderRadius: 20, overflow: 'hidden' },
  hero: { width: '100%', height: 260, backgroundColor: '#E7EEE9' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20, backgroundColor: '#E7EEE9' },
  headText: { flex: 1, alignItems: 'flex-start', gap: 8 },
  name: { color: '#10383A', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  meta: { color: '#4D6C63', fontSize: 13, lineHeight: 20 },
  fav: { minHeight: 48, justifyContent: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 18, borderRadius: 24 },
  favActive: { backgroundColor: '#D6EE99' },
  favText: { color: '#10383A', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 16, paddingBottom: 12 },
  cardHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: '#10383A', fontSize: 17, fontWeight: '700', flexShrink: 1 },
  cardHint: { color: '#58746C', fontSize: 13 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { color: '#58746C', fontSize: 16 },
  kvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E7EEE9' },
  kvKey: { color: '#58746C', width: '30%', fontSize: 14, lineHeight: 21 },
  kvValue: { color: '#102B2C', flex: 1, fontSize: 14, lineHeight: 22 },
  section: { paddingTop: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#E7EEE9' },
  sectionTitle: { color: '#10383A', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  navRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E7EEE9' },
  navText: { color: '#10383A', fontSize: 15, lineHeight: 23, flexShrink: 1 },
  rawText: { color: '#102B2C', fontSize: 15, lineHeight: 24 },
});