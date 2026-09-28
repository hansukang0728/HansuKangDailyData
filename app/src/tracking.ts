// 매물번호가 아니라 "집" 단위로 매물을 추적한다.
// 중개사가 같은 집을 내렸다 다시 올리면 매물번호가 바뀌기 때문에, 조회할 때마다
// 이전 기록과 아래 순서로 맞춰 본다.
//   1. 매물번호가 하나라도 겹치면 같은 집 (여러 중개사가 올린 번호 전부 비교)
//   2. 단지·동·층·전용면적·타입·방향이 같고 층이 숫자로 정확하면 같은 집
//   3. 층이 저/중/고로만 나오면, 조건이 같은 후보가 딱 하나일 때만 같은 집
// 같은 집이 다시 올라왔는데 가격이 그대로면 아무 표시 없이 넘어가고(사용자 결정),
// 가격이 바뀌었으면 가격변동으로 표시한다.
import { Listing, TradeKind } from './listing';

export type HistoryType = 'first' | 'price' | 'ended' | 'relisted';

export interface HistoryEvent {
  at: string; // ISO
  type: HistoryType;
  deposit: number;
  rent: number;
  kind: TradeKind;
}

export interface House {
  id: string;
  listing: Listing; // 가장 최근에 본 모습
  articleNumbers: string[]; // 지금까지 이 집에 붙었던 매물번호 전부
  firstSeenAt: string;
  initial: boolean; // 단지를 처음 조회할 때 이미 있던 매물 (신규로 표시하지 않음)
  lastSeenAt: string;
  endedAt?: string; // 목록에서 사라진 시각 (다시 올라오면 지움)
  changedAt?: string; // 마지막 가격변동 시각
  prevDeposit?: number;
  prevRent?: number;
  prevKind?: TradeKind;
  hidden?: boolean; // 사용자가 종료 매물을 목록에서 지움 (기록은 매칭용으로 남김)
  history: HistoryEvent[];
}

export type HouseStatus = 'new' | 'changed' | 'ended' | null;

// 신규·가격변동 배지를 보여주는 시간
export const BADGE_HOURS = 24;
const HISTORY_LIMIT = 30;
// 사용자가 지운 종료 매물의 기록을 남겨 두는 기간
const HIDDEN_KEEP_DAYS = 60;

function floorTarget(l: Listing): string {
  return l.floor.split('/')[0] ?? '';
}

function hasExactFloor(l: Listing): boolean {
  return /^\d+$/.test(floorTarget(l));
}

function houseKey(l: Listing): string {
  return [l.complexNumber, l.dong, floorTarget(l), l.exclusiveSpace, l.typeName, l.direction].join('|');
}

function articleNumbersOf(l: Listing): string[] {
  const nums = l.brokerArticles.map((b) => b.articleNumber).filter(Boolean);
  if (l.articleNumber && !nums.includes(l.articleNumber)) nums.push(l.articleNumber);
  return nums;
}

function event(at: string, type: HistoryType, l: Listing): HistoryEvent {
  return { at, type, deposit: l.deposit, rent: l.rent, kind: l.kind };
}

function pushHistory(h: House, e: HistoryEvent): HistoryEvent[] {
  return [...h.history, e].slice(-HISTORY_LIMIT);
}

function samePrice(a: Listing, b: Listing): boolean {
  return a.deposit === b.deposit && a.rent === b.rent && a.kind === b.kind;
}

// 조회에 성공한 단지들의 새 목록(fresh)으로 기록을 갱신한다.
// fresh에 없는 단지(조회 실패)의 기록은 그대로 둔다.
export function reconcile(houses: House[], fresh: Record<string, Listing[]>, now: string): House[] {
  const untouched = houses.filter((h) => !(h.listing.complexNumber in fresh));
  const out: House[] = [...untouched];

  for (const [cn, listings] of Object.entries(fresh)) {
    const prev = houses.filter((h) => h.listing.complexNumber === cn);
    const firstRun = prev.length === 0;
    const used = new Set<string>();
    const matched = new Map<Listing, House>();

    // 1. 매물번호 겹침
    for (const l of listings) {
      const nums = articleNumbersOf(l);
      const h = prev.find((p) => !used.has(p.id) && p.articleNumbers.some((n) => nums.includes(n)));
      if (h) {
        used.add(h.id);
        matched.set(l, h);
      }
    }
    // 2. 층이 정확할 때 조건 일치
    for (const l of listings) {
      if (matched.has(l) || !hasExactFloor(l)) continue;
      const h = prev.find((p) => !used.has(p.id) && houseKey(p.listing) === houseKey(l));
      if (h) {
        used.add(h.id);
        matched.set(l, h);
      }
    }
    // 3. 층이 저/중/고일 때 후보가 하나뿐이면
    for (const l of listings) {
      if (matched.has(l) || hasExactFloor(l)) continue;
      const cands = prev.filter((p) => !used.has(p.id) && houseKey(p.listing) === houseKey(l));
      if (cands.length === 1) {
        used.add(cands[0].id);
        matched.set(l, cands[0]);
      }
    }

    for (const l of listings) {
      const h = matched.get(l);
      const nums = articleNumbersOf(l);
      if (!h) {
        out.push({
          id: `${cn}-${l.articleNumber}`,
          listing: l,
          articleNumbers: nums,
          firstSeenAt: now,
          initial: firstRun,
          lastSeenAt: now,
          history: [event(now, 'first', l)],
        });
        continue;
      }
      const next: House = {
        ...h,
        listing: l,
        articleNumbers: [...new Set([...h.articleNumbers, ...nums])],
        lastSeenAt: now,
        endedAt: undefined,
        hidden: false,
      };
      if (!samePrice(h.listing, l)) {
        next.changedAt = now;
        next.prevDeposit = h.listing.deposit;
        next.prevRent = h.listing.rent;
        next.prevKind = h.listing.kind;
        next.history = pushHistory(h, event(now, 'price', l));
      } else if (h.endedAt) {
        // 같은 가격으로 다시 올라옴: 화면에는 표시하지 않고 기록만 남긴다
        next.history = pushHistory(h, event(now, 'relisted', l));
      }
      out.push(next);
    }

    // 이번 목록에 없는 집은 종료
    for (const h of prev) {
      if (used.has(h.id)) continue;
      if (h.endedAt) {
        out.push(h);
      } else {
        out.push({ ...h, endedAt: now, history: pushHistory(h, event(now, 'ended', h.listing)) });
      }
    }
  }

  const cutoff = Date.parse(now) - HIDDEN_KEEP_DAYS * 86400_000;
  return out.filter((h) => !(h.hidden && h.endedAt && Date.parse(h.endedAt) < cutoff));
}

export function houseStatus(h: House, now: number = Date.now()): HouseStatus {
  if (h.endedAt) return 'ended';
  const recent = (iso?: string) => !!iso && now - Date.parse(iso) < BADGE_HOURS * 3600_000;
  if (!h.initial && recent(h.firstSeenAt) && h.history.length === 1) return 'new';
  if (recent(h.changedAt)) return 'changed';
  return null;
}

// 예전 저장 형식(매물 목록만 저장)에서 옮겨 올 때: 전부 기존 매물로 취급
export function housesFromListings(listings: Listing[], at: string): House[] {
  return listings.map((l) => ({
    id: `${l.complexNumber}-${l.articleNumber}`,
    listing: l,
    articleNumbers: articleNumbersOf(l),
    firstSeenAt: at,
    initial: true,
    lastSeenAt: at,
    history: [event(at, 'first', l)],
  }));
}
