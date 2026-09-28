// 관심 목록(프로필). 목록마다 단지·거래유형·조회 기록·필터·즐겨찾기를 따로 가진다.
// 단지는 앱의 "목록·단지 관리"에서 네이버 부동산을 검색해 추가할 수 있다.

export interface Profile {
  id: string;
  name: string;
  complexes: string[]; // 네이버 단지번호
  names: Record<string, string>; // 단지번호 → 이름 (조회 전에 보여줄 임시 이름)
  tradeTypes: string[]; // B1 전세, B2 월세 (매매 A1은 아직 화면이 전월세 기준이라 쓰지 않음)
}

export const RENT_TRADE_TYPES = ['B1', 'B2'];

// 처음 설치했을 때 목록. 과천 목록의 id는 예전 저장 데이터를 옮겨 오는 데 쓰므로 바꾸지 말 것
export const GWACHEON_PROFILE_ID = 'gwacheon-rent';
export const DEFAULT_PROFILES: Profile[] = [
  {
    id: GWACHEON_PROFILE_ID,
    name: '과천 전월세',
    complexes: ['127071', '125930', '121427', '120960'],
    names: {},
    tradeTypes: RENT_TRADE_TYPES,
  },
  {
    id: 'gaepo-rent',
    name: '개포 전월세',
    complexes: [],
    names: {},
    tradeTypes: RENT_TRADE_TYPES,
  },
];

// 단지 사이에 쉬는 시간 (연속 요청으로 차단되지 않게)
export const DELAY_BETWEEN_COMPLEXES_MS = 2500;

// 네이버 부동산 주소에서 단지번호 찾기
//   fin.land.naver.com/complexes/121427, new.land.naver.com/complexes/121427,
//   m.land.naver.com/complex/info/121427
const COMPLEX_URL_RE = /complex(?:es)?\/(?:info\/)?(\d{3,})/;

export function complexNumberFromUrl(text: string): string | undefined {
  return COMPLEX_URL_RE.exec(text)?.[1];
}

// 사용자가 넣은 값(단지번호, 네이버 링크, 네이버 앱 "링크 복사" 문구)에서 단지번호를 찾는다.
// naver.me 같은 짧은 링크는 따라가서 원래 주소를 본다.
export async function resolveComplexInput(input: string): Promise<string | undefined> {
  const text = input.trim();
  if (/^\d{3,}$/.test(text)) return text;
  const direct = complexNumberFromUrl(text);
  if (direct) return direct;
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  if (!link) return undefined;
  try {
    const res = await fetch(link, { method: 'GET' });
    const fromUrl = complexNumberFromUrl(res.url);
    if (fromUrl) return fromUrl;
    // 리다이렉트가 페이지 안에서 일어나는 경우: 본문에 들어 있는 주소에서 찾는다
    return complexNumberFromUrl(await res.text());
  } catch {
    return undefined;
  }
}
