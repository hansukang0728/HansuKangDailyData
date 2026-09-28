import { inTargetArea, Listing, typeKey } from './listing';

export interface Filters {
  complexes: string[]; // 비어 있으면 전체
  targetArea: boolean; // 전용 59–84㎡만
  types: string[]; // typeKey 목록, 비어 있으면 전체
  depositMax: number | null; // 원
  rentMax: number | null; // 원 (월세에만 적용)
  ownerOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  complexes: [],
  targetArea: true,
  types: [],
  depositMax: null,
  rentMax: null,
  ownerOnly: false,
};

const EOK = 100_000_000;
const MAN = 10_000;

export const DEPOSIT_OPTIONS: [number | null, string][] = [
  [null, '전체'],
  [3 * EOK, '3억 이하'],
  [5 * EOK, '5억 이하'],
  [7 * EOK, '7억 이하'],
  [10 * EOK, '10억 이하'],
];

export const RENT_OPTIONS: [number | null, string][] = [
  [null, '전체'],
  [100 * MAN, '100 이하'],
  [150 * MAN, '150 이하'],
  [200 * MAN, '200 이하'],
  [250 * MAN, '250 이하'],
  [300 * MAN, '300 이하'],
];

export function matches(l: Listing, f: Filters): boolean {
  if (f.complexes.length && !f.complexes.includes(l.complexNumber)) return false;
  if (f.targetArea && !inTargetArea(l)) return false;
  if (f.types.length && !f.types.includes(typeKey(l))) return false;
  if (f.depositMax !== null && l.deposit > f.depositMax) return false;
  if (f.rentMax !== null && l.kind === '월세' && l.rent > f.rentMax) return false;
  if (f.ownerOnly && !l.owner) return false;
  return true;
}

// 필터 버튼에 보여줄 켜진 조건 수 (기본값인 59–84㎡는 세지 않음)
export function activeCount(f: Filters): number {
  return (
    (f.complexes.length ? 1 : 0) +
    (f.targetArea ? 0 : 1) +
    (f.types.length ? 1 : 0) +
    (f.depositMax !== null ? 1 : 0) +
    (f.rentMax !== null ? 1 : 0) +
    (f.ownerOnly ? 1 : 0)
  );
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
