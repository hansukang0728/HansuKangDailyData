---
name: molit-apt-trade
description: 국토교통부 공공데이터포털의 아파트 매매 실거래가 API(RTMSDataSvcAptTradeDev)로 특정 지역·관심단지의 실제 매매 거래 내역(거래금액, 층, 전용면적, 거래일 등)을 조회해 엑셀로 취합한다. crawl-naver-land 스킬이 수집하는 네이버 호가 매물과 짝을 이루는 실거래 데이터 소스. "국토부 실거래가", "실거래가 조회", "매매 실거래", "아파트 실거래가 API", "호가랑 실거래가 비교" 같은 요청에 사용.
---

# 국토교통부 아파트 매매 실거래가 조회

`molit_trade.py`를 실행해 공공데이터포털 API로 아파트 매매 실거래를 가져온다.
**매매만** 다룬다 (전월세는 범위 밖).

## crawl-naver-land 스킬과의 차이 — 왜 이게 클라우드에서 더 잘 되는가

`crawl-naver-land`는 Playwright로 실제 브라우저를 띄워 네이버 페이지를 흉내내는
방식이라, 클라우드 환경(데이터센터 IP)에서 네이버가 `ERR_CONNECTION_RESET`으로
연결 자체를 끊어버린다(봇 IP 차단, 정책을 열어도 해결 안 됨 — 자세한 경위는 그
스킬 문서 참고). 반면 이 스킬은 **공식 REST API**를 `urllib`으로 직접 호출한다.
브라우저도, 스텔스 설정도, IP 기반 차단도 없다 — API 키만 있으면 로컬이든
클라우드든 동일하게 동작한다. 즉 **데일리 자동화(Claude Routine)는 네이버 매물이
아니라 이 실거래가 쪽이 훨씬 안정적**이다.

## 사전 준비 (최초 1회)

### 1. API 키 발급
1. [data.go.kr](https://www.data.go.kr) 회원가입
2. "[국토교통부_아파트 매매 실거래가 상세 자료](https://www.data.go.kr/data/15126468/openapi.do)" 검색 → 활용신청
3. 승인 즉시(보통 자동승인) 마이페이지에서 **서비스키(일반 인증키, Decoding)** 확인
4. 이 값을 환경변수 **`MOLIT_API_KEY`**로 저장. 로컬은 `.env`나 셸 프로필에,
   클라우드는 Claude Code 환경 설정의 **Environment variables**에 등록
   (GH_PAT를 등록했던 것과 같은 자리). **커밋하지 말 것.**

### 2. 클라우드 네트워크 정책에 도메인 추가
환경의 Network access가 Trusted/Custom이면 `apis.data.go.kr`가 기본 허용목록에
없어 403으로 막힌다. **Custom** 정책의 Allowed domains에 추가:
```
apis.data.go.kr
```
(`crawl-naver-land`에서 네이버 도메인을 추가하던 것과 같은 절차. "기본 목록도
포함" 체크는 그대로 켜둘 것 — pip/git 등 기존 자동화가 계속 필요하다.)

확인 명령: `curl -sS -o /dev/null -w '%{http_code}\n' https://apis.data.go.kr`
(200/404면 도달 가능 — 이 API는 파라미터 없이 루트를 치면 404가 정상이라
403/000과만 구분하면 된다. 403/000이면 정책이 아직 안 열린 것.)

## 실행

```bash
# 관심단지(watchlist.json) 전체, 이번 달 매매 실거래
python3 molit_trade.py

# 관심단지 전체, 최근 3개월
python3 molit_trade.py --months 3

# 관심단지 중 이름으로 하나만
python3 molit_trade.py --name 자연앤힐스테이트 --months 6

# 관심단지 무관, 법정동코드로 그 지역 아파트 전체 매매 조회 (특정 월)
python3 molit_trade.py --lawd-cd 41117 --year-month 202506
```

- 서비스키는 `MOLIT_API_KEY` 환경변수 자동 사용, 필요시 `--service-key`로 직접 지정.
- 결과: `output/실거래가_전체_{시각}.xlsx` (관심단지 모드) 또는
  `output/실거래가_{지역코드}_{시각}.xlsx` (`--lawd-cd` 모드), 단지별 시트.
  원본 API 응답은 `data/molit/{법정동코드}/{YYYYMM}.json`에 누적 저장(재요청 없이
  나중에 재가공 가능하도록).

## 지역 매핑 (REGION_LAWD_CD)

`watchlist.json`의 `region` 값을 법정동코드(시군구 5자리)로 바꿔야 API를 호출할 수
있다. `molit_trade.py` 상단의 `REGION_LAWD_CD` 딕셔너리가 그 매핑이다:

| region | 법정동코드 | 위치 |
|---|---|---|
| 수원광교 | 41117 | 경기도 수원시 영통구 |

새 지역이 관심단지에 추가되면 이 딕셔너리에도 추가해야 한다. 코드 찾는 법:
[code.go.kr](https://www.code.go.kr) 행정표준코드관리시스템 → "법정동코드 전체자료"
다운로드 → 해당 시군구의 앞 5자리(예: "수원시 영통구 41117000000" → `41117`).
스크립트는 매핑에 없는 지역이 있으면 조용히 넘어가지 않고 어떤 지역이 빠졌는지
출력하고 중단한다.

## 단지명 매칭 관련 주의

국토부 API의 단지명(`aptNm`)은 네이버 관심단지명과 완전히 동일하지 않을 수 있다
(괄호 병기, 차수 표기 차이 등). `match_complex()`가 느슨한 포함 관계로 매칭하므로
가끔 과다/과소 매칭이 날 수 있다 — 특정 단지 결과가 이상하면 `--lawd-cd`로 그
지역 전체를 뽑아 실제 `aptNm` 표기를 눈으로 확인하고 필요시 매칭 로직을 조정한다.

## 데이터 필드 참고 (RTMSDataSvcAptTradeDev 응답)

- `aptNm`(단지명), `umdNm`(법정동), `jibun`(지번), `aptDong`(동, 없을 수 있음)
- `excluUseAr`(전용면적 ㎡), `floor`(층), `buildYear`(건축년도)
- `dealYear`/`dealMonth`/`dealDay`(계약일), `dealAmount`(거래금액, 만원 단위 문자열 —
  콤마 포함이라 파싱 시 제거 필요, `simplify()`가 원 단위로 환산해둠)
- `dealingGbn`(거래유형: 직거래/중개거래, 빈 값도 있음)
- `cdealType`(해제여부: `"O"`면 계약 해제된 거래 — **실거래가로 취급하면 안 되는
  건이니 반드시 구분 표시**. `simplify()`가 `cancelled` bool로 변환, 엑셀에서
  빨간 글씨 + "해제" 표시), `cdealDay`(해제사유발생일)
- `estateAgentSggNm`(중개사 소재 시군구 — 매물을 낸 중개사 위치, 전화번호는 없음)

## 엑셀 리포트 구조

단지(또는 지역 전체 모드에선 아파트)별로 시트를 나누고, 각 시트는 계약일 내림차순
(최신 거래가 위) 플랫 테이블이다 — `crawl-naver-land`의 3줄-1블록 인쇄 레이아웃과
달리 여기는 매물 상태 추적이 필요 없는 단순 거래 이력이라 일반 표가 자연스럽다.
거래금액 셀은 파란 굵게, 해제된 거래는 행 전체 빨간 글씨.

## 데일리 자동화 (클라우드 / Claude Routine)

네트워크 정책·API 키만 준비되면 `crawl-naver-land`보다 훨씬 간단하다 — 브라우저도
xvfb도 필요 없다:

```bash
python3 molit_trade.py --months 1
git config user.email noreply@anthropic.com && git config user.name Claude
git add data/molit output
git commit -m "국토부 실거래가 갱신 $(date +%Y-%m-%d)" || echo "변동 없음"
git push origin main
```

당월 데이터는 국토부가 매일 갱신하므로(신고 지연 반영), 매일 재수집하면 지난 며칠치
거래가 새로 잡히거나 해제 표시가 붙는 게 정상이다 — `--months 1`이면 매번 이번 달
전체를 다시 받아 덮어쓰므로 자연히 최신화된다.

## 미해결

- 국토부 API의 일일 호출 한도(활용신청 시 기본 트래픽, 보통 1일 1000회 내외)를
  아직 실측 못 함 — 사용량이 늘면 신청 화면에서 트래픽 증량 신청 필요할 수 있음.
- `aptNm` 표기 차이로 인한 매칭 오탐/누락 사례를 실제 데이터로 아직 검증 못 함
  (API 키 발급 전이라). 최초 실행 시 단지별 매칭 건수를 사람이 한 번 훑어보고
  이상하면 위 "단지명 매칭 관련 주의" 절차로 조정할 것.
