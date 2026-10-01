// 부동산 문의 기록 양식: 매물마다 전화로 물어본 내용을 칩(라디오)으로 골라 채운다.
// 값은 전부 문자열(여러 개 선택은 문자열 배열)로 두고, 필드 키로 저장한다.
import { formatPrice, Listing, TradeKind } from './listing';

export type Inquiry = Record<string, string | string[] | undefined>;

export type FieldType =
  | 'radio' // 하나 고르기
  | 'multi' // 여러 개 고르기
  | 'number' // 숫자 입력 (단위 표시)
  | 'text' // 글쓰기
  | 'monthPeriod' // 월 + 초/중/하순  (키 + 'Month', 키 + 'Period'에 저장)
  | 'dateTime'; // 날짜 + 시간 글쓰기 (키 + 'Date', 키 + 'Time')

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  // 다른 답에 따라 보이는 항목 (예: "가능"을 골랐을 때만 얼마까지)
  showIf?: (v: Inquiry, kind: TradeKind) => boolean;
  // 요약 한 줄에 쓸 짧은 표기. 없으면 값 그대로
  short?: (value: string, v: Inquiry) => string;
}

export interface Section {
  id: string;
  title: string;
  fields: Field[];
  showIf?: (kind: TradeKind) => boolean;
}

export const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
export const PERIODS = ['초순', '중순', '하순'];

const is = (key: string, value: string) => (v: Inquiry) => v[key] === value;

export const SECTIONS: Section[] = [
  {
    id: 'check',
    title: '매물 확인',
    fields: [
      { key: 'exists', label: '매물 상태', type: 'radio', options: ['있음', '계약 진행 중', '나감'] },
      { key: 'sameAsAd', label: '광고와 조건', type: 'radio', options: ['같음', '다름'], short: (x) => (x === '같음' ? '' : '광고와 다름') },
      { key: 'sameAsAdNote', label: '어떻게 다른지', type: 'text', showIf: is('sameAsAd', '다름'), placeholder: '예: 실제 보증금 3.5억' },
    ],
  },
  {
    id: 'price',
    title: '가격 조건',
    fields: [
      { key: 'depositAdj', label: '보증금 조정', type: 'radio', options: ['불가', '가능'], short: (x) => `보증금 조정 ${x}` },
      { key: 'depositMin', label: '얼마까지', type: 'number', unit: '만원', showIf: is('depositAdj', '가능'), short: (x) => `보증금 ${manLabel(x)}까지` },
      { key: 'rentAdj', label: '월세 조정', type: 'radio', options: ['불가', '가능'], showIf: (_v, kind) => kind === '월세', short: (x) => `월세 조정 ${x}` },
      { key: 'rentMin', label: '얼마까지', type: 'number', unit: '만원', showIf: (v, kind) => kind === '월세' && v.rentAdj === '가능', short: (x) => `월세 ${manLabel(x)}까지` },
      { key: 'convert', label: '월세↔보증금 전환', type: 'radio', options: ['불가', '가능'], short: (x) => `전환 ${x}` },
      { key: 'convertNote', label: '전환 조건', type: 'text', showIf: is('convert', '가능'), placeholder: '예: 1억당 40' },
      { key: 'mgmtFee', label: '관리비', type: 'number', unit: '만원', short: (x) => `관리비 ${x}만` },
      { key: 'mgmtIncl', label: '관리비 포함', type: 'multi', options: ['난방', '수도', '인터넷', '주차'], short: (x) => `포함: ${x}` },
    ],
  },
  {
    id: 'house',
    title: '집 상태',
    fields: [
      { key: 'floor', label: '정확한 층', type: 'number', unit: '층', short: (x) => `${x}층` },
      { key: 'occupancy', label: '거주 상태', type: 'radio', options: ['공실', '세입자 거주', '집주인 거주'] },
      { key: 'acCount', label: '에어컨 (대)', type: 'radio', options: ['0', '1', '2', '3', '4'], short: (x) => `에어컨 ${x}대` },
      { key: 'acType', label: '에어컨 종류', type: 'multi', options: ['시스템', '벽걸이/스탠드'], showIf: (v) => !!v.acCount && v.acCount !== '0' },
      { key: 'options', label: '기본 옵션', type: 'multi', options: ['냉장고', '세탁기', '건조기', '붙박이장', '인덕션', '식기세척기(빌트인)'] },
      { key: 'expanded', label: '확장', type: 'radio', options: ['확장', '비확장'] },
      { key: 'repair', label: '수리 상태', type: 'radio', options: ['올수리', '부분수리', '수리 필요'] },
      { key: 'repairNote', label: '수리 내용', type: 'text', placeholder: '예: 도배 2024, 장판 2022' },
      { key: 'damage', label: '누수·곰팡이·결로', type: 'radio', options: ['없음', '있었음'], short: (x) => (x === '없음' ? '누수 없음' : '누수·곰팡이 있었음') },
      { key: 'damageNote', label: '내용', type: 'text', showIf: is('damage', '있었음') },
      { key: 'houseNote', label: '추가 옵션·특이사항', type: 'text' },
    ],
  },
  {
    id: 'movein',
    title: '입주 시기',
    fields: [
      { key: 'movein', label: '입주', type: 'radio', options: ['즉시 입주', '날짜 협의 가능', '날짜 정해짐'] },
      { key: 'moveinWhen', label: '언제쯤', type: 'monthPeriod', showIf: (v) => !!v.movein && v.movein !== '즉시 입주' },
    ],
  },
  {
    id: 'visit',
    title: '집 보기',
    fields: [
      { key: 'visit', label: '집 보기', type: 'radio', options: ['가능', '세입자 협의 필요', '불가'], short: (x) => `집보기 ${x}` },
      { key: 'visitWhen', label: '날짜·시간', type: 'dateTime', showIf: (v) => v.visit === '가능' },
    ],
  },
  {
    id: 'dishwasher',
    title: '식기세척기 (타공)',
    fields: [
      { key: 'drill', label: '타공', type: 'radio', options: ['허용', '불허', '원복 조건으로 허용'], short: (x) => `타공 ${x}` },
      { key: 'counter', label: '상판 재질', type: 'radio', options: ['인조대리석', '스테인리스', '엔지니어드스톤', '모름'], short: (x) => (x === '모름' ? '' : `상판 ${x}`) },
      { key: 'hole', label: '기존 구멍 (정수기 자리 등)', type: 'radio', options: ['있음', '없음'], short: (x) => `기존 구멍 ${x}` },
    ],
  },
  {
    id: 'safety',
    title: '안전·계약',
    fields: [
      { key: 'mortgage', label: '근저당', type: 'radio', options: ['없음', '있음'], short: (x) => `근저당 ${x}` },
      { key: 'mortgageAmt', label: '금액', type: 'number', unit: '만원', showIf: is('mortgage', '있음'), short: (x) => `근저당 ${manLabel(x)}` },
      { key: 'ownerType', label: '소유자', type: 'radio', options: ['개인', '공동명의', '법인'] },
      { key: 'insurance', label: '전세보증보험', type: 'radio', options: ['가능', '불가', '확인 필요'], short: (x) => `보증보험 ${x}` },
      { key: 'loan', label: '전세대출 협조', type: 'radio', options: ['가능', '불가'], short: (x) => `대출 협조 ${x}` },
      { key: 'ownerMoveIn', label: '집주인 실거주 계획', type: 'radio', options: ['없음', '있음', '모름'], short: (x) => (x === '모름' ? '' : `실거주 계획 ${x}`) },
      { key: 'renewal', label: '계약갱신청구권', type: 'radio', options: ['사용 가능', '이미 사용됨', '모름'], short: (x) => (x === '모름' ? '' : `갱신권 ${x}`) },
    ],
  },
  {
    id: 'etc',
    title: '주차·기타',
    fields: [
      { key: 'parking', label: '세대당 주차', type: 'radio', options: ['1대', '1.5대', '2대'], short: (x) => `주차 ${x}` },
      { key: 'parkingNote', label: '추가 차량 비용', type: 'text' },
      { key: 'pet', label: '반려동물', type: 'radio', options: ['가능', '불가', '협의'], short: (x) => `반려동물 ${x}` },
      { key: 'fee', label: '중개보수', type: 'radio', options: ['법정 요율', '금액 확인'], short: (x) => (x === '법정 요율' ? '중개보수 법정' : '') },
      { key: 'feeAmt', label: '중개보수 금액', type: 'number', unit: '만원', showIf: is('fee', '금액 확인'), short: (x) => `중개보수 ${x}만` },
    ],
  },
];

// 월세 매물에서는 전세 쪽 항목(보증보험 등)을 뒤로 보낸다
export function sectionsFor(kind: TradeKind): Section[] {
  if (kind === '전세') return SECTIONS;
  const safety = SECTIONS.find((s) => s.id === 'safety')!;
  return [...SECTIONS.filter((s) => s.id !== 'safety'), safety];
}

// "35000" → "3억 5,000"
export function manLabel(x: string): string {
  const n = Number(x);
  if (!x || isNaN(n)) return x;
  const eok = Math.floor(n / 10000);
  const rest = n % 10000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만`;
  return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}` : `${eok}억`;
}

const asText = (x: string | string[] | undefined) => (Array.isArray(x) ? x.join('·') : (x ?? ''));

function fieldValueText(f: Field, v: Inquiry): string {
  if (f.type === 'monthPeriod') {
    const m = v[`${f.key}Month`];
    const p = v[`${f.key}Period`];
    return [m ? `${m}월` : '', p].filter(Boolean).join(' ');
  }
  if (f.type === 'dateTime') return [v[`${f.key}Date`], v[`${f.key}Time`]].map(asText).filter(Boolean).join(' ');
  return asText(v[f.key]);
}

// 채운 항목 수 (문의 완료 표시와 탭 개수에 씀)
export function filledCount(v: Inquiry | undefined): number {
  if (!v) return 0;
  return Object.entries(v).filter(([k, x]) => k !== 'done' && k !== 'doneAt' && (Array.isArray(x) ? x.length : !!x)).length;
}

export const isInquired = (v: Inquiry | undefined) => !!v && (v.done === 'Y' || filledCount(v) > 0);

// 접힌 카드용 한 줄 요약 (채운 것만, 양식 순서대로)
export function summarize(v: Inquiry | undefined, kind: TradeKind): string {
  if (!v) return '';
  const parts: string[] = [];
  for (const s of sectionsFor(kind)) {
    for (const f of s.fields) {
      if (f.showIf && !f.showIf(v, kind)) continue;
      const text = fieldValueText(f, v);
      if (!text) continue;
      if (f.type === 'text') continue; // 긴 글은 요약에서 뺀다
      const short = f.short ? f.short(text, v) : text;
      if (short) parts.push(short);
    }
  }
  return parts.join(' · ');
}

// 카톡 등에 붙일 전체 텍스트
export function exportText(l: Listing, v: Inquiry | undefined, kind: TradeKind): string {
  const head = `${[l.complexName, l.dong && `${l.dong}동`, l.floor].filter(Boolean).join(' ')} · 전용 ${Math.floor(l.exclusiveSpace)}㎡ ${l.typeName ? `${l.typeName}타입` : ''}`.trim();
  // 제목 아래 금액: 전세 "전세 3억 5,000", 월세 "월세 1억 / 120". 중개사마다 다르면 범위도
  let price = `${kind} ${formatPrice(l)}`;
  if (l.priceVaries && l.priceMin && l.priceMax) {
    price += ` (중개사별 ${formatPrice({ ...l, ...l.priceMin })} ~ ${formatPrice({ ...l, ...l.priceMax })})`;
  }
  const lines = [head, price];
  if (!v) return lines.join('\n');
  for (const s of sectionsFor(kind)) {
    const rows: string[] = [];
    for (const f of s.fields) {
      if (f.showIf && !f.showIf(v, kind)) continue;
      const text = fieldValueText(f, v);
      if (!text) continue;
      const shown = f.type === 'number' && f.unit === '만원' ? manLabel(text) : `${text}${f.type === 'number' && f.unit ? f.unit : ''}`;
      rows.push(`- ${f.label}: ${shown}`);
    }
    if (rows.length) lines.push('', `[${s.title}]`, ...rows);
  }
  if (v.doneAt) lines.push('', `문의 완료: ${String(v.doneAt).slice(0, 10)}`);
  return lines.join('\n');
}
