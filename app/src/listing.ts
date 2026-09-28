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
}

export interface Listing {
  articleNumber: string;
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
}

const DIRECTIONS: Record<string, string> = {
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

export function toListing(item: any): Listing {
  const a = item.representativeArticleInfo ?? item;
  const detail = a.articleDetail ?? {};
  const floorDetail = detail.floorDetailInfo ?? {};
  const space = a.spaceInfo ?? {};
  const price = a.priceInfo ?? {};

  const rent = firstNumber(price, ['rentPrice', 'monthlyRentPrice', 'monthlyRent']);
  const deposit = firstNumber(price, ['warrantyPrice', 'depositPrice', 'deposit', 'dealPrice']);
  const tradeType = String(a.tradeType ?? a.tradeTypeCode ?? '');
  const kind: TradeKind = tradeType === 'B2' || rent > 0 ? '월세' : '전세';

  const dup = item.duplicatedArticleInfo;
  const sources: any[] = dup?.articleInfoList?.length ? dup.articleInfoList : [a];
  const brokerArticles: BrokerArticle[] = sources.map((x: any) => ({
    articleNumber: String(x?.articleNumber ?? ''),
    broker: x?.brokerInfo?.brokerageName ?? '',
    feature: x?.articleDetail?.articleFeatureDescription ?? x?.articleFeatureDescription ?? '',
    confirmDate: x?.verificationInfo?.articleConfirmDate ?? '',
  }));
  const brokers = brokerArticles.map((b) => b.broker).filter(Boolean);

  const target = floorDetail.targetFloor;
  const total = floorDetail.totalFloor;

  return {
    articleNumber: String(a.articleNumber ?? ''),
    complexName: a.complexName ?? '',
    dong: a.dongName ?? '',
    floor: target && total ? `${target}/${total}층` : detail.floorInfo ?? '',
    exclusiveSpace: Number(space.exclusiveSpace ?? 0),
    supplySpace: Number(space.supplySpace ?? 0),
    typeName: space.nameType ?? '',
    direction: DIRECTIONS[detail.direction] ?? detail.direction ?? '',
    kind,
    deposit,
    rent,
    feature: detail.articleFeatureDescription ?? '',
    brokers,
    brokerArticles,
    confirmDate: a.verificationInfo?.articleConfirmDate ?? '',
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

export function sortListings(list: Listing[], key: SortKey): Listing[] {
  const out = [...list];
  out.sort((a, b) => {
    if (key === 'rentAsc') return a.rent - b.rent || a.deposit - b.deposit;
    if (key === 'rentDesc') return b.rent - a.rent || a.deposit - b.deposit;
    return a.deposit - b.deposit || a.rent - b.rent;
  });
  return out;
}

// 전용 59~84㎡ 타입: 84.99㎡까지 포함
export function inTargetArea(l: Listing): boolean {
  return l.exclusiveSpace >= 59 && l.exclusiveSpace < 85;
}

// 네이버 부동산 매물 페이지 주소
export function articleUrl(articleNumber: string): string {
  return `https://fin.land.naver.com/articles/${articleNumber}`;
}

// 전용면적 표시: 84.28 -> "84"
export function areaLabel(l: Listing): string {
  return String(Math.floor(l.exclusiveSpace));
}
