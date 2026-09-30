// 단지 주변 인프라 지도: 관심 목록의 단지들을 지도에 찍고, 고른 단지 반경 안의
// 지하철·학교·학원·마트·병원·공원 등을 카카오 로컬 API로 찾아 지도와 목록으로 보여준다.
// 지도는 카카오 JavaScript 키가 있으면 카카오 지도, 없거나 불러오지 못하면 Leaflet + OpenStreetMap.
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
import {
  CATEGORIES,
  cleanKakaoKey,
  distanceM,
  findPlace,
  loadKakaoJsKey,
  loadKakaoKey,
  Place,
  saveKakaoJsKey,
  saveKakaoKey,
  searchPlaces,
  walkMinutes,
} from './kakao';
import { GWACHEON, SHUTTLE, ShuttleDir } from './shuttle';
import { C } from './theme';

export interface MapComplex {
  number: string;
  name: string;
  lat?: number;
  lng?: number;
}

type ShuttleStopPlace = Pick<Place, 'id' | 'name' | 'lat' | 'lng' | 'url'> & { label: string; missing?: boolean };

interface Props {
  complexes: MapComplex[];
  topPad: number;
  onClose: () => void;
}

const RADII = [500, 1000, 2000];
const SHUTTLE_COLOR = '#1C1B19';

const COMMON_JS = `
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o));}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
`;
const COMMON_CSS = `
html,body,#map{margin:0;height:100%}
.cx{background:#fff;border:2px solid #1C1B19;border-radius:12px;padding:2px 7px;font:700 12px sans-serif;color:#1C1B19;white-space:nowrap;display:inline-block}
.cx.on{background:#0E6560;border-color:#0E6560;color:#fff}
.st{width:22px;height:22px;border-radius:11px;background:#1C1B19;color:#fff;font:700 12px/22px sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.5)}
`;

// 키 없이 쓰는 지도: Leaflet + OpenStreetMap 타일
const LEAFLET_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<style>${COMMON_CSS}.cx,.st{transform:translate(-50%,-50%)}</style></head><body><div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>${COMMON_JS}
var map=L.map('map').setView([37.43,127.0],15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
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
  if(d.stops.length>1){L.polyline(d.stops.map(function(s){return [s.lat,s.lng];}),{color:'#1C1B19',weight:3,dashArray:'6 6'}).addTo(layer);}
  d.stops.forEach(function(s,i){
    markers[s.id]=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'',html:'<div class="st">'+(i+1)+'</div>'}),zIndexOffset:900})
      .bindPopup('<b>'+(i+1)+'. '+esc(s.label)+'</b><br>'+esc(s.name)).addTo(layer);
  });
  if(d.fit){
    if(d.center){map.setView([d.center.lat,d.center.lng],d.radius<=500?16:d.radius<=1000?15:14);}
    else{var pts=d.complexes.map(function(c){return [c.lat,c.lng];}).concat(d.stops.map(function(s){return [s.lat,s.lng];}));
      if(pts.length){map.fitBounds(pts,{padding:[40,40],maxZoom:15});}}
  }
};
window.focusPlace=function(id){var m=markers[id];if(m){map.setView(m.getLatLng(),17);m.openPopup();}};
post({type:'ready'});
</script></body></html>`;

// 카카오 지도 (JavaScript 키 + 플랫폼 Web 도메인 https://localhost 등록 필요)
const kakaoHtml = (jsKey: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>${COMMON_CSS}
.pt{width:12px;height:12px;border-radius:6px;border:1.5px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)}
.pop{background:#fff;border:1px solid #999;border-radius:8px;padding:5px 8px;font:12px sans-serif;color:#1C1B19;white-space:nowrap;margin-bottom:28px}
.pop .m{color:#666}
</style></head><body><div id="map"></div>
<script>${COMMON_JS}
var failed=false;
function fail(why){if(!failed){failed=true;post({type:'mapError',message:why});}}
setTimeout(function(){if(!window.kakao||!kakao.maps||!kakao.maps.LatLng)fail('timeout');},10000);
</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(jsKey)}&autoload=false" onerror="fail('sdk')"></script>
<script>
if(window.kakao&&kakao.maps)kakao.maps.load(function(){
  var map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(37.43,127.0),level:4});
  var items=[];var points={};var pop=null;
  function clear(){items.forEach(function(o){o.setMap(null);});items=[];points={};if(pop){pop.setMap(null);pop=null;}}
  function dom(html){var el=document.createElement('div');el.innerHTML=html;return el.firstChild;}
  function show(p){
    if(pop)pop.setMap(null);
    pop=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(p.lat,p.lng),content:'<div class="pop"><b>'+esc(p.name)+'</b><br>'+esc(p.detail)+' · '+p.distance+'m</div>',yAnchor:1,zIndex:5});
    pop.setMap(map);
  }
  window.update=function(d){
    clear();
    if(d.center){var c=new kakao.maps.Circle({center:new kakao.maps.LatLng(d.center.lat,d.center.lng),radius:d.radius,strokeWeight:1,strokeColor:'#0E6560',fillColor:'#0E6560',fillOpacity:0.05});c.setMap(map);items.push(c);}
    d.places.forEach(function(p){
      var el=dom('<div class="pt" style="background:'+p.color+'"></div>');
      el.addEventListener('click',function(){show(p);});
      var o=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(p.lat,p.lng),content:el,zIndex:2});
      o.setMap(map);items.push(o);points[p.id]=p;
    });
    if(d.stops.length>1){var line=new kakao.maps.Polyline({path:d.stops.map(function(s){return new kakao.maps.LatLng(s.lat,s.lng);}),strokeWeight:3,strokeColor:'#1C1B19',strokeStyle:'dash'});line.setMap(map);items.push(line);}
    d.stops.forEach(function(s,i){
      var sp={id:s.id,lat:s.lat,lng:s.lng,name:(i+1)+'. '+s.label,detail:s.name,distance:s.distance};
      var el=dom('<div class="st">'+(i+1)+'</div>');
      el.addEventListener('click',function(){show(sp);});
      var o=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(s.lat,s.lng),content:el,zIndex:4});
      o.setMap(map);items.push(o);points[s.id]=sp;
    });
    d.complexes.forEach(function(c){
      var el=dom('<div class="cx'+(c.selected?' on':'')+'">'+esc(c.name)+'</div>');
      el.addEventListener('click',function(){post({type:'complex',number:c.number});});
      var o=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(c.lat,c.lng),content:el,zIndex:3});
      o.setMap(map);items.push(o);
    });
    if(d.fit){
      if(d.center){map.setLevel(d.radius<=500?3:d.radius<=1000?5:6);map.setCenter(new kakao.maps.LatLng(d.center.lat,d.center.lng));}
      else{var b=new kakao.maps.LatLngBounds();var n=0;
        d.complexes.concat(d.stops).forEach(function(x){b.extend(new kakao.maps.LatLng(x.lat,x.lng));n++;});
        if(n>1)map.setBounds(b,40,40,40,40);else if(n===1){map.setLevel(4);map.setCenter(b.getCenter());}}
    }
  };
  window.focusPlace=function(id){var p=points[id];if(p){map.setLevel(2);map.setCenter(new kakao.maps.LatLng(p.lat,p.lng));show(p);}};
  post({type:'ready'});
});
</script></body></html>`;

export function MapScreen({ complexes, topPad, onClose }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const web = useRef<WebView>(null);

  const located = useMemo(() => complexes.filter((c) => c.lat && c.lng), [complexes]);
  // 처음 들어오면 아무것도 고르지 않은 상태 (단지·시설·셔틀 모두)
  const [selected, setSelected] = useState<string>();
  const [cats, setCats] = useState<string[]>([]);
  const [shuttle, setShuttle] = useState<ShuttleDir>();
  const [stopsResult, setStopsResult] = useState<{ request: string; stops: ShuttleStopPlace[]; error?: string }>({
    request: '',
    stops: [],
  });
  const [radius, setRadius] = useState(1000);
  const [key, setKey] = useState<string>();
  const [keyInput, setKeyInput] = useState('');
  const [editKey, setEditKey] = useState(false);
  const [jsKey, setJsKey] = useState('');
  const [jsInput, setJsInput] = useState('');
  const [editJs, setEditJs] = useState(false);
  const [mapErrorKey, setMapErrorKey] = useState<string>(); // 이 JavaScript 키로 카카오 지도를 못 불러옴
  const [readyKind, setReadyKind] = useState<string>();
  const [result, setResult] = useState<{ request: string; places: Place[]; error?: string }>({ request: '', places: [] });

  useEffect(() => {
    loadKakaoKey().then(setKey);
    loadKakaoJsKey().then(setJsKey);
  }, []);

  const mapKind = jsKey && mapErrorKey !== jsKey ? `kakao:${jsKey}` : 'osm';
  const mapReady = readyKind === mapKind;
  const mapHtml = useMemo(() => (mapKind === 'osm' ? LEAFLET_HTML : kakaoHtml(jsKey)), [mapKind, jsKey]);

  const center = located.find((c) => c.number === selected);
  const request = center && key && cats.length ? `${center.number}|${radius}|${cats.join(',')}|${key}` : '';
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

  // 셔틀 정류장 위치 찾기 (카카오 장소 검색, 30일 저장)
  const stopsRequest = shuttle && key ? `${shuttle}|${key}` : '';
  const stopsLoading = !!stopsRequest && stopsResult.request !== stopsRequest;
  useEffect(() => {
    if (!stopsRequest || !shuttle || !key) return;
    let alive = true;
    (async () => {
      const stops: ShuttleStopPlace[] = [];
      let error: string | undefined;
      try {
        for (const [i, st] of SHUTTLE[shuttle].stops.entries()) {
          const p = await findPlace(key, st.query, GWACHEON.lat, GWACHEON.lng);
          if (p) stops.push({ ...p, id: `stop:${i}`, label: st.label });
          else stops.push({ id: `stop:${i}`, label: st.label, name: '위치를 못 찾음', lat: 0, lng: 0, url: '', missing: true });
        }
      } catch (e: any) {
        error = e?.message ?? String(e);
      }
      if (alive) setStopsResult({ request: stopsRequest, stops, error });
    })();
    return () => {
      alive = false;
    };
  }, [stopsRequest, shuttle, key]);
  const stops = useMemo(
    () =>
      (stopsResult.request === stopsRequest ? stopsResult.stops : []).map((st) => ({
        ...st,
        distance: center?.lat && center.lng && !st.missing ? distanceM(center.lat, center.lng, st.lat, st.lng) : undefined,
      })),
    [stopsResult, stopsRequest, center],
  );
  const colorOf = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color])), []);

  // 지도 다시 그리기
  const lastFit = useRef('');
  useEffect(() => {
    if (!mapReady) return;
    const fitKey = `${selected}|${radius}|${stops.length}`;
    const payload = {
      complexes: located.map((c) => ({ number: c.number, name: c.name, lat: c.lat, lng: c.lng, selected: c.number === selected })),
      center: center ? { lat: center.lat, lng: center.lng } : null,
      radius,
      places: places.map((p) => ({ ...p, color: colorOf[p.categoryId] })),
      stops: stops.filter((st) => !st.missing),
      fit: lastFit.current !== fitKey,
    };
    lastFit.current = fitKey;
    web.current?.injectJavaScript(`window.update(${JSON.stringify(payload)});true;`);
  }, [mapReady, located, selected, center, radius, places, colorOf, stops]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') setReadyKind(mapKind);
      if (msg.type === 'mapError') setMapErrorKey(jsKey);
      if (msg.type === 'complex') setSelected(msg.number);
    } catch {
      // 무시
    }
  };

  const focus = (p: { id: string }) => web.current?.injectJavaScript(`window.focusPlace(${JSON.stringify(p.id)});true;`);

  const saveKey = async () => {
    await saveKakaoKey(keyInput);
    setKey(cleanKakaoKey(keyInput));
    setEditKey(false);
  };

  const saveJsKey = async () => {
    await saveKakaoJsKey(jsInput);
    setJsKey(cleanKakaoKey(jsInput));
    setMapErrorKey(undefined);
    setEditJs(false);
  };

  const jsBox = editJs ? (
    <View style={styles.keyBox}>
      <Text style={styles.keyTitle}>카카오 지도 JavaScript 키</Text>
      <Text style={styles.keyHelp}>
        카카오 개발자 콘솔 → 앱 → 플랫폼 키의 ‘JavaScript 키’를 붙여넣어 주세요. 그 JavaScript 키 설정(또는 플랫폼 → Web의 사이트
        도메인)에 https://localhost 를 등록해야 지도가 떠요. 비워 두고 저장하면 기본 지도(OpenStreetMap)를 써요.
      </Text>
      <TextInput
        style={styles.keyInput}
        value={jsInput}
        onChangeText={setJsInput}
        placeholder="JavaScript 키"
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={styles.keyButton} onPress={saveJsKey}>
        <Text style={styles.keyButtonText}>저장</Text>
      </Pressable>
      <Pressable onPress={() => setEditJs(false)}>
        <Text style={styles.linkSmall}>취소</Text>
      </Pressable>
    </View>
  ) : jsKey && mapErrorKey === jsKey ? (
    <View style={styles.keyBox}>
      <Text style={styles.error}>
        카카오 지도를 불러오지 못해 기본 지도로 보여줘요. JavaScript 키가 맞는지, 그 키의 도메인에 https://localhost 가 등록돼 있는지
        확인해 주세요.
      </Text>
      <Pressable onPress={() => setMapErrorKey(undefined)}>
        <Text style={styles.link}>카카오 지도 다시 시도</Text>
      </Pressable>
      <Pressable onPress={() => { setJsInput(jsKey); setEditJs(true); }}>
        <Text style={styles.link}>JavaScript 키 다시 입력</Text>
      </Pressable>
    </View>
  ) : null;

  const needKey = key !== undefined && (!key || editKey);

  const list = (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {jsBox}
      {needKey ? (
        <View style={styles.keyBox}>
          <Text style={styles.keyTitle}>카카오 REST API 키 입력</Text>
          <Text style={styles.keyHelp}>
            developers.kakao.com → 앱 → 내 앱 → 플랫폼 키의 ‘REST API 키’를 붙여넣어 주세요. 키는 이 폰에만
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
      ) : null}
      {!needKey && shuttle ? (
        <View style={styles.group}>
          <View style={styles.groupHead}>
            <View style={[styles.dot, { backgroundColor: SHUTTLE_COLOR }]} />
            <Text style={styles.groupTitle}>
              회사 {SHUTTLE[shuttle].label}
              {center ? ` · ${center.name}에서` : ''}
            </Text>
          </View>
          {stopsLoading ? (
            <ActivityIndicator color={C.accent} />
          ) : stopsResult.error ? (
            <Text style={styles.error}>{stopsResult.error}</Text>
          ) : (
            stops.map((st, i) => (
              <Pressable
                key={st.id}
                style={styles.place}
                onPress={() => !st.missing && focus(st)}
                onLongPress={() => st.url && Linking.openURL(st.url)}
              >
                <Text style={styles.stopNo}>{i + 1}</Text>
                <View style={styles.flex}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {st.label}
                  </Text>
                  <Text style={styles.placeMeta} numberOfLines={1}>
                    카카오 위치: {st.name}
                  </Text>
                </View>
                {st.distance !== undefined ? (
                  <Text style={styles.placeDist}>
                    {st.distance < 1000 ? `${st.distance}m` : `${(st.distance / 1000).toFixed(1)}km`}
                    {'\n'}도보 약 {walkMinutes(st.distance * 1.3)}분
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
          {!center && !stopsLoading ? <Text style={styles.more}>단지를 고르면 정류장까지 거리가 나와요 (직선 거리 기준 어림)</Text> : null}
        </View>
      ) : null}
      {needKey ? null : !located.length ? (
        <Text style={styles.message}>단지 위치가 아직 없어요. 목록에서 새로고침을 한 번 해 주세요.</Text>
      ) : !center || !cats.length ? (
        !shuttle ? (
          <Text style={styles.message}>위에서 단지와 시설(지하철·학교·병원 등) 또는 셔틀을 골라 주세요.</Text>
        ) : !center && cats.length ? (
          <Text style={styles.message}>단지를 고르면 주변 시설을 보여줘요.</Text>
        ) : null
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
      {!editJs ? (
        <Pressable onPress={() => { setJsInput(jsKey); setEditJs(true); }}>
          <Text style={styles.linkSmall}>{jsKey ? '지도 JavaScript 키 바꾸기' : '카카오 지도로 보기 (JavaScript 키 입력)'}</Text>
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
            onPress={() => c.lat && setSelected(c.number === selected ? undefined : c.number)}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal style={styles.rowWrap} contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
        {(Object.keys(SHUTTLE) as ShuttleDir[]).map((d) => (
          <Chip key={d} label={SHUTTLE[d].label} variant="sort" on={shuttle === d} onPress={() => setShuttle(shuttle === d ? undefined : d)} />
        ))}
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
            key={mapKind}
            ref={web}
            originWhitelist={['*']}
            source={{ html: mapHtml, baseUrl: 'https://localhost' }}
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
  stopNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: SHUTTLE_COLOR,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
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
