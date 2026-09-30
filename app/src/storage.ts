// 관심 목록별 조회 기록(집 단위)·필터·즐겨찾기·메모와 목록 설정을 폰에 저장한다.
// 목록이 생기기 전(빌드 #12까지)에 저장한 데이터는 과천 목록 것으로 옮겨 온다.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_PROFILES, GWACHEON_PROFILE_ID, Profile } from './complexes';
import { Filters } from './filters';
import { Inquiry } from './inquiry';
import { Listing } from './listing';
import { House, housesFromListings } from './tracking';

const RESULT_KEY = 'result/v2';
const LEGACY_RESULT_KEY = 'result/v1';
const FILTERS_KEY = 'filters/v1';
const FAVORITES_KEY = 'favorites/v1';
const NOTES_KEY = 'notes/v1'; // 매물별 메모 (집 id → 글)
const INQUIRIES_KEY = 'inquiries/v1'; // 매물별 문의 기록 (집 id → 양식 값)
const PROFILES_KEY = 'profiles/v1';
const ACTIVE_PROFILE_KEY = 'activeProfile/v1';

export interface SavedResult {
  houses: House[];
  fetchedAt: string; // ISO
  complexNames: Record<string, string>;
  complexFetchedAt: Record<string, string>; // 단지별 마지막 성공 시각
}

interface LegacyResult {
  listings: Listing[];
  fetchedAt: string;
  complexNames: Record<string, string>;
  complexFetchedAt?: Record<string, string>;
}

async function load<T>(key: string): Promise<T | undefined> {
  try {
    const text = await AsyncStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 화면 동작에 영향 없음
  }
}

const keyOf = (base: string, profileId: string) => `${base}:${profileId}`;

// 목록별 값. 과천 목록은 목록 기능 이전 키도 찾아본다
async function loadFor<T>(base: string, profileId: string): Promise<T | undefined> {
  const v = await load<T>(keyOf(base, profileId));
  if (v !== undefined || profileId !== GWACHEON_PROFILE_ID) return v;
  return load<T>(base);
}

export async function loadResult(profileId: string): Promise<SavedResult | undefined> {
  const saved = await loadFor<SavedResult>(RESULT_KEY, profileId);
  if (saved || profileId !== GWACHEON_PROFILE_ID) return saved;
  // 빌드 A 형식(매물 목록만 저장)이면 기존 매물로 옮겨 온다
  const legacy = await load<LegacyResult>(LEGACY_RESULT_KEY);
  if (!legacy) return undefined;
  return {
    houses: housesFromListings(legacy.listings, legacy.fetchedAt),
    fetchedAt: legacy.fetchedAt,
    complexNames: legacy.complexNames,
    complexFetchedAt: legacy.complexFetchedAt ?? {},
  };
}

export const saveResult = (profileId: string, r: SavedResult) => save(keyOf(RESULT_KEY, profileId), r);
export const loadFilters = (profileId: string) => loadFor<Filters>(FILTERS_KEY, profileId);
export const saveFilters = (profileId: string, f: Filters) => save(keyOf(FILTERS_KEY, profileId), f);
export const loadFavorites = (profileId: string) => loadFor<string[]>(FAVORITES_KEY, profileId);
export const saveFavorites = (profileId: string, ids: string[]) => save(keyOf(FAVORITES_KEY, profileId), ids);
export const loadNotes = (profileId: string) => loadFor<Record<string, string>>(NOTES_KEY, profileId);
export const saveNotes = (profileId: string, notes: Record<string, string>) => save(keyOf(NOTES_KEY, profileId), notes);
export const loadInquiries = (profileId: string) => loadFor<Record<string, Inquiry>>(INQUIRIES_KEY, profileId);
export const saveInquiries = (profileId: string, x: Record<string, Inquiry>) => save(keyOf(INQUIRIES_KEY, profileId), x);

export async function loadProfiles(): Promise<Profile[]> {
  const saved = await load<Profile[]>(PROFILES_KEY);
  return saved?.length ? saved : DEFAULT_PROFILES;
}
export const saveProfiles = (ps: Profile[]) => save(PROFILES_KEY, ps);
export const loadActiveProfile = () => load<string>(ACTIVE_PROFILE_KEY);
export const saveActiveProfile = (id: string) => save(ACTIVE_PROFILE_KEY, id);

// 목록을 지울 때 그 목록의 저장 데이터도 지운다
export async function removeProfileData(profileId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([RESULT_KEY, FILTERS_KEY, FAVORITES_KEY, NOTES_KEY, INQUIRIES_KEY].map((b) => keyOf(b, profileId)));
  } catch {
    // 무시
  }
}
