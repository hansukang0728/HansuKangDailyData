import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ArticleViewer } from './src/ArticleViewer';
import { Chip } from './src/Chip';
import { COMPLEXES, DELAY_BETWEEN_COMPLEXES_MS, TRADE_TYPES } from './src/complexes';
import { FilterPanel } from './src/FilterPanel';
import { activeCount, DEFAULT_FILTERS, Filters, matches } from './src/filters';
import { isOwnerArticle, Listing, SortKey, sortListings, toListing, typeKey, typeLabel } from './src/listing';
import { ListingCard } from './src/ListingCard';
import { NaverBridge, NaverBridgeHandle } from './src/NaverBridge';
import { loadFilters, loadResult, saveFilters, saveResult } from './src/storage';
import { C } from './src/theme';

type Tab = '전체' | '전세' | '월세';
const TABS: Tab[] = ['전체', '전세', '월세'];
const SORTS: [SortKey, string][] = [
  ['rentAsc', '월세 낮은순'],
  ['rentDesc', '월세 높은순'],
  ['depositAsc', '보증금 낮은순'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseItems(items: any[], complexNumber: string): Listing[] {
  const out: Listing[] = [];
  for (const item of items) {
    try {
      out.push(toListing(item, complexNumber));
    } catch {
      // 형태가 다른 항목은 원본 데이터 화면에서 확인
    }
  }
  return out;
}

export default function App() {
  const bridge = useRef<NaverBridgeHandle>(null);
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 2 : 1;

  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageDetail, setPageDetail] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ index: 0, count: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [rawByComplex, setRawByComplex] = useState<Record<string, any[]>>({});
  const [fetchedAt, setFetchedAt] = useState<Date>();
  const [complexNames, setComplexNames] = useState<Record<string, string>>({});
  const [complexFetchedAt, setComplexFetchedAt] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loaded, setLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState<Tab>('전체');
  const [sort, setSort] = useState<SortKey>('rentAsc');
  const [screen, setScreen] = useState<'list' | 'raw'>('list');
  const [showNaver, setShowNaver] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ articleNumber: string; title: string }>();

  // 저장해 둔 마지막 조회 결과와 필터를 불러온다
  useEffect(() => {
    (async () => {
      const [saved, savedFilters] = await Promise.all([loadResult(), loadFilters()]);
      if (saved) {
        setListings(saved.listings);
        setFetchedAt(new Date(saved.fetchedAt));
        setComplexNames(saved.complexNames);
        setComplexFetchedAt(saved.complexFetchedAt ?? {});
      }
      if (savedFilters) setFilters({ ...DEFAULT_FILTERS, ...savedFilters });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) saveFilters(filters);
  }, [filters, loaded]);

  const nameOf = (cn: string) => complexNames[cn] || `단지 ${cn}`;
  const rawItems = useMemo(() => Object.values(rawByComplex).flat(), [rawByComplex]);

  const visible = useMemo(() => {
    const filtered = listings.filter((l) => (tab === '전체' || l.kind === tab) && matches(l, filters));
    return sortListings(filtered, sort);
  }, [listings, tab, sort, filters]);

  // 타입 칩: 고른 단지·면적 조건 안에서 실제로 있는 타입만 보여준다
  const typeOptions = useMemo(() => {
    const base = listings.filter((l) => matches(l, { ...filters, types: [], depositMax: null, rentMax: null, ownerOnly: false }));
    const map = new Map<string, { key: string; label: string; count: number; area: number }>();
    for (const l of base) {
      const k = typeKey(l);
      const cur = map.get(k) ?? { key: k, label: typeLabel(l), count: 0, area: l.exclusiveSpace };
      cur.count++;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.area - b.area || a.label.localeCompare(b.label));
  }, [listings, filters]);

  const refresh = async () => {
    if (busy || !bridge.current) return;
    setBusy(true);
    setErrors([]);
    const fresh: Record<string, Listing[]> = {};
    const raw: Record<string, any[]> = {};
    const errs: string[] = [];
    for (let i = 0; i < COMPLEXES.length; i++) {
      const cn = COMPLEXES[i];
      setProgress({ index: i, count: 0 });
      try {
        const result = await bridge.current.collect(cn, TRADE_TYPES, (count) => setProgress({ index: i, count }));
        raw[cn] = result.items;
        fresh[cn] = parseItems(result.items, cn);
      } catch (e: any) {
        errs.push(`${nameOf(cn)}: ${e?.message ?? String(e)}`);
      }
      if (i < COMPLEXES.length - 1) await sleep(DELAY_BETWEEN_COMPLEXES_MS);
    }

    // 실패한 단지는 이전 결과를 그대로 둔다
    const now = new Date();
    const merged = [...listings.filter((l) => !(l.complexNumber in fresh)), ...Object.values(fresh).flat()];
    const names = { ...complexNames };
    const times = { ...complexFetchedAt };
    for (const [cn, ls] of Object.entries(fresh)) {
      if (ls[0]?.complexName) names[cn] = ls[0].complexName;
      times[cn] = now.toISOString();
    }
    setListings(merged);
    setRawByComplex({ ...rawByComplex, ...raw });
    setComplexNames(names);
    setComplexFetchedAt(times);
    setErrors(errs);
    if (Object.keys(fresh).length) {
      setFetchedAt(now);
      saveResult({ listings: merged, fetchedAt: now.toISOString(), complexNames: names, complexFetchedAt: times });
    }
    setBusy(false);
  };

  const shareRaw = () => {
    // 집주인 매물 1건, 중개사 여러 곳 매물 1건, 일반 매물을 섞어서 필드 비교가 되게 한다
    const owner = rawItems.filter((i) => isOwnerArticle(i?.representativeArticleInfo ?? i)).slice(0, 1);
    const withDup = rawItems.filter((i) => i?.duplicatedArticleInfo && !owner.includes(i)).slice(0, 1);
    const rest = rawItems.filter((i) => !owner.includes(i) && !withDup.includes(i)).slice(0, 3 - owner.length - withDup.length);
    const sample = JSON.stringify([...owner, ...withDup, ...rest], null, 1);
    Share.share({
      message: `원본 ${rawItems.length}건 중 3건 (집주인 매물, 중개사 여러 곳 매물 포함)\n\n${sample.slice(0, 60000)}`,
    });
  };

  const topPad = (StatusBar.currentHeight ?? 24) + 8;
  const refreshLabel = busy
    ? `조회 중 ${progress.index + 1}/${COMPLEXES.length} · ${progress.count}건`
    : pageStatus === 'loading'
      ? '준비 중…'
      : '새로고침';
  const filterCount = activeCount(filters);

  return (
    <View style={styles.root}>
      <ExpoStatusBar style="dark" />
      <NaverBridge
        ref={bridge}
        visible={showNaver}
        topInset={topPad + 52}
        onStatus={(s, d) => {
          setPageStatus(s);
          setPageDetail(d);
        }}
      />

      {showNaver ? (
        <View style={[styles.naverBar, { paddingTop: topPad, height: topPad + 52 }]}>
          <Text style={styles.naverBarText}>네이버 페이지 (수집용)</Text>
          <Pressable style={styles.smallButton} onPress={() => setShowNaver(false)}>
            <Text style={styles.smallButtonText}>닫기</Text>
          </Pressable>
        </View>
      ) : screen === 'raw' ? (
        <View style={[styles.flex, { paddingTop: topPad }]}>
          <View style={styles.rawHeader}>
            <Pressable style={styles.smallButton} onPress={() => setScreen('list')}>
              <Text style={styles.smallButtonText}>← 목록</Text>
            </Pressable>
            <Text style={styles.rawTitle}>원본 데이터</Text>
          </View>
          <View style={styles.rawActions}>
            <Chip label="원본 공유하기" on onPress={shareRaw} />
            <Chip label="네이버 페이지 보기" on={false} onPress={() => setShowNaver(true)} />
            <Chip label="페이지 다시 열기" on={false} onPress={() => bridge.current?.reload()} />
          </View>
          <Text style={styles.rawMeta}>
            페이지 상태: {pageStatus}
            {pageDetail ? ` (${pageDetail})` : ''} · 이번 실행에서 받은 항목 {rawItems.length}건 · 저장된 매물 {listings.length}건 · 집주인 판정 {listings.filter((l) => l.owner).length}건
          </Text>
          <ScrollView style={styles.rawBox} contentContainerStyle={{ padding: 12 }}>
            <Text selectable style={styles.rawText}>
              {rawItems.length ? JSON.stringify(rawItems.find((i) => i?.duplicatedArticleInfo) ?? rawItems[0], null, 2) : '이번 실행에서 받은 데이터가 없어요. 목록에서 새로고침을 눌러주세요.'}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.flex, { paddingTop: topPad }]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>과천 전월세</Text>
              <Text style={styles.subtitle}>
                {fetchedAt
                  ? `마지막 조회 ${fetchedAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${COMPLEXES.length}개 단지 · 전월세 ${listings.length}건`
                  : '새로고침을 눌러 매물을 불러오세요'}
              </Text>
            </View>
            <Pressable
              style={[styles.refresh, (busy || pageStatus === 'loading') && styles.refreshDisabled]}
              onPress={refresh}
              disabled={busy || pageStatus === 'loading'}
            >
              <Text style={styles.refreshText}>{refreshLabel}</Text>
            </Pressable>
          </View>

          {errors.length ? (
            <View style={styles.errorBox}>
              {errors.map((e) => (
                <Text key={e} style={styles.errorText}>
                  조회 실패 · {e}
                </Text>
              ))}
              <Text style={styles.errorHint}>실패한 단지는 이전 조회 결과를 그대로 보여줘요. 잠시 뒤 다시 새로고침해 주세요.</Text>
            </View>
          ) : null}

          <View style={styles.tabs}>
            {TABS.map((t) => (
              <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal style={styles.chipRowWrap} contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>
            <Chip
              label={`필터${filterCount ? ` ${filterCount}` : ''} ${showFilters ? '▴' : '▾'}`}
              on={showFilters || filterCount > 0}
              onPress={() => setShowFilters(!showFilters)}
            />
            {SORTS.map(([key, label]) => (
              <Chip key={key} label={label} variant="sort" on={sort === key} onPress={() => setSort(key)} />
            ))}
            <Chip label="원본 데이터" on={false} onPress={() => setScreen('raw')} />
          </ScrollView>

          <FlatList
            key={`cols-${columns}`}
            data={visible}
            numColumns={columns}
            keyExtractor={(l) => l.articleNumber}
            contentContainerStyle={styles.list}
            columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
            ListHeaderComponent={
              <>
                {showFilters ? (
                  <View style={styles.panelWrap}>
                    <FilterPanel
                      filters={filters}
                      onChange={setFilters}
                      complexes={COMPLEXES.map((cn) => ({ number: cn, name: nameOf(cn) }))}
                      types={typeOptions}
                      ownerCount={listings.filter((l) => l.owner).length}
                    />
                  </View>
                ) : null}
                <Text style={styles.count}>매물 {visible.length}건</Text>
              </>
            }
            ListEmptyComponent={
              <Text style={styles.empty}>{listings.length ? '조건에 맞는 매물이 없어요' : ''}</Text>
            }
            renderItem={({ item: l }) => (
              <ListingCard
                listing={l}
                open={!!expanded[l.articleNumber]}
                wide={columns > 1}
                onToggle={() => setExpanded({ ...expanded, [l.articleNumber]: !expanded[l.articleNumber] })}
                onOpenArticle={(articleNumber, title) => setViewer({ articleNumber, title })}
              />
            )}
          />
        </View>
      )}

      {viewer ? (
        <ArticleViewer
          articleNumber={viewer.articleNumber}
          title={viewer.title}
          topPad={topPad}
          onClose={() => setViewer(undefined)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  title: { fontSize: 21, fontWeight: '700', color: C.ink },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  refresh: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.accent, justifyContent: 'center' },
  refreshDisabled: { opacity: 0.6 },
  refreshText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  errorBox: { margin: 12, padding: 12, borderRadius: 12, backgroundColor: '#FBE9E6' },
  errorText: { color: C.error, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  errorHint: { color: C.muted, fontSize: 12, marginTop: 4 },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabOn: { borderBottomWidth: 3, borderBottomColor: C.accent },
  tabText: { fontSize: 15, color: C.muted },
  tabTextOn: { color: C.accent, fontWeight: '700' },
  chipRowWrap: { flexGrow: 0 },
  chipRow: { gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  count: { fontSize: 13, color: C.muted, marginBottom: 2 },
  empty: { textAlign: 'center', color: C.muted, paddingVertical: 40 },
  panelWrap: { marginHorizontal: -16 },
  naverBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.surface },
  naverBarText: { fontSize: 15, fontWeight: '600', color: C.ink },
  smallButton: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.lineStrong, justifyContent: 'center', backgroundColor: C.surface },
  smallButtonText: { fontSize: 13, color: C.ink },
  rawHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  rawTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  rawActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  rawMeta: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingBottom: 8 },
  rawBox: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  rawText: { fontFamily: 'monospace', fontSize: 11, color: C.ink },
});
