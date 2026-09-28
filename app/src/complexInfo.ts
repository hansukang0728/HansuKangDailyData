// 단지의 타입(평형)·평면도·관리비 정보. 네이버 단지 페이지가 부르는 front-api를 그대로 쓴다.
//   /complex/pyeongGroups?complexNumber=     타입 목록 (이름 114A, 전용면적, 세대수)
//   /complex/pyeong?complexNumber=&pyeongTypeNumber=   평면도 이미지, 방·욕실 수, 방향
//   /complex/maintenanceFee?complexNumber=&pyeongTypeNumber=   월평균 관리비
// 자주 바뀌지 않는 정보라 폰에 저장해 두고 30일마다 새로 받는다.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Listing } from './listing';

export interface PyeongType {
  number: number;
  name: string; // 네이버 표기 (공급면적 기준, 예: 114A)
  nameType: string; // 평면 구분 (A, B, T …)
  exclusiveArea: number;
  supplyArea: number;
  householdCount: number;
}

export interface PyeongDetail {
  roomCount?: number;
  bathRoomCount?: number;
  householdCount?: number;
  direction?: string;
  floorPlanUrls: Record<string, Record<string, string[]>>; // BASE(기본형)/EXPN(확장형) → 옵션 → 이미지들
}

export interface MaintenanceFee {
  yearMonth?: string;
  monthAverageFee?: number;
  summerAverageFee?: number;
  winterAverageFee?: number;
}

interface CachedDetail {
  pyeong: PyeongDetail;
  fee?: MaintenanceFee;
  fetchedAt: string;
}

interface CachedComplex {
  types: PyeongType[];
  fetchedAt: string;
  details: Record<string, CachedDetail>;
}

type Cache = Record<string, CachedComplex>;
type GetJson = <T = any>(path: string) => Promise<T>;

const KEY = 'complexInfo/v1';
const TTL_MS = 30 * 86400_000;

let memory: Cache | undefined;

async function readCache(): Promise<Cache> {
  if (memory) return memory;
  try {
    const text = await AsyncStorage.getItem(KEY);
    memory = text ? (JSON.parse(text) as Cache) : {};
  } catch {
    memory = {};
  }
  return memory;
}

async function writeCache(c: Cache): Promise<void> {
  memory = c;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // 저장 실패는 다음에 다시 받으면 됨
  }
}

const fresh = (iso?: string) => !!iso && Date.now() - Date.parse(iso) < TTL_MS;

function parseGroups(result: any): PyeongType[] {
  const out: PyeongType[] = [];
  for (const g of Array.isArray(result) ? result : []) {
    for (const t of g?.pyeongTypes ?? []) {
      out.push({
        number: Number(t.number),
        name: String(t.name ?? ''),
        nameType: String(t.nameType ?? ''),
        exclusiveArea: Number(t.exclusiveArea ?? 0),
        supplyArea: Number(t.supplyArea ?? 0),
        householdCount: Number(t.householdCount ?? 0),
      });
    }
  }
  return out.sort((a, b) => a.exclusiveArea - b.exclusiveArea || a.nameType.localeCompare(b.nameType));
}

export async function cachedTypes(complexNumber: string): Promise<PyeongType[] | undefined> {
  return (await readCache())[complexNumber]?.types;
}

// 단지 타입 목록. 저장본이 30일 안이면 그대로 쓴다
export async function loadTypes(getJson: GetJson, complexNumber: string, force = false): Promise<PyeongType[]> {
  const cache = await readCache();
  const hit = cache[complexNumber];
  if (hit && fresh(hit.fetchedAt) && !force) return hit.types;
  const types = parseGroups(await getJson(`/complex/pyeongGroups?complexNumber=${complexNumber}`));
  await writeCache({ ...cache, [complexNumber]: { types, fetchedAt: new Date().toISOString(), details: hit?.details ?? {} } });
  return types;
}

// 타입 하나의 평면도·관리비
export async function loadDetail(getJson: GetJson, complexNumber: string, typeNumber: number): Promise<CachedDetail> {
  const cache = await readCache();
  const entry = cache[complexNumber];
  const hit = entry?.details?.[typeNumber];
  if (hit && fresh(hit.fetchedAt)) return hit;
  const q = `complexNumber=${complexNumber}&pyeongTypeNumber=${typeNumber}`;
  const pyeong = (await getJson<any>(`/complex/pyeong?${q}`)) ?? {};
  let fee: MaintenanceFee | undefined;
  try {
    fee = (await getJson<MaintenanceFee>(`/complex/maintenanceFee?${q}`)) ?? undefined;
  } catch {
    // 관리비 정보가 없는 단지도 있음
  }
  const detail: CachedDetail = {
    pyeong: {
      roomCount: pyeong.roomCount,
      bathRoomCount: pyeong.bathRoomCount,
      householdCount: pyeong.householdCount,
      direction: pyeong.direction,
      floorPlanUrls: pyeong.floorPlanUrls ?? {},
    },
    fee,
    fetchedAt: new Date().toISOString(),
  };
  const latest = await readCache();
  const cur = latest[complexNumber] ?? { types: [], fetchedAt: '', details: {} };
  await writeCache({ ...latest, [complexNumber]: { ...cur, details: { ...cur.details, [typeNumber]: detail } } });
  return detail;
}

// 매물에 맞는 타입: 평면 구분(A/B…)이 같고 전용면적이 가장 가까운 것
export function matchType(types: PyeongType[], l: Pick<Listing, 'typeName' | 'exclusiveSpace'>): PyeongType | undefined {
  const byDiff = (a: PyeongType, b: PyeongType) =>
    Math.abs(a.exclusiveArea - l.exclusiveSpace) - Math.abs(b.exclusiveArea - l.exclusiveSpace);
  const same = types.filter((t) => t.nameType === l.typeName && Math.abs(t.exclusiveArea - l.exclusiveSpace) < 1);
  if (same.length) return [...same].sort(byDiff)[0];
  const near = types.filter((t) => Math.abs(t.exclusiveArea - l.exclusiveSpace) < 1);
  return [...near].sort(byDiff)[0];
}

// 전용면적 기준 타입 이름: 84A
export function shortName(t: PyeongType): string {
  return `${Math.floor(t.exclusiveArea)}${t.nameType}`;
}

// 평면도 묶음: BASE → 기본형, EXPN → 확장형 (옵션이 여러 개면 확장형 1, 2 …)
export function planSections(d: PyeongDetail): { label: string; urls: string[] }[] {
  const out: { label: string; urls: string[] }[] = [];
  for (const [kind, options] of Object.entries(d.floorPlanUrls ?? {})) {
    const base = kind === 'BASE' ? '기본형' : kind === 'EXPN' ? '확장형' : kind;
    const entries = Object.entries(options ?? {}).filter(([, urls]) => urls?.length);
    entries.forEach(([, urls], i) => out.push({ label: entries.length > 1 ? `${base} ${i + 1}` : base, urls }));
  }
  return out;
}
