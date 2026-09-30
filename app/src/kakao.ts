// 단지 주변 생활 시설: 카카오 로컬 API (카테고리 검색 / 키워드 검색).
// REST API 키는 코드에 넣지 않고 사용자가 앱에서 입력해 폰에만 저장한다.
// 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Category {
  id: string;
  label: string;
  code?: string; // 카카오 카테고리 그룹 코드
  keyword?: string; // 카테고리 코드가 없는 시설은 키워드로 찾는다
  color: string;
  // 카카오 분류(category_name, 예: "의료,건강 > 병원 > 소아청소년과")로 거르기
  include?: RegExp;
  exclude?: RegExp;
}

export const CATEGORIES: Category[] = [
  { id: 'subway', label: '지하철', code: 'SW8', color: '#1D4E89' },
  { id: 'school', label: '학교', code: 'SC4', color: '#0E6560' },
  { id: 'academy', label: '학원', code: 'AC5', color: '#4B2D86' },
  { id: 'kinder', label: '어린이집·유치원', code: 'PS3', color: '#B7791F' },
  { id: 'mart', label: '마트', code: 'MT1', color: '#A1321F' },
  { id: 'convenience', label: '편의점', code: 'CS2', color: '#8A3E05' },
  { id: 'hospital', label: '병원', code: 'HP8', exclude: /소아/, color: '#C2185B' },
  { id: 'pediatric', label: '소아과', keyword: '소아청소년과', include: /소아/, color: '#E65100' },
  { id: 'pharmacy', label: '약국', code: 'PM9', color: '#6A1B9A' },
  // 키워드 검색은 이름에만 "공원"이 들어간 가게도 섞이므로, 분류에 공원이 있는 것만
  { id: 'park', label: '공원', keyword: '공원', include: /공원/, color: '#2E7D32' },
  { id: 'food', label: '음식점', code: 'FD6', color: '#AD1457' },
  { id: 'sashimi', label: '횟집', keyword: '횟집', include: /(^|>)\s*회\s*($|>)|해물,생선/, color: '#0277BD' },
  { id: 'meat', label: '고깃집', keyword: '고깃집', include: /육류|고기/, color: '#6D4C41' },
  { id: 'cafe', label: '카페', code: 'CE7', color: '#5D4037' },
  { id: 'bank', label: '은행', code: 'BK9', color: '#455A64' },
];

export interface Place {
  id: string;
  name: string;
  categoryId: string;
  detail: string; // 카카오 category_name의 마지막 부분 (예: 초등학교)
  address: string;
  distance: number; // m
  lat: number;
  lng: number;
  url: string; // 카카오맵 장소 페이지
}

const KEY_STORAGE = 'kakaoRestKey/v1';
const CACHE_STORAGE = 'kakaoPlaces/v2'; // v2: 병원/소아과 분리
const CACHE_TTL_MS = 7 * 86400_000;

export const loadKakaoKey = async () => {
  try {
    return (await AsyncStorage.getItem(KEY_STORAGE)) ?? '';
  } catch {
    return '';
  }
};

// 복사할 때 따라 들어온 공백·줄바꿈·"KakaoAK " 머리말 등을 떼어낸다 (REST API 키는 영문·숫자뿐)
export const cleanKakaoKey = (key: string) => key.replace(/^\s*KakaoAK\s*/i, '').replace(/[^0-9a-zA-Z]/g, '');

export const saveKakaoKey = async (key: string) => {
  try {
    await AsyncStorage.setItem(KEY_STORAGE, cleanKakaoKey(key));
  } catch {
    // 무시
  }
};

// 지도용 JavaScript 키 (선택). 있으면 카카오 지도를 쓰고, 없으면 OpenStreetMap 지도를 쓴다
const JS_KEY_STORAGE = 'kakaoJsKey/v1';

export const loadKakaoJsKey = async () => {
  try {
    return (await AsyncStorage.getItem(JS_KEY_STORAGE)) ?? '';
  } catch {
    return '';
  }
};

export const saveKakaoJsKey = async (key: string) => {
  try {
    await AsyncStorage.setItem(JS_KEY_STORAGE, cleanKakaoKey(key));
  } catch {
    // 무시
  }
};

type Cache = Record<string, { at: number; places: Place[] }>;
let memory: Cache | undefined;

async function readCache(): Promise<Cache> {
  if (memory) return memory;
  try {
    memory = JSON.parse((await AsyncStorage.getItem(CACHE_STORAGE)) ?? '{}') as Cache;
  } catch {
    memory = {};
  }
  return memory;
}

async function writeCache(c: Cache) {
  memory = c;
  try {
    await AsyncStorage.setItem(CACHE_STORAGE, JSON.stringify(c));
  } catch {
    // 무시
  }
}

// 걸어서 몇 분: 분당 약 67m
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 67));

function toPlace(d: any, categoryId: string): Place {
  const parts = String(d.category_name ?? '').split('>').map((x) => x.trim());
  return {
    id: String(d.id),
    name: String(d.place_name ?? ''),
    categoryId,
    detail: parts[parts.length - 1] ?? '',
    address: String(d.road_address_name || d.address_name || ''),
    distance: Number(d.distance ?? 0),
    lat: Number(d.y),
    lng: Number(d.x),
    url: String(d.place_url ?? ''),
  };
}

// 한 카테고리의 반경 내 시설 (가까운 순, 최대 45곳). 7일 동안 폰에 저장해 두고 쓴다
export async function searchPlaces(
  key: string,
  cat: Category,
  lat: number,
  lng: number,
  radius: number,
): Promise<Place[]> {
  const cacheKey = `${cat.id}|${lat.toFixed(5)}|${lng.toFixed(5)}|${radius}`;
  const cache = await readCache();
  const hit = cache[cacheKey];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places;

  const base = cat.code
    ? `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${cat.code}`
    : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(cat.keyword ?? '')}`;
  const places: Place[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${base}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15&page=${page}`, {
      headers: { Authorization: `KakaoAK ${cleanKakaoKey(key)}` },
    });
    if (res.status === 401 || res.status === 403) {
      // 카카오가 보내준 원인(errorType / message)을 같이 보여줘야 키 문제인지 설정 문제인지 알 수 있다
      let reason = '';
      try {
        const err = await res.json();
        reason = [err?.errorType, err?.message ?? err?.msg].filter(Boolean).join(': ');
      } catch {
        // 무시
      }
      throw new Error(
        `카카오 API 키가 맞지 않거나 카카오맵 사용 설정이 꺼져 있어요 (${res.status}${reason ? ` ${reason}` : ''})`,
      );
    }
    if (!res.ok) throw new Error(`카카오 API 오류 ${res.status}`);
    const body = await res.json();
    for (const d of body.documents ?? []) {
      const catName = String(d.category_name ?? '');
      if (cat.include && !cat.include.test(catName)) continue;
      if (cat.exclude && cat.exclude.test(catName)) continue;
      places.push(toPlace(d, cat.id));
    }
    if (body.meta?.is_end !== false) break;
  }
  await writeCache({ ...(await readCache()), [cacheKey]: { at: Date.now(), places } });
  return places;
}

// 이름으로 장소 한 곳 찾기 (셔틀 정류장 등). 기준점에서 가까운 첫 결과, 30일 저장
export async function findPlace(key: string, query: string, lat: number, lng: number): Promise<Place | null> {
  const cacheKey = `find|${query}`;
  const cache = await readCache();
  const hit = cache[cacheKey];
  if (hit && Date.now() - hit.at < 30 * 86400_000) return hit.places[0] ?? null;
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=20000&sort=accuracy&size=5`,
    { headers: { Authorization: `KakaoAK ${cleanKakaoKey(key)}` } },
  );
  if (!res.ok) throw new Error(`카카오 API 오류 ${res.status}`);
  const body = await res.json();
  const d = body.documents?.[0];
  const place = d ? toPlace(d, 'shuttle') : null;
  await writeCache({ ...(await readCache()), [cacheKey]: { at: Date.now(), places: place ? [place] : [] } });
  return place;
}

// 두 좌표 사이 거리 (m, 직선)
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}
