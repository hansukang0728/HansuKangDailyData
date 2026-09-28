import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { DEFAULT_FILTERS, DEPOSIT_OPTIONS, Filters, RENT_OPTIONS, toggle } from './filters';
import { C } from './theme';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  complexes: { number: string; name: string }[];
  types: { key: string; label: string; count: number }[];
  ownerCount: number;
}

export function FilterPanel({ filters: f, onChange, complexes, types, ownerCount }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  return (
    <View style={styles.panel}>
      <Section title="단지">
        <Chip label="전체" on={f.complexes.length === 0} onPress={() => set({ complexes: [] })} />
        {complexes.map((c) => (
          <Chip
            key={c.number}
            label={c.name}
            on={f.complexes.includes(c.number)}
            onPress={() => set({ complexes: toggle(f.complexes, c.number) })}
          />
        ))}
      </Section>
      <Section title="평형 (전용)">
        <Chip label="전용 59–84㎡" on={f.targetArea} onPress={() => set({ targetArea: !f.targetArea, types: [] })} />
        {types.map((t) => (
          <Chip
            key={t.key}
            label={`${t.label} (${t.count})`}
            on={f.types.includes(t.key)}
            onPress={() => set({ types: toggle(f.types, t.key) })}
          />
        ))}
      </Section>
      <Section title="보증금">
        {DEPOSIT_OPTIONS.map(([v, label]) => (
          <Chip key={label} label={label} on={f.depositMax === v} onPress={() => set({ depositMax: v })} />
        ))}
      </Section>
      <Section title="월세 (만원)">
        {RENT_OPTIONS.map(([v, label]) => (
          <Chip key={label} label={label} on={f.rentMax === v} onPress={() => set({ rentMax: v })} />
        ))}
      </Section>
      <Section title="기타">
        <Chip label={`집주인만 (${ownerCount})`} on={f.ownerOnly} onPress={() => set({ ownerOnly: !f.ownerOnly })} />
      </Section>
      <Pressable style={styles.reset} onPress={() => onChange(DEFAULT_FILTERS)}>
        <Text style={styles.resetText}>필터 초기화</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginBottom: 8, padding: 14, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  section: { gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reset: { alignSelf: 'flex-start', height: 36, justifyContent: 'center' },
  resetText: { fontSize: 13, color: C.error, fontWeight: '600' },
});
