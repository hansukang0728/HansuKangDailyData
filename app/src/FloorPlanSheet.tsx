// 타입별 평면도와 기본 정보를 앱 화면에 보여준다 (네이버 페이지를 열지 않고).
// 평면도 이미지는 두 손가락 확대가 되도록 WebView 안의 이미지로 그린다.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import WebView from 'react-native-webview';

import { Chip } from './Chip';
import { loadDetail, loadTypes, matchType, MaintenanceFee, planSections, PyeongDetail, PyeongType, shortName } from './complexInfo';
import { DIRECTIONS, Listing } from './listing';
import { C } from './theme';

type GetJson = <T = any>(path: string) => Promise<T>;

interface Props {
  listing: Listing;
  getJson: GetJson | undefined; // 수집용 네이버 페이지가 준비되지 않았으면 undefined
  topPad: number;
  onClose: () => void;
}

function man(won?: number): string {
  return won ? `${Math.round(won / 10000).toLocaleString('ko-KR')}만원` : '-';
}

function plansHtml(urls: string[]): string {
  const imgs = urls
    .map((u) => `<img src="${u.replace(/"/g, '%22')}" style="width:100%;display:block;margin:0 0 16px">`)
    .join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=6, user-scalable=yes"></head><body style="margin:0;padding:12px;background:#fff">${imgs}</body></html>`;
}

export function FloorPlanSheet({ listing: l, getJson, topPad, onClose }: Props) {
  const [types, setTypes] = useState<PyeongType[]>();
  const [typesError, setTypesError] = useState<string>();
  const [selected, setSelected] = useState<number>();
  // 타입 번호 → 받아 온 평면도·관리비 (또는 오류)
  const [details, setDetails] = useState<Record<number, { pyeong?: PyeongDetail; fee?: MaintenanceFee; error?: string }>>({});
  const [section, setSection] = useState(0);

  // 단지 타입 목록을 받고 이 매물의 타입을 고른다
  useEffect(() => {
    if (!getJson) return;
    let alive = true;
    loadTypes(getJson, l.complexNumber)
      .then((ts) => {
        if (!alive) return;
        setTypes(ts);
        setSelected((matchType(ts, l) ?? ts[0])?.number);
      })
      .catch((e) => alive && setTypesError(`타입 정보를 받지 못했어요: ${e?.message ?? e}`));
    return () => {
      alive = false;
    };
    // 매물이 바뀔 때만 다시 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getJson, l.complexNumber, l.articleNumber]);

  // 고른 타입의 평면도·관리비 (한 번 받은 타입은 다시 받지 않음)
  const loaded = selected !== undefined && selected in details;
  useEffect(() => {
    if (!getJson || selected === undefined || loaded) return;
    let alive = true;
    loadDetail(getJson, l.complexNumber, selected)
      .then((d) => alive && setDetails((cur) => ({ ...cur, [selected]: { pyeong: d.pyeong, fee: d.fee } })))
      .catch((e) => alive && setDetails((cur) => ({ ...cur, [selected]: { error: `평면도를 받지 못했어요: ${e?.message ?? e}` } })));
    return () => {
      alive = false;
    };
  }, [getJson, l.complexNumber, selected, loaded]);

  const pick = (n: number) => {
    setSelected(n);
    setSection(0);
  };

  const entry = selected !== undefined ? details[selected] : undefined;
  const detail = entry?.pyeong;
  const fee = entry?.fee;
  const error = !getJson
    ? '네이버 연결이 아직 준비되지 않았어요. 잠시 뒤 다시 열어주세요.'
    : (typesError ?? entry?.error);
  const loading = !error && (types === undefined || (selected !== undefined && !entry));
  const type = types?.find((t) => t.number === selected);
  const sections = detail ? planSections(detail) : [];
  const current = sections[section];

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 닫기</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {l.complexName || '단지'} 평면도
        </Text>
      </View>

      {types?.length ? (
        <ScrollView horizontal style={styles.rowWrap} contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
          {types.map((t) => (
            <Chip key={t.number} label={`${shortName(t)} (${t.name})`} on={t.number === selected} onPress={() => pick(t.number)} />
          ))}
        </ScrollView>
      ) : null}

      {type ? (
        <View style={styles.info}>
          <Text style={styles.infoMain}>
            전용 {type.exclusiveArea}㎡ · 공급 {type.supplyArea}㎡ · {type.householdCount.toLocaleString('ko-KR')}세대
          </Text>
          {detail ? (
            <Text style={styles.infoSub}>
              {[
                detail.roomCount !== undefined && `방 ${detail.roomCount}`,
                detail.bathRoomCount !== undefined && `욕실 ${detail.bathRoomCount}`,
                detail.direction && (DIRECTIONS[detail.direction] ?? detail.direction),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {fee?.monthAverageFee ? (
            <Text style={styles.infoSub}>
              관리비 월평균 {man(fee.monthAverageFee)} (여름 {man(fee.summerAverageFee)} · 겨울 {man(fee.winterAverageFee)}
              {fee.yearMonth ? `, ${fee.yearMonth}까지` : ''})
            </Text>
          ) : null}
        </View>
      ) : null}

      {sections.length > 1 ? (
        <View style={[styles.row, styles.sectionRow]}>
          {sections.map((s, i) => (
            <Chip key={s.label} label={s.label} variant="sort" on={i === section} onPress={() => setSection(i)} />
          ))}
        </View>
      ) : null}

      <View style={styles.plan}>
        {loading ? (
          <ActivityIndicator style={styles.center} color={C.accent} />
        ) : error ? (
          <Text style={styles.message}>{error}</Text>
        ) : current ? (
          <WebView
            key={`${selected}-${section}`}
            originWhitelist={['*']}
            source={{ html: plansHtml(current.urls), baseUrl: 'https://fin.land.naver.com' }}
            setBuiltInZoomControls
            setDisplayZoomControls={false}
          />
        ) : (
          <Text style={styles.message}>이 타입은 네이버에 평면도가 없어요.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: C.surface },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink },
  button: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.lineStrong, justifyContent: 'center' },
  buttonText: { fontSize: 13, color: C.ink },
  rowWrap: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  sectionRow: { paddingTop: 0 },
  info: { paddingHorizontal: 16, paddingBottom: 10, gap: 3 },
  infoMain: { fontSize: 15, fontWeight: '700', color: C.ink },
  infoSub: { fontSize: 13, color: C.body },
  plan: { flex: 1, borderTopWidth: 1, borderTopColor: C.line },
  center: { marginTop: 40 },
  message: { padding: 24, textAlign: 'center', color: C.muted },
});
