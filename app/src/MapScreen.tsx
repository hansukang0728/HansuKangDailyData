// 단지 주변 인프라 지도: 관심 목록의 단지들을 지도에 찍고, 고른 단지 반경 안의
// 지하철·학교·학원·마트·병원·공원 등을 카카오 로컬 API로 찾아 지도와 목록으로 보여준다.
// 지도는 Leaflet + CARTO(OpenStreetMap) 타일이라 따로 키가 필요 없다.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { Chip } from './Chip';
import { CATEGORIES, loadKakaoKey, Place, saveKakaoKey, searchPlaces, walkMinutes } from './kakao';
import { C } from './theme';

export interface MapComplex {
  number: string;
  name: string;
  lat?: number;
  lng?: number;
}

interface Props {
  complexes: MapComplex[];
  topPad: number;
  onClose: () => void;
}

const RADII = [500, 1000, 2000];
const DEFAULT_CATEGORIES = ['subway', 'school', 'academy', 'mart', 'hospital', 'park'];

const MAP_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#map{margin:0;height:100%}
.cx{background:#fff;border:2px solid #1C1B19;border-radius:12px;padding:2px 7px;font:700 12px sans-serif;color:#1C1B19;white-space:nowrap;transform:translate(-50%,-50%);display:inline-block}
.cx.on{background:#0E6560;border-color:#0E6560;color:#fff}
</style></head><body><div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var map=L.map('map').setView([37.43,127.0],15);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',{subdomains:'abcd',maxZoom:19,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
var layer=L.layerGroup().addTo(map);
var markers={};
window.update=function(d){
  layer.clearLayers(); markers={};
  d.complexes.forEach(function(c){
    var m=L.marker([c.lat,c.lng],{icon:L.divIcon({className:'',html:'<div class="cx'+(c.selected?' on':'')+'">'+esc(c.name)+'</div>'}),zIndexOffset:1000}).addTo(layer);
    m.on('click',function(){post({type:'complex',number:c.number});});
  });
  if(d.center){L.circle([d.center.lat,d.center.lng],{radius:d.radius,color:'#0E6560',weight:1,fillOpacity:0.05}).addTo(layer);}
  d.places.forEach(function(p){
    markers[p.id]=L.circleMarker([p.lat,p.lng],{radius:6,color:'#fff',weight:1.5,fillColor:p.color,fillOpacity:1})
      .bindPopup('<b>'+esc(p.name)+'</b><br>'+esc(p.detail)+' · '+p.distance+'m').addTo(layer);
  });
  if(d.fit&&d.center){map.setView([d.center.lat,d.center.lng],d.radius<=500?16:d.radius<=1000?15:14);}
};
window.focusPlace=function(id){var m=markers[id];if(m){map.setView(m.getLatLng(),17);m.openPopup();}};
post({type:'ready'});
</script></body></html>`;

export function MapScreen({ complexes, topPad, onClose }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const web = useRef<WebView>(null);

  const located = useMemo(() => complexes.filter((c) => c.lat && c.lng), [complexes]);
  const [selected, setSelected] = useState(located[0]?.number);
  const [cats, setCats] = useState<string[]>(DEFAULT_CATEGORIES);
  const [radius, setRadius] = useState(1000);
  const [key, setKey] = useState<string>();
  const [keyInput, setKeyInput] = useState('');
  const [editKey, setEditKey] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [result, setResult] = useState<{ request: string; places: Place[]; error?: string }>({ request: '', places: [] });

  useEffect(() => {
    loadKakaoKey().then(setKey);
  }, []);

  const center = located.find((c) => c.number === selected);
  const request = center && key ? `${center.number}|${radius}|${cats.join(',')}|${key}` : '';
  const loading = !!request && result.request !== request;

  // 고른 단지·카테고리·반경의 시설을 찾는다 (카테고리마다 한 번씩, 7일 캐시)
  useEffect(() => {
    if (!request || !center?.lat || !center.lng || !key) return;
    let alive = true;
    (async () => {
      const found: Place[] = [];
      let error: string | undefined;
      for (const cat of CATEGORIES.filter((c) => cats.includes(c.id))) {
        try {
          found.push(...(await searchPlaces(key, cat, center.lat!, center.lng!, radius)));
        } catch (e: any) {
          error = e?.message ?? String(e);
          break;
        }
      }
      if (alive) setResult({ request, places: found, error });
    })();
    return () => {
      alive = false;
    };
  }, [request, center?.lat, center?.lng, key, cats, radius]);

  const places = useMemo(() => (result.request === request ? result.places : []), [result, request]);
  const colorOf = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color])), []);

  // 지도 다시 그리기
  const lastFit = useRef('');
  useEffect(() => {
    if (!mapReady) return;
    const fitKey = `${selected}|${radius}`;
    const payload = {
      complexes: located.map((c) => ({ number: c.number, name: c.name, lat: c.lat, lng: c.lng, selected: c.number === selected })),
      center: center ? { lat: center.lat, lng: center.lng } : null,
      radius,
      places: places.map((p) => ({ ...p, color: colorOf[p.categoryId] })),
      fit: lastFit.current !== fitKey,
    };
    lastFit.current = fitKey;
    web.current?.injectJavaScript(`window.update(${JSON.stringify(payload)});true;`);
  }, [mapReady, located, selected, center, radius, places, colorOf]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') setMapReady(true);
      if (msg.type === 'complex') setSelected(msg.number);
    } catch {
      // 무시
    }
  };

  const focus = (p: Place) => web.current?.injectJavaScript(`window.focusPlace(${JSON.stringify(p.id)});true;`);

  const saveKey = async () => {
    await saveKakaoKey(keyInput);
    setKey(keyInput.trim());
    setEditKey(false);
  };

  const needKey = key !== undefined && (!key || editKey);

  const list = (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {needKey ? (
        <View style={styles.keyBox}>
          <Text style={styles.keyTitle}>카카오 REST API 키 입력</Text>
          <Text style={styles.keyHelp}>
            developers.kakao.com → 내 애플리케이션 → 앱 추가 → 앱 키의 ‘REST API 키’를 붙여넣어 주세요. 키는 이 폰에만
            저장돼요. 오류가 나면 앱 설정의 제품 설정에서 ‘카카오맵’을 사용으로 켜 주세요.
          </Text>
          <TextInput
            style={styles.keyInput}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="REST API 키"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.keyButton} onPress={saveKey} disabled={!keyInput.trim()}>
            <Text style={styles.keyButtonText}>저장</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://developers.kakao.com/console/app')}>
            <Text style={styles.link}>카카오 개발자 사이트 열기</Text>
          </Pressable>
        </View>
      ) : !located.length ? (
        <Text style={styles.message}>단지 위치가 아직 없어요. 목록에서 새로고침을 한 번 해 주세요.</Text>
      ) : loading ? (
        <ActivityIndicator style={styles.spinner} color={C.accent} />
      ) : result.error ? (
        <View style={styles.keyBox}>
          <Text style={styles.error}>{result.error}</Text>
          <Pressable onPress={() => setEditKey(true)}>
            <Text style={styles.link}>키 다시 입력</Text>
          </Pressable>
        </View>
      ) : (
        CATEGORIES.filter((c) => cats.includes(c.id)).map((cat) => {
          const items = places.filter((p) => p.categoryId === cat.id);
          return (
            <View key={cat.id} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: cat.color }]} />
                <Text style={styles.groupTitle}>
                  {cat.label} {items.length}곳{items[0] ? ` · 가장 가까운 곳 도보 ${walkMinutes(items[0].distance)}분` : ''}
                </Text>
              </View>
              {items.slice(0, 8).map((p) => (
                <Pressable key={p.id} style={styles.place} onPress={() => focus(p)} onLongPress={() => p.url && Linking.openURL(p.url)}>
                  <View style={styles.flex}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.placeMeta} numberOfLines={1}>
                      {p.detail} · {p.address}
                    </Text>
                  </View>
                  <Text style={styles.placeDist}>
                    {p.distance < 1000 ? `${p.distance}m` : `${(p.distance / 1000).toFixed(1)}km`}
                    {'\n'}도보 {walkMinutes(p.distance)}분
                  </Text>
                </Pressable>
              ))}
              {items.length > 8 ? <Text style={styles.more}>외 {items.length - 8}곳 (지도에 모두 표시)</Text> : null}
            </View>
          );
        })
      )}
      {!needKey && key ? (
        <Pressable onPress={() => setEditKey(true)}>
          <Text style={styles.linkSmall}>카카오 키 바꾸기</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: topPad }]}>
        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>← 닫기</Text>
        </Pressable>
        <Text style={styles.title}>주변 인프라</Text>
      </View>

      <ScrollView horizontal style={styles.rowWrap} contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
        {complexes.map((c) => (
          <Chip
            key={c.number}
            label={c.lat ? c.name : `${c.name} (위치 없음)`}
            variant="sort"
            on={c.number === selected}
            onPress={() => c.lat && setSelected(c.number)}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal style={styles.rowWrap} contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
        {RADII.map((r) => (
          <Chip key={r} label={r < 1000 ? `${r}m` : `${r / 1000}km`} on={radius === r} onPress={() => setRadius(r)} />
        ))}
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            label={c.label}
            on={cats.includes(c.id)}
            onPress={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
          />
        ))}
      </ScrollView>

      <View style={wide ? styles.splitRow : styles.flex}>
        <View style={wide ? styles.mapWide : styles.map}>
          <WebView
            ref={web}
            originWhitelist={['*']}
            source={{ html: MAP_HTML, baseUrl: 'https://localhost' }}
            javaScriptEnabled
            onMessage={onMessage}
          />
        </View>
        {list}
      </View>
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
  rowWrap: { flexGrow: 0, backgroundColor: C.surface },
  row: { gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  splitRow: { flex: 1, flexDirection: 'row' },
  map: { height: '45%', borderBottomWidth: 1, borderBottomColor: C.line },
  mapWide: { flex: 1, borderRightWidth: 1, borderRightColor: C.line },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 12, paddingBottom: 32 },
  group: { gap: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  place: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surface },
  placeName: { fontSize: 14, fontWeight: '600', color: C.ink },
  placeMeta: { fontSize: 12, color: C.muted },
  placeDist: { fontSize: 12, color: C.body, textAlign: 'right' },
  more: { fontSize: 12, color: C.muted, paddingLeft: 10 },
  message: { padding: 20, textAlign: 'center', color: C.muted },
  spinner: { marginTop: 24 },
  error: { fontSize: 13, color: C.error, fontWeight: '600' },
  keyBox: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  keyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  keyHelp: { fontSize: 13, lineHeight: 19, color: C.body },
  keyInput: { height: 44, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: C.lineStrong, fontSize: 14, color: C.ink },
  keyButton: { height: 44, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  keyButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  link: { fontSize: 13, fontWeight: '600', color: C.accent, paddingVertical: 8 },
  linkSmall: { fontSize: 12, color: C.muted, textDecorationLine: 'underline', paddingVertical: 8 },
});
