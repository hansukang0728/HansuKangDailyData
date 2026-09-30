// 기기 간 공유 설정 화면: Firebase 데이터베이스 주소와 가족 코드를 넣고 연결한다.
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { cleanCode, cleanUrl, makeCode, SyncConfig, testConnection } from './sync';
import { C } from './theme';

interface Props {
  config?: SyncConfig;
  status: string; // 마지막 동기화 결과 문구
  syncing: boolean;
  topPad: number;
  onSave: (c: SyncConfig | undefined) => void;
  onSyncNow: () => void;
  onClose: () => void;
}

const RULES = `{
  "rules": {
    "families": {
      "$code": {
        ".read": "$code.length >= 6",
        ".write": "$code.length >= 6"
      }
    }
  }
}`;

export function SyncSettings({ config, status, syncing, topPad, onSave, onSyncNow, onClose }: Props) {
  const [url, setUrl] = useState(config?.url ?? '');
  const [code, setCode] = useState(config?.code ?? '');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(!config);

  const connect = async () => {
    const c = { url: cleanUrl(url), code: cleanCode(code) };
    setTesting(true);
    setError('');
    try {
      await testConnection(c);
      onSave(c);
      setShowHelp(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setTesting(false);
    }
  };

  const shareCode = () =>
    Share.share({
      message: `전월세 앱 공유 설정\n데이터베이스 주소: ${cleanUrl(url)}\n가족 코드: ${cleanCode(code)}\n\n앱의 "공유" 화면에 위 두 개를 넣고 연결을 누르세요.`,
    });

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 닫기</Text>
        </Pressable>
        <Text style={styles.title}>기기 간 공유</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          메모·문의 기록·즐겨찾기·관심 목록을 여러 기기에서 같이 봐요. 같은 항목을 두 기기에서 고치면 나중에 저장한 쪽이 남아요. 신규·가격변동
          판정 기록은 기기마다 따로 둬요.
        </Text>

        {config ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusTitle}>연결됨 · 가족 코드 {config.code}</Text>
            <Text style={styles.statusText}>{status || '아직 동기화하지 않았어요'}</Text>
            <View style={styles.row}>
              <Pressable style={styles.primary} onPress={onSyncNow} disabled={syncing}>
                {syncing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>지금 동기화</Text>}
              </Pressable>
              <Pressable style={styles.secondary} onPress={shareCode}>
                <Text style={styles.secondaryText}>다른 기기에 설정 보내기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.label}>데이터베이스 주소</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://xxxx-default-rtdb.firebaseio.com"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.label}>가족 코드</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={code}
            onChangeText={setCode}
            placeholder="영문·숫자 6자 이상"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.secondary} onPress={() => setCode(makeCode())}>
            <Text style={styles.secondaryText}>새로 만들기</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          가족 코드는 비밀번호 역할이에요. 첫 기기에서 만들고, 다른 기기에는 같은 코드를 넣어요. 짧거나 뻔한 코드는 남이 맞힐 수 있어요.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primary} onPress={connect} disabled={testing || !url.trim() || !code.trim()}>
          {testing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{config ? '다시 연결' : '연결'}</Text>}
        </Pressable>
        {config ? (
          <Pressable style={styles.linkButton} onPress={() => onSave(undefined)}>
            <Text style={styles.linkDanger}>연결 끊기 (이 기기만, 데이터는 남아요)</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.linkButton} onPress={() => setShowHelp(!showHelp)}>
          <Text style={styles.link}>{showHelp ? '▾' : '▸'} Firebase 설정 방법 (처음 한 번)</Text>
        </Pressable>
        {showHelp ? (
          <View style={styles.helpBox}>
            <Text style={styles.step}>1. console.firebase.google.com 에 구글 계정으로 로그인 → 프로젝트 만들기 (이름은 아무거나, 애널리틱스는 꺼도 돼요)</Text>
            <Text style={styles.step}>2. 왼쪽 메뉴 빌드 → Realtime Database → 데이터베이스 만들기. 위치는 아시아(asia-southeast1) 등 가까운 곳, 보안 규칙은 잠금 모드로 시작</Text>
            <Text style={styles.step}>3. 규칙 탭에서 내용을 아래 것으로 바꾸고 게시</Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>
                {RULES}
              </Text>
            </View>
            <Pressable style={styles.secondary} onPress={() => Share.share({ message: RULES })}>
              <Text style={styles.secondaryText}>규칙 텍스트 보내기</Text>
            </Pressable>
            <Text style={styles.step}>4. 데이터 탭 위에 보이는 주소(https://…firebaseio.com 또는 …firebasedatabase.app)를 복사해서 위 칸에 붙여넣기</Text>
            <Text style={styles.step}>5. 가족 코드를 새로 만들고 연결 → 연결되면 ‘다른 기기에 설정 보내기’로 나머지 기기에 전달</Text>
            <Pressable style={styles.linkButton} onPress={() => Linking.openURL('https://console.firebase.google.com')}>
              <Text style={styles.link}>Firebase 콘솔 열기</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 12, backgroundColor: C.ground },
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
  content: { padding: 14, gap: 10, paddingBottom: 40 },
  help: { fontSize: 13, lineHeight: 19, color: C.body },
  statusBox: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent },
  statusTitle: { fontSize: 14, fontWeight: '700', color: C.accentDark },
  statusText: { fontSize: 13, color: C.body },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 4 },
  input: { height: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, fontSize: 14, color: C.ink },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hint: { fontSize: 12, lineHeight: 17, color: C.muted },
  error: { fontSize: 13, fontWeight: '600', color: C.error },
  primary: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  secondary: { height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13, fontWeight: '600', color: C.body },
  linkButton: { minHeight: 40, justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: C.accent },
  linkDanger: { fontSize: 13, fontWeight: '600', color: C.error },
  helpBox: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  step: { fontSize: 13, lineHeight: 19, color: C.body },
  codeBox: { padding: 10, borderRadius: 8, backgroundColor: C.ground },
  code: { fontSize: 12, lineHeight: 17, color: C.ink, fontFamily: 'monospace' },
});
