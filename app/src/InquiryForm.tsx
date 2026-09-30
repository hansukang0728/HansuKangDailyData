// 매물 카드 안의 "문의 기록" 양식: 섹션을 펼쳐서 칩을 누르거나 숫자·글을 적는다.
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from './Chip';
import { exportText, Field, filledCount, Inquiry, MONTHS, PERIODS, sectionsFor, summarize } from './inquiry';
import { Listing } from './listing';
import { C } from './theme';

interface Props {
  listing: Listing;
  value: Inquiry;
  onChange: (next: Inquiry) => void;
}

export function InquiryForm({ listing, value, onChange }: Props) {
  const kind = listing.kind;
  const [openIds, setOpenIds] = useState<string[]>([]);
  const set = (key: string, x: string | string[] | undefined) => {
    const next = { ...value };
    if (x === undefined || x === '' || (Array.isArray(x) && !x.length)) delete next[key];
    else next[key] = x;
    onChange(next);
  };
  const toggleOpen = (id: string) => setOpenIds(openIds.includes(id) ? openIds.filter((x) => x !== id) : [...openIds, id]);

  const done = value.done === 'Y';
  const toggleDone = () => {
    const next = { ...value };
    if (done) {
      delete next.done;
      delete next.doneAt;
    } else {
      next.done = 'Y';
      next.doneAt = new Date().toISOString();
    }
    onChange(next);
  };
  const share = () => Share.share({ message: exportText(listing, value, kind) });

  const sectionSummary = (fields: Field[]) => {
    const one: Inquiry = {};
    for (const f of fields) {
      for (const k of [f.key, `${f.key}Month`, `${f.key}Period`, `${f.key}Date`, `${f.key}Time`]) if (value[k] !== undefined) one[k] = value[k];
    }
    return summarize(one, kind);
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Text style={styles.title}>문의 기록</Text>
        <Text style={styles.count}>{filledCount(value)}개 기록</Text>
      </View>
      {sectionsFor(kind).map((s) => {
        const open = openIds.includes(s.id);
        const fields = s.fields.filter((f) => !f.showIf || f.showIf(value, kind));
        const sum = sectionSummary(s.fields);
        return (
          <View key={s.id} style={styles.section}>
            <Pressable style={styles.sectionHead} onPress={() => toggleOpen(s.id)}>
              <Text style={styles.sectionTitle}>
                {open ? '▾' : '▸'} {s.title}
              </Text>
              {!open && sum ? (
                <Text style={styles.sectionSum} numberOfLines={1}>
                  {sum}
                </Text>
              ) : null}
            </Pressable>
            {open
              ? fields.map((f) => (
                  <View key={f.key} style={styles.field}>
                    <Text style={styles.label}>{f.label}</Text>
                    {renderField(f, value, set)}
                  </View>
                ))
              : null}
          </View>
        );
      })}
      <View style={styles.actions}>
        <Pressable style={[styles.doneButton, done && styles.doneOn]} onPress={toggleDone}>
          <Text style={[styles.doneText, done && styles.doneTextOn]}>
            {done ? `✓ 문의 완료 ${String(value.doneAt ?? '').slice(5, 10).replace('-', '/')}` : '문의 완료로 표시'}
          </Text>
        </Pressable>
        <Pressable style={styles.shareButton} onPress={share}>
          <Text style={styles.shareText}>텍스트로 공유</Text>
        </Pressable>
      </View>
    </View>
  );
}

function renderField(f: Field, v: Inquiry, set: (key: string, x: string | string[] | undefined) => void) {
  const val = v[f.key];
  if (f.type === 'radio') {
    return (
      <View style={styles.chips}>
        {f.options!.map((o) => (
          <Chip key={o} label={o} on={val === o} onPress={() => set(f.key, val === o ? undefined : o)} />
        ))}
      </View>
    );
  }
  if (f.type === 'multi') {
    const arr = Array.isArray(val) ? val : [];
    return (
      <View style={styles.chips}>
        {f.options!.map((o) => (
          <Chip key={o} label={o} on={arr.includes(o)} onPress={() => set(f.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} />
        ))}
      </View>
    );
  }
  if (f.type === 'number') {
    return (
      <View style={styles.numberRow}>
        <TextInput
          style={styles.numberInput}
          value={typeof val === 'string' ? val : ''}
          onChangeText={(t) => set(f.key, t.replace(/[^0-9.]/g, ''))}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={C.muted}
        />
        {f.unit ? <Text style={styles.unit}>{f.unit}</Text> : null}
      </View>
    );
  }
  if (f.type === 'text') {
    return (
      <TextInput
        style={styles.textInput}
        value={typeof val === 'string' ? val : ''}
        onChangeText={(t) => set(f.key, t)}
        placeholder={f.placeholder ?? '내용'}
        placeholderTextColor={C.muted}
        multiline
      />
    );
  }
  if (f.type === 'monthPeriod') {
    const m = v[`${f.key}Month`];
    const p = v[`${f.key}Period`];
    return (
      <View style={styles.stack}>
        <View style={styles.chips}>
          {MONTHS.map((o) => (
            <Chip key={o} label={`${o}월`} on={m === o} onPress={() => set(`${f.key}Month`, m === o ? undefined : o)} />
          ))}
        </View>
        <View style={styles.chips}>
          {PERIODS.map((o) => (
            <Chip key={o} label={o} on={p === o} onPress={() => set(`${f.key}Period`, p === o ? undefined : o)} />
          ))}
        </View>
      </View>
    );
  }
  // dateTime
  const d = v[`${f.key}Date`];
  const t = v[`${f.key}Time`];
  return (
    <View style={styles.numberRow}>
      <TextInput
        style={[styles.textInput, styles.flex]}
        value={typeof d === 'string' ? d : ''}
        onChangeText={(x) => set(`${f.key}Date`, x)}
        placeholder="날짜 (예: 10/5 토)"
        placeholderTextColor={C.muted}
      />
      <TextInput
        style={[styles.textInput, styles.flex]}
        value={typeof t === 'string' ? t : ''}
        onChangeText={(x) => set(`${f.key}Time`, x)}
        placeholder="시간 (예: 14:00)"
        placeholderTextColor={C.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { gap: 6, padding: 10, borderRadius: 10, backgroundColor: C.ground, borderWidth: 1, borderColor: C.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: C.ink },
  count: { fontSize: 12, color: C.muted },
  section: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, gap: 8 },
  sectionHead: { minHeight: 40, justifyContent: 'center', gap: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  sectionSum: { fontSize: 12, color: C.accentDark },
  field: { gap: 6, paddingBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stack: { gap: 6 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numberInput: { width: 120, height: 40, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, fontSize: 15, color: C.ink },
  unit: { fontSize: 13, color: C.body },
  textInput: { minHeight: 40, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, fontSize: 14, color: C.ink },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 6 },
  doneButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  doneOn: { backgroundColor: C.accent },
  doneText: { fontSize: 14, fontWeight: '700', color: C.accent },
  doneTextOn: { color: '#FFFFFF' },
  shareButton: { height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  shareText: { fontSize: 14, fontWeight: '600', color: C.body },
});
