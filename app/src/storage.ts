// 조회 기록(집 단위)과 필터·즐겨찾기를 폰에 저장한다 (앱을 다시 켜도 바로 보이게).
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Filters } from './filters';
import { Listing } from './listing';
import { House, housesFromListings } from './tracking';

const RESULT_KEY = 'result/v2';
const LEGACY_RESULT_KEY = 'result/v1';
const FILTERS_KEY = 'filters/v1';
const FAVORITES_KEY = 'favorites/v1';

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

export async function loadResult(): Promise<SavedResult | undefined> {
  const saved = await load<SavedResult>(RESULT_KEY);
  if (saved) return saved;
  // 빌드 A까지의 형식(매물 목록만 저장)이면 기존 매물로 옮겨 온다
  const legacy = await load<LegacyResult>(LEGACY_RESULT_KEY);
  if (!legacy) return undefined;
  return {
    houses: housesFromListings(legacy.listings, legacy.fetchedAt),
    fetchedAt: legacy.fetchedAt,
    complexNames: legacy.complexNames,
    complexFetchedAt: legacy.complexFetchedAt ?? {},
  };
}

export const saveResult = (r: SavedResult) => save(RESULT_KEY, r);
export const loadFilters = () => load<Filters>(FILTERS_KEY);
export const saveFilters = (f: Filters) => save(FILTERS_KEY, f);
export const loadFavorites = () => load<string[]>(FAVORITES_KEY);
export const saveFavorites = (ids: string[]) => save(FAVORITES_KEY, ids);
