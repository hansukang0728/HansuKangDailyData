import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
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
import { NaverBridge, NaverBridgeHandle } from './src/NaverBridge';
import { areaLabel, formatPrice, inTargetArea, Listing, SortKey, sortListings, toListing } from './src/listing';

// 샘플 단계: 단지 하나로 수집이 되는지부터 확인한다
const COMPLEX_NUMBER = '127071';
const TRADE_TYPES = ['B1', 'B2']; // 전세, 월세

const C = {
  ground: '#F5F3EE',
  surface: '#FFFFFF',
  ink: '#1C1B19',
  muted: '#5E5B55',
  line: '#E4E0D8',
  accent: '#0E6560',
  accentSoft: '#E3F0EE',
  rent: '#8A3E05',
  error: '#A1321F',
};

type Tab = '전체' | '전세' | '월세';
const TABS: Tab[] = ['전체', '전세', '월세'];
const SORTS: [SortKey, string][] = [
  ['rentAsc', '월세 낮은순'],
  ['rentDesc', '월세 높은순'],
  ['depositAsc', '보증금 낮은순'],
];

export default function App() {
  const bridge = useRef<NaverBridgeHandle>(null);
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 2 : 1;

  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageDetail, setPageDetail] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date>();
  const [tab, setTab] = useState<Tab>('전체');
  const [sort, setSort] = useState<SortKey>('rentAsc');
  const [areaFilter, setAreaFilter] = useState(true);
  const [screen, setScreen] = useState<'list' | 'raw'>('list');
  const [showNaver, setShowNaver] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ articleNumber: string; title: string }>();

  const listings = useMemo(() => {
    const out: Listing[] = [];
    for (const item of rawItems) {
      try {
        out.push(toListing(item));
      } catch {
        // 형태가 다른 항목은 원본 데이터 화면에서 확인
      }
    }
    return out;
  }, [rawItems]);

  const visible = useMemo(() => {
    const filtered = listings.filter(
      (l) => (tab === '전체' || l.kind === tab) && (!areaFilter || inTargetArea(l)),
    );
    return sortListings(filtered, sort);
  }, [listings, tab, sort, areaFilter]);

  const complexName = listings[0]?.complexName || `단지 ${COMPLEX_NUMBER}`;

  const refresh = async () => {
    if (busy || !bridge.current) return;
    setBusy(true);
    setError(undefined);
    setProgress(0);
    try {
      const result = await bridge.current.collect(COMPLEX_NUMBER, TRADE_TYPES, setProgress);
      setRawItems(result.items);
      setFetchedAt(new Date());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const shareRaw = () => {
    const withDup = rawItems.filter((i) => i?.duplicatedArticleInfo).slice(0, 2);
    const sample = JSON.stringify([...withDup, ...rawItems.slice(0, 3 - withDup.length)], null, 1);
    Share.share({
      message: `단지 ${COMPLEX_NUMBER} 원본 ${rawItems.length}건 중 3건 (중개사 여러 곳 매물 우선)\n\n${sample.slice(0, 60000)}`,
    });
  };

  const topPad = (StatusBar.currentHeight ?? 24) + 8;
  const refreshLabel = busy
    ? `조회 중… ${progress}건`
    : pageStatus === 'loading'
      ? '준비 중…'
      : '새로고침';

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
            <Pressable style={styles.chipOn} onPress={shareRaw} disabled={rawItems.length === 0}>
              <Text style={styles.chipOnText}>원본 공유하기</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => setShowNaver(true)}>
              <Text style={styles.chipText}>네이버 페이지 보기</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => bridge.current?.reload()}>
              <Text style={styles.chipText}>페이지 다시 열기</Text>
            </Pressable>
          </View>
          <Text style={styles.rawMeta}>
            페이지 상태: {pageStatus}
            {pageDetail ? ` (${pageDetail})` : ''} · 받은 항목 {rawItems.length}건 · 해석된 매물 {listings.length}건
          </Text>
          <ScrollView style={styles.rawBox} contentContainerStyle={{ padding: 12 }}>
            <Text selectable style={styles.rawText}>
              {rawItems.length ? JSON.stringify(rawItems.find((i) => i?.duplicatedArticleInfo) ?? rawItems[0], null, 2) : '아직 받은 데이터가 없어요. 목록에서 새로고침을 눌러주세요.'}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.flex, { paddingTop: topPad }]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>{complexName}</Text>
              <Text style={styles.subtitle}>
                {fetchedAt
                  ? `마지막 조회 ${fetchedAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 전월세 ${listings.length}건`
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

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>조회 실패: {error}</Text>
              <Text style={styles.errorHint}>원본 데이터 화면에서 "네이버 페이지 보기"로 페이지 상태를 확인할 수 있어요.</Text>
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
            <Pressable style={areaFilter ? styles.chipOn : styles.chip} onPress={() => setAreaFilter(!areaFilter)}>
              <Text style={areaFilter ? styles.chipOnText : styles.chipText}>전용 59–84㎡</Text>
            </Pressable>
            {SORTS.map(([key, label]) => (
              <Pressable key={key} style={sort === key ? styles.sortOn : styles.chip} onPress={() => setSort(key)}>
                <Text style={sort === key ? styles.sortOnText : styles.chipText}>{label}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.chip} onPress={() => setScreen('raw')}>
              <Text style={styles.chipText}>원본 데이터</Text>
            </Pressable>
          </ScrollView>

          <FlatList
            key={`cols-${columns}`}
            data={visible}
            numColumns={columns}
            keyExtractor={(l) => l.articleNumber}
            contentContainerStyle={styles.list}
            columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
            ListHeaderComponent={<Text style={styles.count}>매물 {visible.length}건</Text>}
            ListEmptyComponent={
              <Text style={styles.empty}>{rawItems.length ? '조건에 맞는 매물이 없어요' : ''}</Text>
            }
            renderItem={({ item: l }) => {
              const open = !!expanded[l.articleNumber];
              return (
                <Pressable
                  style={[styles.card, columns > 1 && styles.flex]}
                  onPress={() => setExpanded({ ...expanded, [l.articleNumber]: !open })}
                >
                  <View style={styles.areaRow}>
                    <View style={styles.areaBadge}>
                      <Text style={styles.areaText}>전용 {areaLabel(l)}㎡</Text>
                    </View>
                    {l.typeName ? (
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeText}>{l.typeName}타입</Text>
                      </View>
                    ) : null}
                    <View style={styles.flex} />
                    <Text style={[styles.kind, { color: l.kind === '월세' ? C.rent : C.accent }]}>{l.kind}</Text>
                  </View>
                  <Text style={styles.price}>{formatPrice(l)}</Text>
                  <Text style={styles.spec}>
                    {[l.dong && `${l.dong}동`, l.floor, l.direction, `공급 ${l.supplySpace}㎡`].filter(Boolean).join(' · ')}
                  </Text>
                  {open ? (
                    <View style={styles.brokerList}>
                      <Text style={styles.brokerHeading}>중개사 {l.brokerArticles.length}곳 · 중개사별 설명</Text>
                      {l.brokerArticles.map((b) => (
                        <View key={b.articleNumber || b.broker} style={styles.brokerItem}>
                          <View style={styles.brokerTop}>
                            <Text style={styles.brokerName} numberOfLines={1}>
                              {b.broker || '중개사'}
                            </Text>
                            {b.articleNumber ? (
                              <Pressable
                                style={styles.viewButton}
                                onPress={() => setViewer({ articleNumber: b.articleNumber, title: b.broker || '매물' })}
                              >
                                <Text style={styles.viewButtonText}>전체 설명 보기</Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <Text style={styles.feature}>{b.feature || '목록에 설명이 없어요. 전체 설명 보기를 눌러주세요.'}</Text>
                          {b.confirmDate ? <Text style={styles.meta}>확인일 {b.confirmDate}</Text> : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <>
                      {l.feature ? (
                        <Text style={styles.feature} numberOfLines={2}>
                          {l.feature}
                        </Text>
                      ) : null}
                      <Text style={styles.brokers} numberOfLines={1}>
                        중개사 {l.brokers.length}곳: {l.brokers.join(', ')}
                      </Text>
                      <Text style={styles.hint}>눌러서 중개사별 설명 보기</Text>
                    </>
                  )}
                </Pressable>
              );
            }}
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
  errorText: { color: C.error, fontSize: 13, fontWeight: '600' },
  errorHint: { color: C.muted, fontSize: 12, marginTop: 4 },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabOn: { borderBottomWidth: 3, borderBottomColor: C.accent },
  tabText: { fontSize: 15, color: C.muted },
  tabTextOn: { color: C.accent, fontWeight: '700' },
  chipRowWrap: { flexGrow: 0 },
  chipRow: { gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: '#D6D1C7', backgroundColor: C.surface, justifyContent: 'center' },
  chipText: { fontSize: 13, color: '#3A3833' },
  chipOn: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentSoft, justifyContent: 'center' },
  chipOnText: { fontSize: 13, color: '#0A4A46', fontWeight: '600' },
  sortOn: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: C.ink, justifyContent: 'center' },
  sortOnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  count: { fontSize: 13, color: C.muted, marginBottom: 2 },
  empty: { textAlign: 'center', color: C.muted, paddingVertical: 40 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  areaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.accentSoft },
  areaText: { fontSize: 17, fontWeight: '800', color: '#0A4A46' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.ink },
  typeText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  kind: { fontSize: 14, fontWeight: '700' },
  price: { fontSize: 21, fontWeight: '700', color: C.ink, marginTop: 4 },
  hint: { fontSize: 11, color: C.accent, marginTop: 2 },
  brokerList: { marginTop: 8, gap: 8 },
  brokerHeading: { fontSize: 13, fontWeight: '700', color: C.ink },
  brokerItem: { padding: 10, borderRadius: 10, backgroundColor: C.ground, gap: 4 },
  brokerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brokerName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink },
  viewButton: { height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: C.accent, justifyContent: 'center' },
  viewButtonText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  spec: { fontSize: 13, color: '#3A3833' },
  feature: { fontSize: 13, lineHeight: 19, color: C.muted, marginTop: 2 },
  brokers: { fontSize: 12, color: C.muted, marginTop: 2 },
  meta: { fontSize: 11, color: C.muted },
  naverBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.surface },
  naverBarText: { fontSize: 15, fontWeight: '600', color: C.ink },
  smallButton: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#D6D1C7', justifyContent: 'center', backgroundColor: C.surface },
  smallButtonText: { fontSize: 13, color: C.ink },
  rawHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  rawTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  rawActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  rawMeta: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingBottom: 8 },
  rawBox: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  rawText: { fontFamily: 'monospace', fontSize: 11, color: C.ink },
});
