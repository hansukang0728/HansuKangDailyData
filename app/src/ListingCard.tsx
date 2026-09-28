import { Pressable, StyleSheet, Text, View } from 'react-native';

import { areaLabel, formatPrice, Listing } from './listing';
import { C } from './theme';

interface Props {
  listing: Listing;
  open: boolean;
  wide: boolean; // 태블릿 2열일 때 칸을 채운다
  onToggle: () => void;
  onOpenArticle: (articleNumber: string, title: string) => void;
}

export function ListingCard({ listing: l, open, wide, onToggle, onOpenArticle }: Props) {
  return (
    <Pressable style={[styles.card, wide && styles.flex]} onPress={onToggle}>
      <Text style={styles.complex} numberOfLines={1}>
        {[l.complexName, l.dong && `${l.dong}동`].filter(Boolean).join(' · ')}
      </Text>
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
      <Text style={styles.price}>{formatPrice(l)}</Text>
      <Text style={styles.spec}>
        {[l.floor, l.direction, `공급 ${l.supplySpace}㎡`].filter(Boolean).join(' · ')}
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
                {b.owner ? <OwnerBadge /> : null}
                {b.articleNumber ? (
                  <Pressable style={styles.viewButton} onPress={() => onOpenArticle(b.articleNumber, b.broker || '매물')}>
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
  complex: { fontSize: 13, fontWeight: '600', color: C.muted },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  areaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.accentSoft },
  areaText: { fontSize: 17, fontWeight: '800', color: C.accentDark },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.ink },
  typeText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  ownerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.ownerBg },
  ownerText: { fontSize: 13, fontWeight: '700', color: C.ownerText },
  kind: { fontSize: 14, fontWeight: '700' },
  price: { fontSize: 21, fontWeight: '700', color: C.ink, marginTop: 4 },
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
});
