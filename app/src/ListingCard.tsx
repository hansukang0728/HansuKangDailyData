import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { areaLabel, articleUrl, complexUrl, formatPrice } from './listing';
import { C } from './theme';
import { HistoryEvent, House, HouseStatus } from './tracking';

interface Props {
  house: House;
  status: HouseStatus;
  fav: boolean;
  open: boolean;
  selected?: boolean; // 태블릿에서 오른쪽에 보고 있는 매물
  onToggle: () => void;
  onToggleFav: () => void;
  onHide: () => void;
  onOpenPage: (url: string, title: string) => void;
  ownerOnly?: boolean; // "집주인만" 필터가 켜져 있으면 집주인 확인 중개사 설명만 보여준다
}

const STATUS_LABEL = { new: '신규', changed: '가격변동', ended: '종료' } as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function historyText(e: HistoryEvent): string {
  const price = formatPrice({ deposit: e.deposit, rent: e.rent, kind: e.kind } as any);
  const label = { first: '처음 발견', price: '가격 변경', ended: '목록에서 사라짐', relisted: '다시 올라옴' }[e.type];
  return e.type === 'ended' ? label : `${label} · ${e.kind} ${price}`;
}

export function ListingCard({ house, status, fav, open, selected, onToggle, onToggleFav, onHide, onOpenPage, ownerOnly }: Props) {
  const l = house.listing;
  const [showAllBrokers, setShowAllBrokers] = useState(false);
  const ownerArticles = l.brokerArticles.filter((b) => b.owner);
  const limitToOwner = !!ownerOnly && !showAllBrokers && ownerArticles.length > 0;
  const brokerArticles = limitToOwner ? ownerArticles : l.brokerArticles;
  const hiddenBrokers = l.brokerArticles.length - brokerArticles.length;
  // 접힌 카드에 보여줄 한 줄 설명과 중개사 이름도 같은 기준으로
  const summaryFeature = limitToOwner ? (ownerArticles.find((b) => b.feature)?.feature ?? l.feature) : l.feature;
  const summaryBrokers = limitToOwner
    ? `집주인 확인 ${ownerArticles.length}곳: ${ownerArticles.map((b) => b.broker).join(', ')} (전체 ${l.brokerArticles.length}곳)`
    : `중개사 ${l.brokers.length}곳: ${l.brokers.join(', ')}`;
  const ended = status === 'ended';
  const prevPrice =
    status === 'changed' && house.prevDeposit !== undefined
      ? formatPrice({ ...l, deposit: house.prevDeposit, rent: house.prevRent ?? 0, kind: house.prevKind ?? l.kind })
      : null;
  return (
    <Pressable style={[styles.card, selected && styles.cardSelected, ended && styles.cardEnded]} onPress={onToggle}>
      <View style={styles.topRow}>
        {status ? (
          <View style={[styles.statusBadge, styles[`status_${status}`]]}>
            <Text style={[styles.statusText, styles[`statusText_${status}`]]}>{STATUS_LABEL[status]}</Text>
          </View>
        ) : null}
        <Text style={[styles.complex, styles.flex]} numberOfLines={1}>
          {[l.complexName, l.dong && `${l.dong}동`].filter(Boolean).join(' · ')}
        </Text>
        {ended ? (
          <Pressable style={styles.iconButton} onPress={onHide} accessibilityLabel="목록에서 지우기">
            <Text style={styles.hideText}>지우기</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.iconButton} onPress={onToggleFav} accessibilityLabel={fav ? '즐겨찾기 해제' : '즐겨찾기'}>
          <Text style={[styles.star, fav && styles.starOn]}>{fav ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      <View style={styles.areaRow}>
        <View style={styles.areaBadge}>
          <Text style={styles.areaText}>전용 {areaLabel(l)}㎡</Text>
        </View>
        {l.typeName ? (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{l.typeName}타입</Text>
          </View>
        ) : null}
        {l.owner ? <OwnerBadge /> : null}
        <View style={styles.flex} />
        <Text style={[styles.kind, { color: l.kind === '월세' ? C.rent : C.accent }]}>{l.kind}</Text>
      </View>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(l)}</Text>
        {prevPrice ? <Text style={styles.prevPrice}>{prevPrice}</Text> : null}
      </View>
      {l.priceVaries && l.priceMax ? (
        <Text style={styles.priceVaries}>
          중개사별 가격 다름 · 최저 {formatPrice(l)} ~ 최고 {formatPrice({ ...l, ...l.priceMax })}
        </Text>
      ) : null}
      <Text style={styles.spec}>
        {[l.floor, l.direction, `공급 ${l.supplySpace}㎡`].filter(Boolean).join(' · ')}
      </Text>
      {open ? (
        <View style={styles.brokerList}>
          <Pressable
            style={styles.complexButton}
            onPress={() => onOpenPage(complexUrl(l.complexNumber), `${l.complexName || '단지'} 정보`)}
          >
            <Text style={styles.complexButtonText}>단지 정보 · 평면도 보기</Text>
          </Pressable>
          <Text style={styles.brokerHeading}>
            {limitToOwner
              ? `집주인 확인 중개사 ${brokerArticles.length}곳 (전체 ${l.brokerArticles.length}곳)`
              : `중개사 ${l.brokerArticles.length}곳 · 중개사별 설명`}
          </Text>
          {brokerArticles.map((b) => (
            <View key={b.articleNumber || b.broker} style={styles.brokerItem}>
              <View style={styles.brokerTop}>
                <Text style={styles.brokerName} numberOfLines={1}>
                  {b.broker || '중개사'}
                </Text>
                {b.owner ? <OwnerBadge /> : null}
                {b.articleNumber ? (
                  <Pressable style={styles.viewButton} onPress={() => onOpenPage(articleUrl(b.articleNumber), b.broker || '매물')}>
                    <Text style={styles.viewButtonText}>전체 설명 보기</Text>
                  </Pressable>
                ) : null}
              </View>
              {l.priceVaries && b.deposit !== undefined ? (
                <Text style={[styles.brokerPrice, b.deposit === l.deposit && b.rent === l.rent && styles.brokerPriceLow]}>
                  {b.kind ?? l.kind} {formatPrice({ ...l, kind: b.kind ?? l.kind, deposit: b.deposit, rent: b.rent ?? 0 })}
                  {b.deposit === l.deposit && b.rent === l.rent ? ' · 최저' : ''}
                </Text>
              ) : null}
              <Text style={styles.feature}>{b.feature || '목록에 설명이 없어요. 전체 설명 보기를 눌러주세요.'}</Text>
              {b.confirmDate ? <Text style={styles.meta}>확인일 {b.confirmDate}</Text> : null}
            </View>
          ))}
          {limitToOwner && hiddenBrokers > 0 ? (
            <Pressable style={styles.moreBrokers} onPress={() => setShowAllBrokers(true)}>
              <Text style={styles.moreBrokersText}>다른 중개사 {hiddenBrokers}곳 설명도 보기</Text>
            </Pressable>
          ) : null}
          {ownerOnly && showAllBrokers && ownerArticles.length > 0 ? (
            <Pressable style={styles.moreBrokers} onPress={() => setShowAllBrokers(false)}>
              <Text style={styles.moreBrokersText}>집주인 확인 중개사만 보기</Text>
            </Pressable>
          ) : null}
          <Text style={styles.brokerHeading}>조회 기록</Text>
          <View style={styles.history}>
            {[...house.history].reverse().map((e, i) => (
              <View key={`${e.at}-${i}`} style={styles.historyRow}>
                <Text style={styles.historyWhen}>{when(e.at)}</Text>
                <Text style={styles.historyWhat}>{historyText(e)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <>
          {summaryFeature ? (
            <Text style={styles.feature} numberOfLines={2}>
              {summaryFeature}
            </Text>
          ) : null}
          <Text style={styles.brokers} numberOfLines={1}>
            {summaryBrokers}
          </Text>
          <Text style={styles.hint}>눌러서 중개사별 설명 보기</Text>
        </>
      )}
    </Pressable>
  );
}

function OwnerBadge() {
  return (
    <View style={styles.ownerBadge}>
      <Text style={styles.ownerText}>집주인</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 4 },
  cardSelected: { borderWidth: 2, borderColor: C.accent },
  cardEnded: { opacity: 0.6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginRight: -8 },
  complex: { fontSize: 13, fontWeight: '600', color: C.muted },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  status_new: { backgroundColor: '#FCE9D6' },
  statusText_new: { color: '#8A3E05' },
  status_changed: { backgroundColor: '#DDE9F7' },
  statusText_changed: { color: '#1D4E89' },
  status_ended: { backgroundColor: '#ECEAE6' },
  statusText_ended: { color: '#55524C' },
  iconButton: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 24, color: '#8C877E' },
  starOn: { color: '#B7791F' },
  hideText: { fontSize: 13, fontWeight: '600', color: C.error },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  priceVaries: { fontSize: 12, fontWeight: '600', color: C.rent },
  brokerPrice: { fontSize: 14, fontWeight: '700', color: C.body },
  brokerPriceLow: { color: C.accent },
  prevPrice: { fontSize: 13, color: C.muted, textDecorationLine: 'line-through' },
  history: { gap: 4, padding: 10, borderRadius: 10, backgroundColor: C.ground },
  historyRow: { flexDirection: 'row', gap: 10 },
  historyWhen: { fontSize: 12, color: C.muted, width: 92 },
  historyWhat: { flex: 1, fontSize: 12, color: C.body },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  areaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.accentSoft },
  areaText: { fontSize: 17, fontWeight: '800', color: C.accentDark },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.ink },
  typeText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  ownerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.ownerBg },
  ownerText: { fontSize: 13, fontWeight: '700', color: C.ownerText },
  kind: { fontSize: 14, fontWeight: '700' },
  price: { fontSize: 21, fontWeight: '700', color: C.ink },
  spec: { fontSize: 13, color: C.body },
  feature: { fontSize: 13, lineHeight: 19, color: C.muted, marginTop: 2 },
  brokers: { fontSize: 12, color: C.muted, marginTop: 2 },
  hint: { fontSize: 11, color: C.accent, marginTop: 2 },
  meta: { fontSize: 11, color: C.muted },
  brokerList: { marginTop: 8, gap: 8 },
  brokerHeading: { fontSize: 13, fontWeight: '700', color: C.ink },
  brokerItem: { padding: 10, borderRadius: 10, backgroundColor: C.ground, gap: 4 },
  brokerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brokerName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink },
  viewButton: { height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: C.accent, justifyContent: 'center' },
  viewButtonText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  moreBrokers: { height: 40, justifyContent: 'center' },
  moreBrokersText: { fontSize: 13, fontWeight: '600', color: C.accent },
  complexButton: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.accent, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  complexButtonText: { fontSize: 14, fontWeight: '700', color: C.accentDark },
});
