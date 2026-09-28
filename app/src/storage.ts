// 마지막 조회 결과와 필터 설정을 폰에 저장한다 (앱을 다시 켜도 바로 보이게).
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Filters } from './filters';
import { Listing } from './listing';

const RESULT_KEY = 'result/v1';
const FILTERS_KEY = 'filters/v1';

export interface SavedResult {
  listings: Listing[];
  fetchedAt: string; // ISO
  complexNames: Record<string, string>;
  complexFetchedAt: Record<string, string>; // 단지별 마지막 성공 시각
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

export const loadResult = () => load<SavedResult>(RESULT_KEY);
export const saveResult = (r: SavedResult) => save(RESULT_KEY, r);
export const loadFilters = () => load<Filters>(FILTERS_KEY);
export const saveFilters = (f: Filters) => save(FILTERS_KEY, f);
