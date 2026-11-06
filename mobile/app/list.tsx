import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { getApp } from '../src/api/app';
import { WORLDS } from '../src/lib/home';
import { categoryName } from '../src/lib/labels';
import { applyFacets, categoriesInScope, categoriesOf, categoryChipLabel, changeSeason, changeScope, facetValues, filterFieldsFor, filterItems, scopeCategory, toggleFacet } from '../src/lib/list';
import { Chip, FilterRow } from '../src/ui/Filter';
import { CoverImage } from '../src/ui/Cover';
import { colors } from '../src/ui/theme';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 200;
const PAGE_PADDING = 20;
const GRID_GAP = 10;

type Category = { id: string; name: string; count: number };
type Entry = { key: string; id?: string | number; name?: string; rawName?: string; image?: string | null; imageLarge?: string | null; category?: string | null; fields?: Record<string, unknown> };

/** 从进入时的 category 参数还原世界与分类两级。 */
function scopeFromParam(param?: string) {
  const value = String(param || '');
  if (!value) return { world: '', category: '' };
  const parts = value.split('/');
  if (parts.length === 1) return { world: parts[0], category: '' };
  const season = parts[1];
  return { world: parts[0], category: value, season: /^season\d+$/.test(season || '') ? season : undefined };
}

export default function ListScreen() {
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const { width, fontScale } = useWindowDimensions();
  const [items, setItems] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [world, setWorld] = useState('');
  const [category, setCategory] = useState('');
  const [facets, setFacets] = useState<Record<string, string[]>>({});
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [season, setSeason] = useState('season1');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const hasData = useRef(false);
  const loading = useRef(false);
  const listRef = useRef<FlatList<Entry>>(null);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setRefreshing(true);
    if (!hasData.current) setState('loading');
    try {
      const { client, cache } = await getApp();
      const cached = await cache.readIndex().catch(() => null);
      if (cached?.data) {
        setItems(cached.data.items || []);
        setCategories(categoriesOf(cached.data));
        hasData.current = true;
        setState('ready');
      }
      const index = await client.getIndex();
      setItems(index.items || []);
      setCategories(categoriesOf(index));
      hasData.current = true;
      setNotice('');
      setMessage('');
      setState('ready');
      try {
        await cache.writeIndex(index);
      } catch {
        setNotice('资料已更新，但未能保存到本地缓存');
      }
    } catch (error: any) {
      if (hasData.current) {
        setNotice('暂时无法更新，正在显示本地缓存');
        setState('ready');
      } else {
        setMessage(error?.message || String(error));
        setState('error');
      }
    } finally {
      loading.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const next = scopeFromParam(params.category);
    setWorld(next.world);
    setCategory(next.category);
    if (next.season) setSeason(next.season);
    setFacets({});
    setPage(1);
  }, [params.category]);

  // 输入立即回显，大索引的全文过滤在停顿后进行。
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const scope = scopeCategory(world, season);
  const visibleGroups = useMemo(
    () => (world ? categoriesInScope(categories, world, season) : categories),
    [categories, world, season],
  );
  const selectedCategory = categories.find((group) => group.id === category);
  const filterFields = useMemo(() => (category ? filterFieldsFor(category) : []), [category]);
  const facetOptions = useMemo(() => (
    filterFields.map((field) => ({ field, ...facetValues(items, category, field) }))
  ), [filterFields, items, category]);
  const activeFacetCount = Object.values(facets).reduce((count, values) => count + values.length, 0);
  const worldTitle = WORLDS.find((item) => item.id === world)?.title || world;
  const heading = category
    ? (selectedCategory?.name || params.title || category)
    : (world ? worldTitle : '全部资料');
  const view = useMemo(
    () => filterItems(applyFacets(items, facets), { scope, category, q: debouncedQuery, page, limit: PAGE_SIZE }),
    [items, facets, scope, category, debouncedQuery, page],
  );
  const columns = width < 340 || fontScale >= 1.6 ? 1 : 2;
  const cardWidth = Math.max(0, (width - PAGE_PADDING * 2 - GRID_GAP * (columns - 1)) / columns);
  const searchPending = query !== debouncedQuery;
  const hasCondition = Boolean(query) || activeFacetCount > 0;

  const selectWorld = (id: string) => {
    const next = changeScope(id === 'currency' ? scopeCategory('currency', season) : id);
    setWorld(id);
    setCategory(id === 'currency' ? scopeCategory('currency', season) : '');
    setFacets(next.facets);
    setPage(1);
  };
  const selectCategory = (id: string) => {
    const parts = id.split('/');
    const next = changeScope(id);
    setWorld(parts[0]);
    setCategory(id);
    if (/^season\d+$/.test(parts[1] || '')) setSeason(parts[1]);
    setFacets(next.facets);
    setPage(1);
  };
  const selectSeason = (nextSeason: string) => {
    if (nextSeason === season) return;
    const current = category || scopeCategory('currency', season);
    const next = changeSeason(current, nextSeason, facets, items);
    setSeason(nextSeason);
    setWorld('currency');
    setCategory(next.category);
    setFacets(next.facets);
    setPage(1);
  };
  const setFacet = (field: string, value: string) => {
    setFacets((prev) => toggleFacet(prev, field, value));
    setPage(1);
  };
  const clearFacets = () => {
    setFacets({});
    setPage(1);
  };
  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
  };
  const clearConditions = () => {
    clearSearch();
    clearFacets();
  };
  const goToPage = (next: number) => {
    setPage(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  if (state !== 'ready') {
    return (
      <View style={styles.statePage}>
        <View style={styles.stateCard}>
          {state === 'loading' ? <ActivityIndicator size="large" color={colors.brand} /> : null}
          <Text accessibilityRole="header" style={styles.stateTitle}>
            {state === 'loading' ? '正在加载图鉴' : '暂时无法加载图鉴'}
          </Text>
          <Text style={styles.stateDescription}>
            {state === 'loading' ? '正在读取本地缓存并连接服务。' : '请检查网络连接和服务地址，然后重新加载。'}
          </Text>
          {state === 'error' && message ? <Text style={styles.errorDetail}>{message}</Text> : null}
          {state === 'error' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="重新加载" onPress={load} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>重新加载</Text>
            </Pressable>
          ) : null}
          <Link href="/settings" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel="打开连接设置" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>打开连接设置</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FlatList
        ref={listRef}
        key={columns}
        data={view.items}
        numColumns={columns}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View>
            <View style={styles.pageTop}>
              <View style={styles.pageTopCopy}>
                <Pressable accessibilityRole="link" accessibilityLabel="返回首页" onPress={() => router.navigate('/')} style={styles.breadcrumb}>
                  <Text style={styles.breadcrumbText}>首页</Text>
                  <Text accessible={false} style={styles.breadcrumbChevron}>›</Text>
                </Pressable>
                <Text accessibilityRole="header" style={styles.title}>{heading}</Text>
                <Text style={styles.description}>搜索名称，或按世界与分类逐步查找。</Text>
              </View>
              <Text style={styles.snapshot}>共 {items.length} 条资料</Text>
            </View>

            {notice ? (
              <View style={styles.notice}>
                <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="重试更新" accessibilityState={{ disabled: refreshing }} disabled={refreshing} onPress={load} style={styles.noticeAction}>
                  <Text style={styles.noticeActionText}>{refreshing ? '正在更新' : '重试更新'}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.searchBox}>
              <Text accessible={false} style={styles.searchGlyph}>⌕</Text>
              <TextInput accessibilityLabel="搜索图鉴" value={query} onChangeText={(text) => { setQuery(text); setPage(1); }} placeholder="搜索名称或编号" placeholderTextColor="#617B77" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => setDebouncedQuery(query)} style={styles.searchInput} />
              {query ? <Pressable accessibilityRole="button" accessibilityLabel="清除搜索" onPress={clearSearch} style={styles.clearButton}><Text style={styles.clearButtonText}>清除</Text></Pressable> : null}
            </View>

            <View style={styles.resultsMeta}>
              <Text accessibilityLiveRegion="polite" style={styles.resultsCount}>
                {searchPending ? '正在搜索…' : `显示 ${view.total} 条资料`}
              </Text>
              {selectedCategory ? <Text style={styles.resultsScope}>本分类 {selectedCategory.count} 条</Text> : null}
            </View>

            <View style={styles.conditions}>
              <Text style={styles.conditionsLabel}>当前条件</Text>
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`移除搜索 ${query}`} onPress={clearSearch} style={styles.conditionChip}>
                  <Text style={styles.conditionChipText}>搜索：{query} ×</Text>
                </Pressable>
              ) : null}
              {Object.entries(facets).flatMap(([field, values]) => values.map((value) => (
                <Pressable key={`${field}:${value}`} accessibilityRole="button" accessibilityLabel={`移除 ${field} ${value === '__missing__' ? '未提供' : value}`} onPress={() => setFacet(field, value)} style={styles.conditionChip}>
                  <Text style={styles.conditionChipText}>{field}：{value === '__missing__' ? '未提供' : value} ×</Text>
                </Pressable>
              )))}
              {!hasCondition ? <Text style={styles.conditionEmpty}>无</Text> : null}
              {hasCondition ? (
                <Pressable accessibilityRole="button" accessibilityLabel="清除全部条件" onPress={clearConditions} style={styles.conditionClear}>
                  <Text style={styles.conditionClearText}>清除全部</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.filterPanel}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="筛选条件"
                accessibilityState={{ expanded: filtersOpen }}
                onPress={() => setFiltersOpen(!filtersOpen)}
                style={styles.filterSummary}
              >
                <Text style={styles.filterSummaryText}>筛选 {activeFacetCount ? `${activeFacetCount} 项已选` : ''}</Text>
                <Text accessible={false} style={styles.filterSummaryMark}>{filtersOpen ? '▴' : '▾'}</Text>
              </Pressable>

              {filtersOpen ? (
                <View style={styles.filterBody}>
                  <FilterRow label="世界">
                    {[{ id: '', title: '全部' }, ...WORLDS.map((item) => ({ id: item.id, title: item.title }))].map((item) => (
                      <Chip
                        key={item.id || 'all'}
                        label={item.title}
                        selected={world === item.id}
                        onPress={() => selectWorld(item.id)}
                        accessibilityLabel={`选择世界 ${item.title}`}
                      />
                    ))}
                  </FilterRow>

                  {world === 'currency' ? (
                    <FilterRow label="赛季">
                      {['season1', 'season2'].map((item, index) => (
                        <Chip
                          key={item}
                          label={`S${index + 1}`}
                          selected={season === item}
                          onPress={() => selectSeason(item)}
                          accessibilityLabel={`选择 S${index + 1} 赛季`}
                        />
                      ))}
                    </FilterRow>
                  ) : null}

                  <FilterRow label="分类">
                    {visibleGroups.map((group) => (
                      <Chip
                        key={group.id}
                        label={categoryChipLabel(group.name, { keepWorld: !world })}
                        selected={category === group.id}
                        onPress={() => selectCategory(group.id)}
                        accessibilityLabel={`${group.name}，${group.count} 条资料`}
                      />
                    ))}
                  </FilterRow>

                  <Text style={styles.filterNote}>
                    {visibleGroups.length} 个分类 · 共 {visibleGroups.reduce((sum, group) => sum + (group.count || 0), 0)} 条资料
                  </Text>

                  {category && category.startsWith('currency/') && category.endsWith('/roles') ? (
                    <Text style={styles.filterNote}>星阶按现有星阶字段分组，与星级的关系尚未确认。</Text>
                  ) : null}

                  {facetOptions.map(({ field, values, missing }) => (
                    <FilterRow key={field} label={field}>
                      {values.map((value) => (
                        <Chip
                          key={value}
                          label={value}
                          selected={(facets[field] || []).includes(value)}
                          onPress={() => setFacet(field, value)}
                          accessibilityLabel={`按${field}筛选 ${value}`}
                        />
                      ))}
                      {missing ? (
                        <Chip
                          label="未提供"
                          selected={(facets[field] || []).includes('__missing__')}
                          onPress={() => setFacet(field, '__missing__')}
                          accessibilityLabel={`按${field}筛选 未提供`}
                        />
                      ) : null}
                    </FilterRow>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={searchPending ? null : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{category || debouncedQuery ? '没有找到相关资料' : '暂无图鉴资料'}</Text>
            <Text style={styles.emptyDescription}>
              {category || debouncedQuery ? '试试更短的名称，或清除筛选条件。' : '当前索引中没有条目，可以重新加载。'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={category || debouncedQuery ? '清除筛选' : '重新加载'}
              onPress={category || debouncedQuery ? clearConditions : load}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{category || debouncedQuery ? '查看全部资料' : '重新加载'}</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => {
          const name = item.name || item.rawName || item.key;
          const label = categoryName(item.category || '', categories) || item.category || '图鉴';
          const attributes = ['属性', '命途', '特性', '类型', '星阶']
            .filter((field) => item.fields?.[field] !== undefined && item.fields?.[field] !== null && String(item.fields[field]).trim())
            .map((field) => `${field} ${String(item.fields![field])}`);
          const id = item.id ?? item.key.split('/').pop();
          return (
            <Link href={{ pathname: '/entry/[key]', params: { key: item.key } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`${name}，${label}，${attributes.join('，')}，编号 ${id}，查看详情`} style={[styles.card, { width: cardWidth }]}>
                <CoverImage path={item.imageLarge || item.image} category={item.category} resizeMode="contain" style={styles.cardImage} />
                <View style={styles.cardCopy}>
                  <Text style={styles.cardCategory}>{label}</Text>
                  <Text style={styles.cardName}>{name}</Text>
                  {attributes.length ? <Text style={styles.cardDetails}>{attributes.join(' · ')}</Text> : null}
                  {id ? <Text style={styles.cardId}>编号 {id}</Text> : null}
                </View>
                <Text accessible={false} style={styles.cardArrow}>→</Text>
              </Pressable>
            </Link>
          );
        }}
        ListFooterComponent={view.total > 0 ? (
          <View style={styles.pager}>
            <Text style={styles.pageMeta}>第 {view.page} / {view.pageCount} 页</Text>
            <View style={styles.pagerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="上一页" accessibilityState={{ disabled: view.page <= 1 }} disabled={view.page <= 1} onPress={() => goToPage(view.page - 1)} style={[styles.pagerButton, view.page <= 1 && styles.pagerButtonDisabled]}>
                <Text style={[styles.pagerButtonText, view.page <= 1 && styles.pagerButtonTextDisabled]}>← 上一页</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="下一页" accessibilityState={{ disabled: view.page >= view.pageCount }} disabled={view.page >= view.pageCount} onPress={() => goToPage(view.page + 1)} style={[styles.pagerButton, view.page >= view.pageCount && styles.pagerButtonDisabled]}>
                <Text style={[styles.pagerButtonText, view.page >= view.pageCount && styles.pagerButtonTextDisabled]}>下一页 →</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: PAGE_PADDING, paddingTop: 24, paddingBottom: 40 },
  pageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pageTopCopy: { flex: 1, minWidth: 0 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', minHeight: 32, marginLeft: -2 },
  breadcrumbText: { color: '#50736A', fontSize: 13, fontWeight: '600' },
  breadcrumbChevron: { color: '#7C948B', fontSize: 14, marginLeft: 2 },
  title: { color: colors.brandDark, fontSize: 32, lineHeight: 42, fontWeight: '700', letterSpacing: -0.5, marginTop: 12 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 8 },
  snapshot: { color: '#617A72', fontSize: 12, paddingTop: 34 },
  notice: { backgroundColor: colors.soft, borderRadius: 12, marginTop: 16, paddingLeft: 14, flexDirection: 'row', alignItems: 'center' },
  noticeText: { flex: 1, color: '#31534E', fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  noticeAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
  noticeActionText: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  searchBox: { minHeight: 54, marginTop: 24, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#C8D7CE', borderRadius: 12, paddingHorizontal: 4 },
  searchGlyph: { color: '#496A64', fontSize: 20, marginLeft: 12, marginRight: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 52, color: colors.ink, fontSize: 15, paddingVertical: 10, paddingRight: 8 },
  clearButton: { minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECF2ED', borderRadius: 8, marginRight: 6, paddingHorizontal: 10 },
  clearButtonText: { color: '#35574D', fontSize: 13, fontWeight: '700' },
  resultsMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  resultsCount: { color: '#617970', fontSize: 13, lineHeight: 20 },
  resultsScope: { color: '#617970', fontSize: 12 },
  conditions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 },
  conditionsLabel: { color: colors.muted, fontSize: 12 },
  conditionChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#c9b3a5', backgroundColor: '#f6e6db', borderRadius: 8 },
  conditionChipText: { color: '#783d2e', fontSize: 12 },
  conditionEmpty: { color: colors.muted, fontSize: 12 },
  conditionClear: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  conditionClearText: { color: '#783d2e', fontSize: 12, textDecorationLine: 'underline' },
  filterPanel: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#CBD1CB', marginBottom: 18 },
  filterSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterSummaryText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  filterSummaryMark: { color: colors.muted, fontSize: 13 },
  filterBody: { paddingBottom: 12 },
  filterNote: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4, marginBottom: 6 },
  gridRow: { gap: GRID_GAP },
  card: { backgroundColor: colors.surface, borderColor: '#D9E4DC', borderWidth: 1, borderRadius: 14, marginBottom: GRID_GAP, overflow: 'hidden' },
  cardImage: { width: '100%', aspectRatio: 1.05, backgroundColor: '#E6EEE8' },
  cardCopy: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 30, gap: 4 },
  cardCategory: { color: '#527965', fontSize: 11, lineHeight: 17 },
  cardName: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  cardDetails: { color: '#365B50', fontSize: 12, lineHeight: 18 },
  cardId: { color: '#58746C', fontSize: 11, lineHeight: 17 },
  cardArrow: { position: 'absolute', right: 13, bottom: 15, color: '#658E7B', fontSize: 15 },
  pager: { marginTop: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#CAD9D0', gap: 12 },
  pageMeta: { color: '#55716B', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  pagerActions: { flexDirection: 'row', gap: 12 },
  pagerButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 8 },
  pagerButtonDisabled: { backgroundColor: '#E1E9E3' },
  pagerButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pagerButtonTextDisabled: { color: '#718780' },
  emptyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D9E4DC', borderRadius: 14, padding: 24, alignItems: 'flex-start', gap: 10 },
  emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  emptyDescription: { color: '#55716B', fontSize: 14, lineHeight: 22 },
  statePage: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 20 },
  stateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D9E4DC', borderRadius: 18, padding: 24, alignItems: 'flex-start', gap: 14 },
  stateTitle: { color: colors.brandDark, fontSize: 24, lineHeight: 34, fontWeight: '700' },
  stateDescription: { color: '#45665E', fontSize: 15, lineHeight: 23 },
  errorDetail: { color: '#6A5951', fontSize: 13, lineHeight: 20 },
  primaryButton: { minHeight: 48, minWidth: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ADC5B7', borderRadius: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: colors.brand, fontSize: 14, fontWeight: '700' },
});
