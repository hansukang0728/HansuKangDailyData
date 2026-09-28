// 네이버 부동산을 앱 안에서 열어 단지를 검색하고, 단지 화면에 들어가면 주소의
// /complexes/{번호}에서 단지번호를 읽어 목록에 추가한다. (단지번호를 몰라도 됨)
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { C } from './theme';

// 네이버는 한 페이지 안에서 주소만 바꾸며 이동하므로, 주소·제목을 주기적으로 알려 준다
const WATCH_JS = `
(function () {
  if (window.__rnWatch) return;
  window.__rnWatch = true;
  var last = '';
  function tick() {
    var og = document.querySelector('meta[property="og:title"]');
    var msg = JSON.stringify({ url: location.href, title: document.title, og: og ? og.content : '' });
    if (msg !== last) { last = msg; window.ReactNativeWebView.postMessage(msg); }
  }
  setInterval(tick, 700);
  tick();
})();
true;`;

// "개포래미안포레스트 - 네이버페이 부동산" 같은 제목에서 단지 이름만
function cleanTitle(t: string): string {
  const name = t.split(/\s[-|:·]\s/)[0]?.trim() ?? '';
  return /부동산|네이버/.test(name) ? '' : name;
}

interface Props {
  profileName: string;
  existing: string[];
  topPad: number;
  onPick: (complexNumber: string, name: string) => void;
  onClose: () => void;
}

export function ComplexPicker({ profileName, existing, topPad, onPick, onClose }: Props) {
  const [found, setFound] = useState<{ number: string; name: string }>();
  const [added, setAdded] = useState<string[]>([]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const { url, title, og } = JSON.parse(e.nativeEvent.data);
      const m = /\/complexes\/(\d+)/.exec(String(url));
      if (!m) {
        setFound(undefined);
        return;
      }
      setFound({ number: m[1], name: cleanTitle(String(og || '')) || cleanTitle(String(title || '')) });
    } catch {
      // 무시
    }
  };

  const already = found && (existing.includes(found.number) || added.includes(found.number));

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 완료</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {profileName}에 단지 추가
        </Text>
      </View>
      <Text style={styles.help}>네이버 부동산에서 단지를 검색해 단지 화면으로 들어가면 아래에 추가 버튼이 나와요.</Text>
      <WebView
        source={{ uri: 'https://fin.land.naver.com/' }}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScript={WATCH_JS}
        onMessage={onMessage}
      />
      {found ? (
        <View style={styles.footer}>
          <View style={styles.flex}>
            <Text style={styles.foundName} numberOfLines={1}>
              {found.name || '이 단지'}
            </Text>
            <Text style={styles.foundNumber}>단지번호 {found.number}</Text>
          </View>
          <Pressable
            style={[styles.add, already && styles.addDisabled]}
            disabled={!!already}
            onPress={() => {
              onPick(found.number, found.name);
              setAdded([...added, found.number]);
            }}
          >
            <Text style={styles.addText}>{already ? '추가됨' : '이 단지 추가'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, backgroundColor: C.surface },
  flex: { flex: 1 },
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
  help: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.ground },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.surface,
  },
  foundName: { fontSize: 15, fontWeight: '700', color: C.ink },
  foundNumber: { fontSize: 12, color: C.muted },
  add: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: C.accent, justifyContent: 'center' },
  addDisabled: { backgroundColor: C.muted },
  addText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
