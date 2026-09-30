// 회사 셔틀 정류장 (사용자가 알려준 순서). 좌표는 카카오 장소 검색으로 찾는다 (query).
export interface ShuttleStop {
  label: string; // 화면에 보일 이름
  query: string; // 카카오 장소 검색어
}

export type ShuttleDir = 'in' | 'out';

export const SHUTTLE: Record<ShuttleDir, { label: string; stops: ShuttleStop[] }> = {
  in: {
    label: '셔틀 출근',
    stops: [
      { label: '과천역 6번 출구', query: '과천역 6번출구' },
      { label: '과천청사역 7번 출구', query: '정부과천청사역 7번출구' },
      { label: '과천주공 9단지 904동', query: '과천주공9단지 904동' },
    ],
  },
  out: {
    label: '셔틀 퇴근',
    stops: [
      { label: '과천 우체국', query: '과천우체국' },
      { label: '과천청사역 2번 출구', query: '정부과천청사역 2번출구' },
      { label: '과천역 6번 출구', query: '과천역 6번출구' },
      { label: '과천주공 9단지', query: '과천주공9단지' },
    ],
  },
};

// 과천 중심 (장소 검색 기준점)
export const GWACHEON = { lat: 37.4292, lng: 126.9876 };
