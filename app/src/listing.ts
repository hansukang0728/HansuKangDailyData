// 네이버 article/list 응답의 항목(item)을 앱에서 쓰는 매물 형태로 바꾼다.
// 전월세 응답의 가격 필드 이름은 아직 실제 응답으로 확인하지 못해서, 후보 이름을
// 차례로 찾아본다. 원본 데이터 화면에서 실제 필드를 확인한 뒤 정리할 것.

export type TradeKind = '전세' | '월세';

// 같은 집을 올린 중개사 한 곳의 매물
export interface BrokerArticle {
  articleNumber: string;
  broker: string;
  feature: string; // 이 중개사가 쓴 한 줄 설명 (목록 응답에 있을 때만)
  confirmDate: string;
  owner: boolean; // 집주인 확인(인증) 매물
  // 이 중개사가 올린 가격 (중개사마다 다를 수 있음). 이전 저장본에는 없을 수 있다
  kind?: TradeKind;
  deposit?: number;
  rent?: number;
}

export interface Listing {
  articleNumber: string;
  complexNumber: string;
  complexName: string;
  dong: string;
  floor: string;
  exclusiveSpace: number;
  supplySpace: number;
  typeName: string;
  direction: string;
  kind: TradeKind;
  deposit: number; // 원
  rent: number; // 원 (전세는 0)
  feature: string;
  brokers: string[];
  brokerArticles: BrokerArticle[];
  confirmDate: string;
  owner: boolean; // 중개사 중 한 곳이라도 집주인 확인 매물이면 true
  // deposit/rent(기준가): 집주인 확인 중개사 가격 중 가장 싼 가격, 없으면 전체 중 가장 싼 가격.
  // 정렬·필터·가격변동 비교는 모두 이 기준가로 한다.
  priceBasis?: 'owner' | 'all';
  // 중개사마다 올린 가격이 다를 때 전체 범위
  priceVaries?: boolean;
  priceMin?: { deposit: number; rent: number };
  priceMax?: { deposit: number; rent: number };
}

export const DIRECTIONS: Record<string, string> = {
  SS: '남향', ES: '남동향', WS: '남서향', EE: '동향', WW: '서향',
  NN: '북향', EN: '북동향', WN: '북서향',
};

function firstNumber(obj: any, keys: string[]): number {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

// 집주인 확인 매물 여부. 네이버가 어떤 필드로 주는지 아직 확인하지 못해서
// owner가 들어간 키가 true이거나, 값에 OWNER / 집주인이 들어 있으면 집주인 매물로 본다.
// 원본 데이터로 실제 필드를 확인하면 그 필드만 보도록 좁힐 것.
export function isOwnerArticle(x: any, depth = 0): boolean {
  if (!x || typeof x !== 'object' || depth > 4) return false;
  for (const [k, v] of Object.entries(x)) {
    if (k === 'duplicatedArticleInfo') continue; // 묶인 다른 중개사 매물은 따로 판단
    // owner가 들어간 키가 참이면 (true, "Y", 1 등 표기가 단지마다 다를 수 있음)
    if (/owner/i.test(k) && (v === true || v === 1 || v === 'Y' || v === 'y' || v === 'true')) return true;
    // 설명 문구("집주인 거주중" 등)에 속지 않도록 설명 필드와 긴 문장은 건너뛴다
    if (typeof v === 'string' && v.length <= 12 && !/desc|feature|comment/i.test(k) && (/^OWNER/i.test(v) || v.includes('집주인'))) return true;
    if (typeof v === 'object' && isOwnerArticle(v, depth + 1)) return true;
  }
  return false;
}

function priceOf(x: any): { deposit: number; rent: number; kind: TradeKind } {
  const price = x?.priceInfo ?? {};
  const rent = firstNumber(price, ['rentPrice', 'monthlyRentPrice', 'monthlyRent']);
  const deposit = firstNumber(price, ['warrantyPrice', 'depositPrice', 'deposit', 'dealPrice']);
  const tradeType = String(x?.tradeType ?? x?.tradeTypeCode ?? '');
  return { deposit, rent, kind: tradeType === 'B2' || rent > 0 ? '월세' : '전세' };
}

// 세입자 입장에서 싼 순서: 월세가 낮을수록, 같으면 보증금이 낮을수록
function cheaper(a: { deposit: number; rent: number }, b: { deposit: number; rent: number }): number {
  return a.rent - b.rent || a.deposit - b.deposit;
}

export function toListing(item: any, complexNumber: string): Listing {
  const a = item.representativeArticleInfo ?? item;
  const detail = a.articleDetail ?? {};
  const floorDetail = detail.floorDetailInfo ?? {};
  const space = a.spaceInfo ?? {};
  const rep = priceOf(a);

  const dup = item.duplicatedArticleInfo;
  const sources: any[] = dup?.articleInfoList?.length ? dup.articleInfoList : [a];
  const brokerArticles: BrokerArticle[] = sources.map((x: any) => {
    // 가격 정보가 없는 항목은 대표 매물 가격으로 본다
    const p = x?.priceInfo ? priceOf(x) : rep;
    return {
      articleNumber: String(x?.articleNumber ?? ''),
      broker: x?.brokerInfo?.brokerageName ?? '',
      feature: x?.articleDetail?.articleFeatureDescription ?? x?.articleFeatureDescription ?? '',
      confirmDate: x?.verificationInfo?.articleConfirmDate ?? '',
      owner: isOwnerArticle(x),
      ...p,
    };
  });
  const brokers = brokerArticles.map((b) => b.broker).filter(Boolean);

  // 대표 매물과 같은 거래유형의 가격들. 네이버가 대표 중개사를 바꿔도 가격변동으로 잘못
  // 잡히지 않도록 기준가는 대표 매물이 아니라 아래 규칙으로 정한다 (사용자 결정):
  // 집주인 확인 중개사 가격 중 가장 싼 가격, 집주인 확인이 없으면 전체 중 가장 싼 가격
  const sameKind = brokerArticles.filter((b) => b.kind === rep.kind && (b.deposit || b.rent));
  const toOffer = (b: BrokerArticle) => ({ deposit: b.deposit ?? 0, rent: b.rent ?? 0 });
  const offers = sameKind.map(toOffer).sort(cheaper);
  const ownerOffers = sameKind.filter((b) => b.owner).map(toOffer).sort(cheaper);
  const low = offers[0] ?? rep;
  const high = offers[offers.length - 1] ?? rep;
  const base = ownerOffers[0] ?? low;
  const priceVaries = offers.some((o) => cheaper(o, low) !== 0);

  const target = floorDetail.targetFloor;
  const total = floorDetail.totalFloor;

  return {
    articleNumber: String(a.articleNumber ?? ''),
    complexNumber,
    complexName: a.complexName ?? '',
    dong: a.dongName ?? '',
    floor: target && total ? `${target}/${total}층` : detail.floorInfo ?? '',
    exclusiveSpace: Number(space.exclusiveSpace ?? 0),
    supplySpace: Number(space.supplySpace ?? 0),
    typeName: space.nameType ?? '',
    direction: DIRECTIONS[detail.direction] ?? detail.direction ?? '',
    kind: rep.kind,
    deposit: base.deposit,
    rent: base.rent,
    feature: detail.articleFeatureDescription ?? '',
    brokers,
    brokerArticles,
    confirmDate: a.verificationInfo?.articleConfirmDate ?? '',
    owner: isOwnerArticle(a) || brokerArticles.some((b) => b.owner),
    priceBasis: ownerOffers.length ? 'owner' : 'all',
    priceVaries,
    priceMin: priceVaries ? { deposit: low.deposit, rent: low.rent } : undefined,
    priceMax: priceVaries ? { deposit: high.deposit, rent: high.rent } : undefined,
  };
}

// 원 단위 금액을 "3억 5,000" / "250" 같은 만원 단위 표기로
export function formatMan(won: number): string {
  const man = Math.round(won / 10000);
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  if (eok === 0) return rest.toLocaleString('ko-KR');
  return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}` : `${eok}억`;
}

export function formatPrice(l: Listing): string {
  return l.kind === '월세' ? `${formatMan(l.deposit)} / ${formatMan(l.rent)}` : formatMan(l.deposit);
}

export type SortKey = 'rentAsc' | 'rentDesc' | 'depositAsc';

export function compareListings(a: Listing, b: Listing, key: SortKey): number {
  if (key === 'rentAsc') return a.rent - b.rent || a.deposit - b.deposit;
  if (key === 'rentDesc') return b.rent - a.rent || a.deposit - b.deposit;
  return a.deposit - b.deposit || a.rent - b.rent;
}

export function sortListings(list: Listing[], key: SortKey): Listing[] {
  return [...list].sort((a, b) => compareListings(a, b, key));
}

// 전용 59~84㎡ 타입: 84.99㎡까지 포함
export function inTargetArea(l: Listing): boolean {
  return l.exclusiveSpace >= 59 && l.exclusiveSpace < 85;
}

// 네이버 부동산 매물 페이지 주소
export function articleUrl(articleNumber: string): string {
  return `https://fin.land.naver.com/articles/${articleNumber}`;
}

// 네이버 부동산 단지 정보 페이지 주소
export function complexUrl(complexNumber: string): string {
  return `https://fin.land.naver.com/complexes/${complexNumber}`;
}

// 전용면적 표시: 84.28 -> "84"
export function areaLabel(l: Listing): string {
  return String(Math.floor(l.exclusiveSpace));
}

// 평형 필터는 대표 평형(전용면적 정수)으로 묶는다: 84A·84B·84T → "84", 표시는 "84㎡"
export function typeKey(l: Listing): string {
  return areaLabel(l);
}

export function typeLabel(l: Listing): string {
  return `${areaLabel(l)}㎡`;
}
