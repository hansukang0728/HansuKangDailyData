// 기기 간 공유: Firebase 실시간 데이터베이스(REST)에 메모·문의 기록·즐겨찾기·관심 목록을 올리고 받는다.
// 주소와 가족 코드는 사용자가 앱에 넣고 폰에만 저장한다. 같은 항목을 여러 기기에서 고치면 나중에 저장한 쪽이 남는다.
// 데이터 위치: /families/{가족코드}/{목록id}/{notes|inquiries|favorites}/{집id} = { v, at, articles }
//             /families/{가족코드}/profiles = { v: Profile[], at }
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Profile } from './complexes';
import { Inquiry } from './inquiry';
import { House } from './tracking';

export interface SyncConfig {
  url: string; // https://xxx-default-rtdb.firebaseio.com 또는 ...firebasedatabase.app
  code: string; // 가족 코드 (경로에 들어감. 영문·숫자·-_ 만)
}

// 항목마다 마지막으로 고친 시각 (밀리초). 이걸로 어느 쪽이 최신인지 가린다
export interface SyncMeta {
  notes: Record<string, number>;
  inquiries: Record<string, number>;
  favorites: Record<string, number>;
}

export interface LocalData {
  notes: Record<string, string>;
  inquiries: Record<string, Inquiry>;
  favorites: string[];
  meta: SyncMeta;
}

interface RemoteItem<T> {
  v: T;
  at: number;
  articles?: string[]; // 이 집에 붙었던 매물번호들. 기기마다 집 id가 다를 때 같은 집을 찾는 데 쓴다
}

interface RemoteProfileData {
  notes?: Record<string, RemoteItem<string>>;
  inquiries?: Record<string, RemoteItem<Inquiry>>;
  favorites?: Record<string, RemoteItem<boolean>>;
}

const CONFIG_KEY = 'sync/v1';
const META_KEY = 'syncMeta/v1';
const PROFILES_AT_KEY = 'syncProfilesAt/v1';

export const emptyMeta = (): SyncMeta => ({ notes: {}, inquiries: {}, favorites: {} });

export const cleanCode = (code: string) => code.trim().replace(/[^0-9a-zA-Z_-]/g, '');
export const cleanUrl = (url: string) => url.trim().replace(/\/+$/, '').replace(/\.json$/, '');

export async function loadSyncConfig(): Promise<SyncConfig | undefined> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : undefined;
  } catch {
    return undefined;
  }
}

export async function saveSyncConfig(c: SyncConfig | undefined) {
  try {
    if (c) await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else await AsyncStorage.removeItem(CONFIG_KEY);
  } catch {
    // 무시
  }
}

export async function loadMeta(profileId: string): Promise<SyncMeta> {
  try {
    const raw = await AsyncStorage.getItem(`${META_KEY}:${profileId}`);
    return raw ? { ...emptyMeta(), ...(JSON.parse(raw) as SyncMeta) } : emptyMeta();
  } catch {
    return emptyMeta();
  }
}

export async function saveMeta(profileId: string, m: SyncMeta) {
  try {
    await AsyncStorage.setItem(`${META_KEY}:${profileId}`, JSON.stringify(m));
  } catch {
    // 무시
  }
}

export async function loadProfilesAt(): Promise<number> {
  try {
    return Number(await AsyncStorage.getItem(PROFILES_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

export async function saveProfilesAt(at: number) {
  try {
    await AsyncStorage.setItem(PROFILES_AT_KEY, String(at));
  } catch {
    // 무시
  }
}

// 가족 코드 만들기: 헷갈리는 글자(0/O, 1/l) 뺀 16자
export function makeCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export interface Fetcher {
  (url: string, init?: { method?: string; body?: string }): Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
}

function base(c: SyncConfig, path: string) {
  return `${cleanUrl(c.url)}/families/${cleanCode(c.code)}${path}.json`;
}

async function request(fetcher: Fetcher, url: string, init?: { method?: string; body?: string }) {
  let res;
  try {
    res = await fetcher(url, init);
  } catch (e: any) {
    throw new Error(`Firebase에 연결하지 못했어요 (${e?.message ?? e})`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Firebase가 접근을 거부했어요. 데이터베이스 규칙에서 families 아래 읽기·쓰기를 허용했는지 확인해 주세요');
  }
  if (res.status === 404) throw new Error('데이터베이스 주소가 맞지 않아요 (404)');
  if (!res.ok) throw new Error(`Firebase 오류 ${res.status}`);
  return res.json();
}

// 원격 항목의 집 id를 이 기기의 집 id로 바꾼다 (매물번호가 겹치는 집이 있으면 그 id)
function resolveId(remoteId: string, articles: string[] | undefined, houses: House[]): string {
  if (houses.some((h) => h.id === remoteId)) return remoteId;
  if (articles?.length) {
    const set = new Set(articles);
    const hit = houses.find((h) => h.articleNumbers.some((a) => set.has(a)));
    if (hit) return hit.id;
  }
  return remoteId;
}

const articlesOf = (id: string, houses: House[]) => houses.find((h) => h.id === id)?.articleNumbers;

export interface SyncResult {
  data: LocalData;
  pulled: number; // 다른 기기에서 받아 온 항목 수
  pushed: number; // 이 기기에서 올린 항목 수
}

// 한 목록의 메모·문의 기록·즐겨찾기를 맞춘다. 항목마다 at이 큰 쪽이 이긴다
export async function syncProfile(
  c: SyncConfig,
  profileId: string,
  local: LocalData,
  houses: House[],
  fetcher: Fetcher = fetch as unknown as Fetcher,
): Promise<SyncResult> {
  const remote: RemoteProfileData = (await request(fetcher, base(c, `/${profileId}`))) ?? {};
  const meta: SyncMeta = { notes: { ...local.meta.notes }, inquiries: { ...local.meta.inquiries }, favorites: { ...local.meta.favorites } };
  const notes = { ...local.notes };
  const inquiries = { ...local.inquiries };
  const favSet = new Set(local.favorites);
  let pulled = 0;
  let pushed = 0;
  const patch: Record<string, Record<string, RemoteItem<any>>> = { notes: {}, inquiries: {}, favorites: {} };

  // 1) 원격 → 이 기기
  for (const [rid, item] of Object.entries(remote.notes ?? {})) {
    const id = resolveId(rid, item.articles, houses);
    if ((meta.notes[id] ?? 0) < item.at) {
      if (item.v) notes[id] = item.v;
      else delete notes[id];
      meta.notes[id] = item.at;
      pulled++;
    }
  }
  for (const [rid, item] of Object.entries(remote.inquiries ?? {})) {
    const id = resolveId(rid, item.articles, houses);
    if ((meta.inquiries[id] ?? 0) < item.at) {
      if (item.v && Object.keys(item.v).length) inquiries[id] = item.v;
      else delete inquiries[id];
      meta.inquiries[id] = item.at;
      pulled++;
    }
  }
  for (const [rid, item] of Object.entries(remote.favorites ?? {})) {
    const id = resolveId(rid, item.articles, houses);
    if ((meta.favorites[id] ?? 0) < item.at) {
      if (item.v) favSet.add(id);
      else favSet.delete(id);
      meta.favorites[id] = item.at;
      pulled++;
    }
  }

  // 2) 이 기기 → 원격 (원격에 없거나 이 기기가 더 최신인 것)
  const remoteAt = (kind: keyof RemoteProfileData, id: string) => {
    const items = remote[kind] ?? {};
    let best = items[id]?.at ?? 0;
    const arts = new Set(articlesOf(id, houses) ?? []);
    for (const [rid, item] of Object.entries(items)) {
      if (rid !== id && item.articles?.some((a: string) => arts.has(a))) best = Math.max(best, item.at);
    }
    return best;
  };
  for (const [id, at] of Object.entries(meta.notes)) {
    if (at > remoteAt('notes', id)) {
      patch.notes[id] = { v: notes[id] ?? '', at, articles: articlesOf(id, houses) };
      pushed++;
    }
  }
  for (const [id, at] of Object.entries(meta.inquiries)) {
    if (at > remoteAt('inquiries', id)) {
      patch.inquiries[id] = { v: inquiries[id] ?? {}, at, articles: articlesOf(id, houses) };
      pushed++;
    }
  }
  for (const [id, at] of Object.entries(meta.favorites)) {
    if (at > remoteAt('favorites', id)) {
      patch.favorites[id] = { v: favSet.has(id), at, articles: articlesOf(id, houses) };
      pushed++;
    }
  }
  for (const kind of ['notes', 'inquiries', 'favorites'] as const) {
    if (Object.keys(patch[kind]).length) {
      await request(fetcher, base(c, `/${profileId}/${kind}`), { method: 'PATCH', body: JSON.stringify(patch[kind]) });
    }
  }

  return { data: { notes, inquiries, favorites: [...favSet], meta }, pulled, pushed };
}

// 관심 목록(단지 목록) 전체를 맞춘다. 통째로 비교해서 at이 큰 쪽이 이긴다
export async function syncProfiles(
  c: SyncConfig,
  local: Profile[],
  localAt: number,
  fetcher: Fetcher = fetch as unknown as Fetcher,
): Promise<{ profiles: Profile[]; at: number; changed: boolean }> {
  const remote: RemoteItem<Profile[]> | null = await request(fetcher, base(c, '/profiles'));
  if (remote?.v?.length && remote.at > localAt) return { profiles: remote.v, at: remote.at, changed: true };
  if (localAt > (remote?.at ?? 0)) {
    await request(fetcher, base(c, '/profiles'), { method: 'PUT', body: JSON.stringify({ v: local, at: localAt }) });
  }
  return { profiles: local, at: localAt, changed: false };
}

// 연결 확인: 주소·코드로 읽기가 되는지
export async function testConnection(c: SyncConfig, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<void> {
  if (!/^https:\/\/.+\.(firebaseio\.com|firebasedatabase\.app)$/.test(cleanUrl(c.url))) {
    throw new Error('주소는 https://…firebaseio.com 또는 https://…firebasedatabase.app 형태여야 해요');
  }
  if (cleanCode(c.code).length < 6) throw new Error('가족 코드는 6자 이상이어야 해요');
  await request(fetcher, base(c, '/profiles'));
}
