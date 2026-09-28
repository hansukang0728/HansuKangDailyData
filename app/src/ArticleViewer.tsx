// 앱 안에서 네이버 페이지(매물 페이지, 단지 정보 페이지)를 여는 화면.
// 매물 페이지에서는 중개사가 쓴 전체 설명을, 단지 페이지에서는 단지 정보와 평면도를 본다.
// 페이지가 부르는 네이버 API 요청도 기록해 두는데, 상세 설명 API를 찾아 앱이 직접
// 가져오게 만들기 위한 조사용이다 ("요청 기록 공유"로 보내면 그걸로 연결한다).
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { DESKTOP_UA } from './NaverBridge';

const LOGGER_JS = `
(function () {
  if (window.__rnReqLogger) return;
  window.__rnReqLogger = true;
  var send = function (o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
  var wanted = function (u) { return /front-api|\\/api\\//.test(String(u)); };
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var body = init && init.body;
    return origFetch.apply(this, arguments).then(function (res) {
      if (wanted(url)) {
        res.clone().text().then(function (t) {
          send({ method: (init && init.method) || 'GET', url: url, body: typeof body === 'string' ? body.slice(0, 1000) : '', status: res.status, text: t.slice(0, 4000) });
        });
      }
      return res;
    });
  };
  var open = XMLHttpRequest.prototype.open, sendX = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var x = this;
    x.addEventListener('load', function () {
      if (wanted(x.__u)) send({ method: x.__m, url: String(x.__u), body: typeof b === 'string' ? b.slice(0, 1000) : '', status: x.status, text: String(x.responseText).slice(0, 4000) });
    });
    return sendX.apply(this, arguments);
  };
})();
true;`;

interface RequestLog {
  method: string;
  url: string;
  body: string;
  status: number;
  text: string;
}

interface Props {
  url: string;
  title: string;
  topPad: number;
  onClose: () => void;
}

export function ArticleViewer({ url, title, topPad, onClose }: Props) {
  const logs = useRef<RequestLog[]>([]);
  const [count, setCount] = useState(0);
  // 사람이 보는 화면이라 기본은 모바일 화면. 모바일 화면이 깨지면 PC 화면으로 바꿔 볼 수 있다
  // (수집용 NaverBridge는 PC 화면이어야 하므로 이 설정과 무관)
  const [desktop, setDesktop] = useState(false);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      logs.current.push(JSON.parse(e.nativeEvent.data));
      setCount(logs.current.length);
    } catch {
      // 기록 형식이 아니면 무시
    }
  };

  const shareLogs = () => {
    const text = JSON.stringify(logs.current, null, 1);
    Share.share({ message: `${url} 요청 기록 ${logs.current.length}건\n\n${text.slice(0, 60000)}` });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 닫기</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable style={styles.button} onPress={() => setDesktop(!desktop)}>
          <Text style={styles.buttonText}>{desktop ? '모바일 화면' : 'PC 화면'}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={shareLogs} disabled={count === 0}>
          <Text style={styles.buttonText}>기록 {count}</Text>
        </Pressable>
      </View>
      <WebView
        key={desktop ? 'desktop' : 'mobile'}
        source={{ uri: url }}
        userAgent={desktop ? DESKTOP_UA : undefined}
        setBuiltInZoomControls
        setDisplayZoomControls={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={LOGGER_JS}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: '#FFFFFF' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E0D8',
    backgroundColor: '#FFFFFF',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1B19' },
  button: { height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: '#D6D1C7', justifyContent: 'center' },
  buttonText: { fontSize: 13, color: '#1C1B19' },
});
