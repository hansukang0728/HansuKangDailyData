import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { loadTypes } from './src/complexInfo';
import { DEFAULT_PROFILES, DELAY_BETWEEN_COMPLEXES_MS, Profile } from './src/complexes';
import { FilterPanel } from './src/FilterPanel';
import { FloorPlanSheet } from './src/FloorPlanSheet';
import { activeCount, DEFAULT_FILTERS, Filters, matches } from './src/filters';
import { compareListings, isOwnerArticle, Listing, SortKey, toListing, typeKey, typeLabel } from './src/listing';
import { ListingCard } from './src/ListingCard';
import { NaverBridge, NaverBridgeHandle } from './src/NaverBridge';
import { ProfileManager } from './src/ProfileManager';
import {
  loadActiveProfile,
  loadFavorites,
  loadFilters,
  loadProfiles,
  loadResult,
  removeProfileData,
  saveActiveProfile,
  saveFavorites,
  saveFilters,
  saveProfiles,
  saveResult,
} from './src/storage';
import { C } from './src/theme';
import { House, houseStatus, reconcile } from './src/tracking';

type Tab = '전체' | '전세' | '월세' | '즐겨찾기';
const TABS: Tab[] = ['전체', '전세', '월세', '즐겨찾기'];
const SORTS: [SortKey, string][] = [
  ['rentAsc', '월세 낮은순'],
  ['rentDesc', '월세 높은순'],
  ['depositAsc', '보증금 낮은순'],
];

// 이 너비 이상(태블릿 가로 등)이면 왼쪽 목록 + 오른쪽 상세로 나눠 보여준다
const SPLIT_MIN_WIDTH = 900;

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
  const split = width >= SPLIT_MIN_WIDTH;

  const [profiles, setProfiles] = useState<Profile[]>(DEFAULT_PROFILES);
  const [profileId, setProfileId] = useState(DEFAULT_PROFILES[0].id);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageDetail, setPageDetail] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ index: 0, count: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [rawByComplex, setRawByComplex] = useState<Record<string, any[]>>({});
  const [fetchedAt, setFetchedAt] = useState<Date>();
  const [complexNames, setComplexNames] = useState<Record<string, string>>({});
  const [complexFetchedAt, setComplexFetchedAt] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState<Tab>('전체');
  const [sort, setSort] = useState<SortKey>('rentAsc');
  const [screen, setScreen] = useState<'list' | 'raw'>('list');
  const [showNaver, setShowNaver] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const [viewer, setViewer] = useState<{ url: string; title: string }>();
  const [floorPlanFor, setFloorPlanFor] = useState<Listing>();

  // 네이버 front-api GET (평면도·타입 정보용). 참조가 바뀌지 않게 고정해 둔다
  const getJson = useCallback(<T,>(path: string) => {
    if (!bridge.current) return Promise.reject(new Error('네이버 연결 없음'));
    return bridge.current.getJson<T>(path);
  }, []);

  // 관심 목록과 마지막으로 보던 목록을 불러온다
  useEffect(() => {
    (async () => {
      const [ps, active] = await Promise.all([loadProfiles(), loadActiveProfile()]);
      setProfiles(ps);
      setProfileId(ps.find((p) => p.id === active)?.id ?? ps[0].id);
      setProfilesLoaded(true);
    })();
  }, []);

  // 보고 있는 목록의 조회 기록·필터·즐겨찾기를 불러온다
  useEffect(() => {
    if (!profilesLoaded) return;
    let alive = true;
    (async () => {
      const [saved, savedFilters, savedFavs] = await Promise.all([
        loadResult(profileId),
        loadFilters(profileId),
        loadFavorites(profileId),
      ]);
      if (!alive) return;
      setHouses(saved?.houses ?? []);
      setFetchedAt(saved ? new Date(saved.fetchedAt) : undefined);
      setComplexNames(saved?.complexNames ?? {});
      setComplexFetchedAt(saved?.complexFetchedAt ?? {});
      // 예전 세부 타입 필터(84A 등)는 대표 평형 필터로 바뀌어 맞지 않으므로 버린다
      const types = (savedFilters?.types ?? []).filter((t) => /^\d+$/.test(t));
      setFilters({ ...DEFAULT_FILTERS, ...savedFilters, types });
      setFavorites(savedFavs ?? []);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [profileId, profilesLoaded]);

  useEffect(() => {
    if (loaded) saveFilters(profileId, filters);
  }, [filters, loaded, profileId]);

  useEffect(() => {
    if (loaded) saveFavorites(profileId, favorites);
  }, [favorites, loaded, profileId]);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const complexes = profile.complexes;

  const persist = (hs: House[], at: Date, names: Record<string, string>, times: Record<string, string>) =>
    saveResult(profileId, { houses: hs, fetchedAt: at.toISOString(), complexNames: names, complexFetchedAt: times });

  const nameOf = (cn: string) => complexNames[cn] || profile.names?.[cn] || `단지 ${cn}`;

  // 목록 바꾸기: 화면 상태를 비우고 새 목록 데이터를 불러오게 한다
  const switchProfile = (id: string) => {
    setShowProfileMenu(false);
    if (id === profileId || busy) return;
    setLoaded(false);
    setHouses([]);
    setFetchedAt(undefined);
    setComplexNames({});
    setComplexFetchedAt({});
    setFilters(DEFAULT_FILTERS);
    setFavorites([]);
    setRawByComplex({});
    setErrors([]);
    setExpanded({});
    setSelectedId(undefined);
    setProfileId(id);
    saveActiveProfile(id);
  };

  const changeProfiles = (ps: Profile[]) => {
    setProfiles(ps);
    saveProfiles(ps);
  };

  const deleteProfile = (id: string) => {
    const rest = profiles.filter((p) => p.id !== id);
    if (!rest.length) return;
    removeProfileData(id);
    if (id === profileId) switchProfile(rest[0].id);
    changeProfiles(rest);
  };
  const rawItems = useMemo(() => Object.values(rawByComplex).flat(), [rawByComplex]);
  // 목록에서 뺀 단지의 기록은 보이지 않게
  // 매물번호 → 이번 실행에서 받은 원본 항목 (매물 하나의 원본 공유용)
  const rawByArticle = useMemo(() => {
    const m = new Map<string, any>();
    for (const item of rawItems) {
      const rep = item?.representativeArticleInfo ?? item;
      if (rep?.articleNumber) m.set(String(rep.articleNumber), item);
      for (const a of item?.duplicatedArticleInfo?.articleInfoList ?? []) {
        if (a?.articleNumber) m.set(String(a.articleNumber), item);
      }
    }
    return m;
  }, [rawItems]);

  const shareRawOf = (l: Listing) => {
    const item = rawByArticle.get(l.articleNumber);
    if (!item) return;
    Share.share({
      message: `${l.complexName} ${l.dong}동 ${l.floor} 매물 원본 (집주인 표시 ${l.owner ? '있음' : '없음'})\n\n${JSON.stringify(item, null, 1).slice(0, 60000)}`,
    });
  };

  const shown = useMemo(
    () => houses.filter((h) => !h.hidden && complexes.includes(h.listing.complexNumber)),
    [houses, complexes],
  );
  const now = Date.now();

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, ended: 0 };
    const t = Date.now();
    for (const h of shown) {
      const s = houseStatus(h, t);
      if (s) c[s]++;
    }
    return c;
  }, [shown]);

  const visible = useMemo(() => {
    const favSet = new Set(favorites);
    const filtered = shown.filter((h) => {
      if (tab === '즐겨찾기') return favSet.has(h.id);
      return (tab === '전체' || h.listing.kind === tab) && matches(h.listing, filters);
    });
    // 종료 매물은 맨 아래로
    return filtered.sort(
      (a, b) => Number(!!a.endedAt) - Number(!!b.endedAt) || compareListings(a.listing, b.listing, sort),
    );
  }, [shown, tab, sort, filters, favorites]);

  // 타입 칩: 고른 단지·면적 조건 안에서 실제로 있는 타입만 보여준다
  const typeOptions = useMemo(() => {
    const base = shown
      .filter((h) => !h.endedAt)
      .map((h) => h.listing)
      .filter((l) => matches(l, { ...filters, types: [], depositMax: null, rentMax: null, ownerOnly: false }));
    const map = new Map<string, { key: string; label: string; count: number; area: number }>();
    for (const l of base) {
      const k = typeKey(l);
      const cur = map.get(k) ?? { key: k, label: typeLabel(l), count: 0, area: l.exclusiveSpace };
      cur.count++;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.area - b.area || a.label.localeCompare(b.label));
  }, [shown, filters]);

  const selected = split ? (visible.find((h) => h.id === selectedId) ?? visible[0]) : undefined;

  const refresh = async () => {
    if (busy || !bridge.current || !complexes.length) return;
    const tradeTypes = profile.tradeTypes;
    setBusy(true);
    setErrors([]);
    const fresh: Record<string, Listing[]> = {};
    const raw: Record<string, any[]> = {};
    const errs: string[] = [];
    for (let i = 0; i < complexes.length; i++) {
      const cn = complexes[i];
      setProgress({ index: i, count: 0 });
      try {
        const result = await bridge.current.collect(cn, tradeTypes, (count) => setProgress({ index: i, count }));
        raw[cn] = result.items;
        fresh[cn] = parseItems(result.items, cn);
        // 평면도 화면을 빨리 열 수 있게 타입 목록을 미리 받아 둔다 (30일에 한 번)
        await loadTypes(getJson, cn).catch(() => undefined);
      } catch (e: any) {
        errs.push(`${nameOf(cn)}: ${e?.message ?? String(e)}`);
      }
      if (i < complexes.length - 1) await sleep(DELAY_BETWEEN_COMPLEXES_MS);
    }

    // 실패한 단지는 이전 기록을 그대로 둔다
    const at = new Date();
    const nextHouses = reconcile(houses, fresh, at.toISOString());
    const names = { ...complexNames };
    const times = { ...complexFetchedAt };
    for (const [cn, ls] of Object.entries(fresh)) {
      if (ls[0]?.complexName) names[cn] = ls[0].complexName;
      times[cn] = at.toISOString();
    }
    setHouses(nextHouses);
    setRawByComplex({ ...rawByComplex, ...raw });
    setComplexNames(names);
    setComplexFetchedAt(times);
    setErrors(errs);
    if (Object.keys(fresh).length) {
      setFetchedAt(at);
      persist(nextHouses, at, names, times);
    }
    setBusy(false);
  };

  const toggleFav = (id: string) =>
    setFavorites(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]);

  // 종료 매물을 목록에서 지운다 (같은 집이 다시 올라오면 알아볼 수 있게 기록은 남긴다)
  const hideWhere = (pred: (h: House) => boolean) => {
    const next = houses.map((h) => (pred(h) ? { ...h, hidden: true } : h));
    setHouses(next);
    if (fetchedAt) persist(next, fetchedAt, complexNames, complexFetchedAt);
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
    ? `조회 중 ${progress.index + 1}/${complexes.length} · ${progress.count}건`
    : pageStatus === 'loading'
      ? '준비 중…'
      : '새로고침';
  const filterCount = activeCount(filters);
  const activeTotal = shown.filter((h) => !h.endedAt).length;

  const renderCard = (h: House, inDetail = false) => (
    <ListingCard
      house={h}
      status={houseStatus(h, now)}
      fav={favorites.includes(h.id)}
      open={inDetail || (!split && !!expanded[h.id])}
      selected={split && !inDetail && selected?.id === h.id}
      onToggle={() => (split ? setSelectedId(h.id) : setExpanded({ ...expanded, [h.id]: !expanded[h.id] }))}
      onToggleFav={() => toggleFav(h.id)}
      onHide={() => hideWhere((x) => x.id === h.id)}
      onOpenPage={(url, title) => setViewer({ url, title })}
      onOpenFloorPlan={() => setFloorPlanFor(h.listing)}
      ownerOnly={filters.ownerOnly}
      onShareRaw={rawByArticle.has(h.listing.articleNumber) ? () => shareRawOf(h.listing) : undefined}
    />
  );

  const list = (
    <FlatList
      data={visible}
      keyExtractor={(h) => h.id}
      style={split ? styles.splitList : undefined}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {showFilters ? (
            <View style={styles.panelWrap}>
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                complexes={complexes.map((cn) => ({ number: cn, name: nameOf(cn) }))}
                types={typeOptions}
                ownerCount={shown.filter((h) => h.listing.owner && !h.endedAt).length}
              />
            </View>
          ) : null}
          <View style={styles.countRow}>
            <Text style={styles.count}>매물 {visible.length}건</Text>
            {counts.ended ? (
              <Pressable onPress={() => hideWhere((x) => !!x.endedAt)} style={styles.clearEnded}>
                <Text style={styles.clearEndedText}>종료 {counts.ended}건 모두 지우기</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      }
      ListEmptyComponent={
        !complexes.length ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>{profile.name}에 아직 단지가 없어요</Text>
            <Pressable style={styles.emptyButton} onPress={() => setShowManager(true)}>
              <Text style={styles.emptyButtonText}>단지 추가하기</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.empty}>
            {tab === '즐겨찾기' ? '별표를 눌러 즐겨찾기에 추가하세요' : shown.length ? '조건에 맞는 매물이 없어요' : ''}
          </Text>
        )
      }
      renderItem={({ item }) => renderCard(item)}
    />
  );

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
            {pageDetail ? ` (${pageDetail})` : ''} · 이번 실행에서 받은 항목 {rawItems.length}건 · 저장된 집 {houses.length}곳 · 집주인 판정{' '}
            {shown.filter((h) => h.listing.owner).length}건
          </Text>
          <ScrollView style={styles.rawBox} contentContainerStyle={{ padding: 12 }}>
            <Text selectable style={styles.rawText}>
              {rawItems.length
                ? JSON.stringify(rawItems.find((i) => i?.duplicatedArticleInfo) ?? rawItems[0], null, 2)
                : '이번 실행에서 받은 데이터가 없어요. 목록에서 새로고침을 눌러주세요.'}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.flex, { paddingTop: topPad }]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Pressable
                style={styles.titleButton}
                onPress={() => setShowProfileMenu(!showProfileMenu)}
                accessibilityLabel="관심 목록 바꾸기"
              >
                <Text style={styles.title} numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text style={styles.titleCaret}>{showProfileMenu ? '▴' : '▾'}</Text>
              </Pressable>
              <Text style={styles.subtitle}>
                {fetchedAt
                  ? `마지막 조회 ${fetchedAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${complexes.length}개 단지 · 전월세 ${activeTotal}건`
                  : '새로고침을 눌러 매물을 불러오세요'}
              </Text>
              {fetchedAt ? (
                <View style={styles.summary}>
                  <Text style={[styles.pill, styles.pillNew]}>신규 {counts.new}</Text>
                  <Text style={[styles.pill, styles.pillChanged]}>가격변동 {counts.changed}</Text>
                  <Text style={[styles.pill, styles.pillEnded]}>종료 {counts.ended}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              style={[styles.refresh, (busy || pageStatus === 'loading') && styles.refreshDisabled]}
              onPress={refresh}
              disabled={busy || pageStatus === 'loading'}
            >
              <Text style={styles.refreshText}>{refreshLabel}</Text>
            </Pressable>
          </View>

          {showProfileMenu ? (
            <View style={styles.profileMenu}>
              {profiles.map((p) => (
                <Pressable key={p.id} style={styles.profileItem} onPress={() => switchProfile(p.id)}>
                  <Text style={[styles.profileName, p.id === profileId && styles.profileNameOn]}>{p.name}</Text>
                  <Text style={styles.profileMeta}>단지 {p.complexes.length}곳</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.profileItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  setShowManager(true);
                }}
              >
                <Text style={styles.profileManage}>목록·단지 관리</Text>
              </Pressable>
            </View>
          ) : null}

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
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                  {t === '즐겨찾기' ? `★ ${favorites.length}` : t}
                </Text>
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

          {split ? (
            <View style={styles.splitRow}>
              {list}
              <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
                {selected ? renderCard(selected, true) : <Text style={styles.empty}>왼쪽에서 매물을 고르세요</Text>}
              </ScrollView>
            </View>
          ) : (
            list
          )}
        </View>
      )}

      {floorPlanFor ? (
        <FloorPlanSheet
          listing={floorPlanFor}
          getJson={pageStatus === 'ready' ? getJson : undefined}
          topPad={topPad}
          onClose={() => setFloorPlanFor(undefined)}
        />
      ) : null}

      {showManager ? (
        <ProfileManager
          profiles={profiles}
          activeId={profileId}
          nameOf={(p, cn) => (p.id === profileId ? nameOf(cn) : p.names?.[cn] || `단지 ${cn}`)}
          topPad={topPad}
          onChange={changeProfiles}
          onDelete={deleteProfile}
          onSelect={(id) => {
            switchProfile(id);
            setShowManager(false);
          }}
          onClose={() => setShowManager(false)}
        />
      ) : null}

      {viewer ? (
        <ArticleViewer
          url={viewer.url}
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
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  title: { fontSize: 21, fontWeight: '700', color: C.ink, flexShrink: 1 },
  titleCaret: { fontSize: 14, color: C.muted },
  profileMenu: { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 16, paddingBottom: 6 },
  profileItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderTopWidth: 1, borderTopColor: C.line },
  profileName: { fontSize: 16, color: C.body },
  profileNameOn: { color: C.accent, fontWeight: '700' },
  profileMeta: { fontSize: 12, color: C.muted },
  profileManage: { fontSize: 15, fontWeight: '600', color: C.accent },
  emptyBox: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  emptyButton: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: C.accent, justifyContent: 'center' },
  emptyButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },
  summary: { flexDirection: 'row', gap: 6, marginTop: 8 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  pillNew: { backgroundColor: '#FCE9D6', color: '#8A3E05' },
  pillChanged: { backgroundColor: '#DDE9F7', color: '#1D4E89' },
  pillEnded: { backgroundColor: '#ECEAE6', color: '#55524C' },
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
  splitRow: { flex: 1, flexDirection: 'row' },
  splitList: { width: 460, flexGrow: 0, borderRightWidth: 1, borderRightColor: C.line },
  detail: { flex: 1 },
  detailContent: { padding: 16, paddingBottom: 40 },
  panelWrap: { marginHorizontal: -16 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  count: { fontSize: 13, color: C.muted },
  clearEnded: { height: 36, justifyContent: 'center' },
  clearEndedText: { fontSize: 12, color: C.error, fontWeight: '600' },
  empty: { textAlign: 'center', color: C.muted, paddingVertical: 40 },
  naverBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: C.surface,
  },
  naverBarText: { fontSize: 15, fontWeight: '600', color: C.ink },
  smallButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.lineStrong,
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  smallButtonText: { fontSize: 13, color: C.ink },
  rawHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  rawTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  rawActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  rawMeta: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingBottom: 8 },
  rawBox: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  rawText: { fontFamily: 'monospace', fontSize: 11, color: C.ink },
});
