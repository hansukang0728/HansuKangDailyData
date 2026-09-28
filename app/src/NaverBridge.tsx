// 보이지 않는 WebView로 fin.land.naver.com 지도 페이지를 열어 두고, 그 페이지 안에서
// 매물 API를 fetch한다. PC 수집기(crawl_complex.py)가 Playwright로 하던 방식과 같다.
// 네이버는 앱/서버에서 직접 호출하면 막기 때문에 반드시 이 페이지 컨텍스트에서 호출해야 한다.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

export const MAP_URL =
  'https://fin.land.naver.com/map?center=3zkve1-2AAmjA&zoom=15.000000000000002' +
  '&layer=NobwRAlgJmBcYGMD2BbADgGwKYA8D6UWALgIYQZgA0YaJATiSgM5zjLrY4CSM8AjAAY%2BAJgDsAZjABf' +
  'akyz0EACwAK9Ri1jgITAGrkMJOADMSGOdVIAjOGHpEICbNOp1iAVzoA7EpaewidG5YUgC6QA';

// PC 크롬으로 보이게 해야 PC 수집기와 같은 응답을 받는다
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export interface CollectResult {
  items: any[];
  pages: number;
}

export interface NaverBridgeHandle {
  collect(complexNumber: string, tradeTypes: string[], onProgress?: (count: number) => void): Promise<CollectResult>;
  reload(): void;
}

interface Props {
  visible: boolean;
  topInset: number; // 보일 때 위쪽에 남겨 둘 공간 (닫기 막대 자리)
  onStatus: (status: 'loading' | 'ready' | 'error', detail?: string) => void;
}

function buildScript(id: string, complexNumber: string, tradeTypes: string[]): string {
  return `
(async function () {
  var post = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  try {
    var items = [], lastInfo = [], seed = 'app-' + Date.now(), pages = 0;
    for (var i = 0; i < 40; i++) {
      var res = await fetch('https://fin.land.naver.com/front-api/v1/complex/article/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json, text/plain, */*' },
        body: JSON.stringify({
          size: 30, complexNumber: ${JSON.stringify(complexNumber)}, tradeTypes: ${JSON.stringify(tradeTypes)},
          pyeongTypes: [], dongNumbers: [], userChannelType: 'PC', articleSortType: 'RANKING_DESC',
          seed: seed, lastInfo: lastInfo
        }),
        credentials: 'include'
      });
      var text = await res.text();
      if (res.status !== 200) { post({ id: ${JSON.stringify(id)}, ok: false, error: 'HTTP ' + res.status + ' ' + text.slice(0, 300) }); return; }
      var data = JSON.parse(text).result;
      items = items.concat(data.list || []);
      pages++;
      post({ id: ${JSON.stringify(id)}, progress: items.length });
      if (!data.hasNextPage) break;
      lastInfo = data.lastInfo;
      await new Promise(function (r) { setTimeout(r, 1500); });
    }
    post({ id: ${JSON.stringify(id)}, ok: true, items: items, pages: pages });
  } catch (e) {
    post({ id: ${JSON.stringify(id)}, ok: false, error: String(e) });
  }
})();
true;`;
}

interface Pending {
  resolve: (r: CollectResult) => void;
  reject: (e: Error) => void;
  onProgress?: (count: number) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const NaverBridge = forwardRef<NaverBridgeHandle, Props>(function NaverBridge({ visible, topInset, onStatus }, ref) {
  const webRef = useRef<WebView>(null);
  const pending = useRef(new Map<string, Pending>());

  useImperativeHandle(ref, () => ({
    collect(complexNumber, tradeTypes, onProgress) {
      return new Promise<CollectResult>((resolve, reject) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error('시간 초과 (90초). 네이버 페이지가 제대로 열렸는지 확인하세요.'));
        }, 90000);
        pending.current.set(id, { resolve, reject, onProgress, timer });
        webRef.current?.injectJavaScript(buildScript(id, complexNumber, tradeTypes));
      });
    },
    reload() {
      onStatus('loading');
      webRef.current?.reload();
    },
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const p = pending.current.get(msg.id);
    if (!p) return;
    if (msg.progress !== undefined) {
      p.onProgress?.(msg.progress);
      return;
    }
    clearTimeout(p.timer);
    pending.current.delete(msg.id);
    if (msg.ok) p.resolve({ items: msg.items, pages: msg.pages });
    else p.reject(new Error(msg.error));
  };

  return (
    <View style={visible ? [styles.visible, { marginTop: topInset }] : styles.hidden} pointerEvents={visible ? 'auto' : 'none'}>
      <WebView
        ref={webRef}
        source={{ uri: MAP_URL }}
        userAgent={DESKTOP_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        onMessage={onMessage}
        onLoadStart={() => onStatus('loading')}
        onLoadEnd={() => onStatus('ready')}
        onError={(e) => onStatus('error', e.nativeEvent.description)}
        onHttpError={(e) => onStatus('error', `HTTP ${e.nativeEvent.statusCode}`)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  // 지도 페이지가 정상적으로 그려지도록 크기는 화면 전체로 두고 투명하게 뒤에 깔아 둔다
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, zIndex: -1 },
  visible: { flex: 1 },
});
