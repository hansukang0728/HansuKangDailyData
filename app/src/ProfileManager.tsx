// 관심 목록 관리: 목록 이름 바꾸기, 단지 추가·빼기, 목록 만들기·지우기
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ComplexPicker } from './ComplexPicker';
import { Profile, RENT_TRADE_TYPES, resolveComplexInput } from './complexes';
import { C } from './theme';

interface Props {
  profiles: Profile[];
  activeId: string;
  nameOf: (profile: Profile, complexNumber: string) => string;
  topPad: number;
  onChange: (profiles: Profile[]) => void;
  onDelete: (profileId: string) => void;
  onSelect: (profileId: string) => void;
  onClose: () => void;
}

export function ProfileManager({ profiles, activeId, nameOf, topPad, onChange, onDelete, onSelect, onClose }: Props) {
  const [pickFor, setPickFor] = useState<string>();
  // 목록별 "단지번호 또는 링크" 입력값과 처리 상태
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string>();
  const [inputError, setInputError] = useState<Record<string, string>>({});

  const update = (id: string, patch: Partial<Profile>) =>
    onChange(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addComplex = (id: string, number: string, name: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p || p.complexes.includes(number)) return;
    update(id, { complexes: [...p.complexes, number], names: name ? { ...p.names, [number]: name } : p.names });
  };

  const addFromInput = async (p: Profile) => {
    const text = inputs[p.id] ?? '';
    if (!text.trim()) return;
    setResolving(p.id);
    const number = await resolveComplexInput(text);
    setResolving(undefined);
    if (!number) {
      setInputError({ ...inputError, [p.id]: '단지번호를 찾지 못했어요. 숫자나 네이버 부동산 단지 링크를 넣어주세요.' });
      return;
    }
    if (p.complexes.includes(number)) {
      setInputError({ ...inputError, [p.id]: `단지번호 ${number}는 이미 있어요.` });
      return;
    }
    addComplex(p.id, number, '');
    setInputs({ ...inputs, [p.id]: '' });
    setInputError({ ...inputError, [p.id]: '' });
  };

  const removeComplex = (p: Profile, number: string) =>
    Alert.alert('단지 빼기', `${nameOf(p, number)}을(를) ${p.name}에서 뺄까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '빼기', style: 'destructive', onPress: () => update(p.id, { complexes: p.complexes.filter((c) => c !== number) }) },
    ]);

  const removeProfile = (p: Profile) =>
    Alert.alert('목록 지우기', `${p.name} 목록과 조회 기록을 지울까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => onDelete(p.id) },
    ]);

  const addProfile = () => {
    const id = `p-${Date.now()}`;
    onChange([...profiles, { id, name: '새 목록', complexes: [], names: {}, tradeTypes: RENT_TRADE_TYPES }]);
  };

  const picking = profiles.find((p) => p.id === pickFor);

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 닫기</Text>
        </Pressable>
        <Text style={styles.title}>목록·단지 관리</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {profiles.map((p) => (
          <View key={p.id} style={[styles.card, p.id === activeId && styles.cardActive]}>
            <View style={styles.row}>
              <TextInput
                style={styles.nameInput}
                value={p.name}
                onChangeText={(name) => update(p.id, { name })}
                accessibilityLabel="목록 이름"
              />
              {p.id !== activeId ? (
                <Pressable style={styles.smallButton} onPress={() => onSelect(p.id)}>
                  <Text style={styles.smallButtonText}>이 목록 보기</Text>
                </Pressable>
              ) : (
                <Text style={styles.activeLabel}>보는 중</Text>
              )}
            </View>
            <Text style={styles.meta}>전세·월세 · 단지 {p.complexes.length}곳</Text>
            {p.complexes.map((cn) => (
              <View key={cn} style={styles.complexRow}>
                <View style={styles.flex}>
                  <Text style={styles.complexName}>{nameOf(p, cn)}</Text>
                  <Text style={styles.meta}>단지번호 {cn}</Text>
                </View>
                <Pressable style={styles.removeButton} onPress={() => removeComplex(p, cn)}>
                  <Text style={styles.removeText}>빼기</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={inputs[p.id] ?? ''}
                onChangeText={(t) => setInputs({ ...inputs, [p.id]: t })}
                placeholder="단지번호 또는 네이버 링크 붙여넣기"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => addFromInput(p)}
                accessibilityLabel="단지번호 또는 네이버 부동산 링크"
              />
              <Pressable style={styles.inputButton} onPress={() => addFromInput(p)} disabled={resolving === p.id}>
                {resolving === p.id ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.inputButtonText}>추가</Text>
                )}
              </Pressable>
            </View>
            {inputError[p.id] ? <Text style={styles.inputError}>{inputError[p.id]}</Text> : null}
            <View style={styles.row}>
              <Pressable style={styles.addButton} onPress={() => setPickFor(p.id)}>
                <Text style={styles.addText}>네이버에서 검색해 추가</Text>
              </Pressable>
              {profiles.length > 1 ? (
                <Pressable style={styles.deleteButton} onPress={() => removeProfile(p)}>
                  <Text style={styles.removeText}>목록 지우기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
        <Pressable style={styles.newButton} onPress={addProfile}>
          <Text style={styles.newText}>+ 새 목록 만들기</Text>
        </Pressable>
      </ScrollView>

      {picking ? (
        <ComplexPicker
          profileName={picking.name}
          existing={picking.complexes}
          topPad={topPad}
          onPick={(number, name) => addComplex(picking.id, number, name)}
          onClose={() => setPickFor(undefined)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15, backgroundColor: C.ground },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.surface,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink },
  button: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.lineStrong, justifyContent: 'center' },
  buttonText: { fontSize: 13, color: C.ink },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { padding: 14, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  cardActive: { borderWidth: 2, borderColor: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    fontSize: 17,
    fontWeight: '700',
    color: C.ink,
  },
  activeLabel: { fontSize: 13, fontWeight: '700', color: C.accent, paddingHorizontal: 6 },
  smallButton: { height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: C.accentSoft, justifyContent: 'center' },
  smallButtonText: { fontSize: 13, fontWeight: '600', color: C.accentDark },
  meta: { fontSize: 12, color: C.muted },
  complexRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: C.ground },
  complexName: { fontSize: 14, fontWeight: '600', color: C.ink },
  removeButton: { height: 36, paddingHorizontal: 10, justifyContent: 'center' },
  removeText: { fontSize: 13, fontWeight: '600', color: C.error },
  addButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 14, fontWeight: '700', color: C.accent },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.lineStrong,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.surface,
  },
  inputButton: { height: 44, minWidth: 64, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  inputButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  inputError: { fontSize: 12, color: C.error },
  deleteButton: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  newButton: { height: 48, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  newText: { fontSize: 14, fontWeight: '600', color: C.body },
});
