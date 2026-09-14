# 설계 결정

마일스톤을 만들며 초안(`tmp/draft/03-EXTENSION-PLAN.md` §4, §7, §13)의 미해결 사항 중
필요한 것을 확정했다. 근거가 NodeGraph 교훈이면 그렇게 적었다.
나머지 질문(시스템 뷰, 재추출 트리거, bridge 기본값 등)은 해당 마일스톤에서 정한다.

## 프로젝트 구조 — 컴포넌트는 폴더로 늘어난다

설계는 main component 하나를 먼저 잡고 그 안에 `comb/data_path`, `comb/control_path`,
`seq`, `tb` 층 폴더를 미리 만든 뒤 채운다(`02` §2). 고정된 이름은 **층 폴더와 `base/` 뿐**이다.
컴포넌트의 이름·개수·중첩은 설계마다 다르다 — 초안의 host/device 는 예시일 뿐이다.
"자기 `seq/` 를 가진 디렉토리 = 컴포넌트" 라는 규칙만 있고, 필요해질 때 main 안에
하위 폴더로 생긴다. 단일 컴포넌트면 층 폴더가 루트에 오고 컴포넌트 폴더는 없다(D01-2).
코드와 IR 어디에도 특정 컴포넌트 이름은 없다.

## IR (`packages/rtl-ir`) — M0

| # | 결정 | 이유 |
|---|---|---|
| D1 | **노드 ID = 컴포넌트 TOP 기준 인스턴스 경로** — `CNT_FF`, `data_path.u_inc`, `data_path.u_ch0.u_add` | 줄번호·순번 ID 는 재추출마다 바뀌어 `layout` 병합이 불가능하다. NodeGraph 는 순번 ID 를 끝내 못 고쳤다. 경로라서 같은 모듈을 여러 번 써도 유일하다 |
| D2 | **포트 노드 ID = `@NAME`**, 엔드포인트도 포트명 없이 `@NAME` | `@` 는 Verilog 식별자에 못 오므로 인스턴스와 충돌하지 않는다 |
| D3 | 포트 노드는 `time` 이 없다 | 초안 예시의 `time: "port"` 가 `{comb, seq}` 규칙과 모순이었다 |
| D4 | 엔드포인트 = `<노드ID>:<포트>` | 마지막 `:` 로 자르므로 ID 의 `.` 과 충돌 없음 |
| D5 | **층 모듈 평탄화** — `comb/data_path` 모듈은 인스턴스로 펼치고(래퍼는 노드 아님), `comb/control_path` 모듈은 `control` 노드 하나(진리표) | 슬라이드 p.31 그림이 dp 내부 상자를 그리고 cp 는 표로 뺀다 |
| D6 | 서브모듈 내부 전용 신호는 경로 접두 — `data_path.ADD_OUT` | 채널을 복제하면 이름이 겹친다 |
| D7 | TOP 의 단순 배선 `assign` 은 신호를 새로 만들지 않고 `aliases` | `assign OUT_D = ACC_D` 는 같은 넷. 넷마다 드라이버가 정확히 하나라는 C6 이 유지된다 |
| D8 | 상수 연결은 `consts` — `EN: "1'b1"` | 신호가 아니지만 입력이 연결됐다는 사실은 남아야 한다 |
| D9 | **파생 가능한 값은 IR 에 넣지 않는다** — 노드 폭(`params` + registry), MUX 입력 순서(registry). 초안의 `sel`/`inputs`/`width`/`rst`/`en` 필드 제거 | 같은 사실이 두 곳에 있으면 어긋난다. NodeGraph 의 `nodeNaturalY` 누적 오차 교훈 |
| D10 | `component` 는 선택 필드. 없으면 파일 자신의 컴포넌트 | 위 "프로젝트 구조" 참고 |
| D11 | 파일에 `kind: "component"` 명시 | 시스템 파일(`kind: "system"`, M6.5)과 구분 |
| D12 | `origin` = 인스턴스 문장 줄. 진리표는 `truthTable.origin` = `casex` 줄 | 골든 테스트가 실제 소스 줄과 대조한다 |
| D13 | 신호 `flow` — 클럭 입력 넷 `clock`, 1차 리셋 입력 넷 `reset`, 제어 경로 출력(리셋 제어 포함) `control`, 나머지 `data` | `CNT_RST` 같은 리셋 제어는 진리표 출력이므로 제어선으로 보인다 |
| D14 | `layout = { grid?, nodes: {id: {x,y}}, collapsed?: [groupId] }` | 초안의 `_meta` 처럼 예약 키를 노드 맵에 섞지 않는다. 그룹 정의(`groups`)는 재추출 대상, 접힘 상태는 사용자 것 |
| D15 | `view` 는 선택. 병합 시 이전 값 유지 | 보기만 해도 파일이 dirty 가 되던 NodeGraph 문제를 M2 에서 피한다 |
| D16 | 검증은 예외 대신 진단 목록 반환 | 부분 추출 + 진단 표시(`02` §11 Q5) |

## Registry (`packages/rtl-registry`)

| # | 결정 | 이유 |
|---|---|---|
| R1 | `BW` = 최상위 비트 인덱스, 폭 = `BW+1` | `base/DFF.v` 주석. 등가성 시뮬레이션으로도 확인 |
| R2 | **핀 방향(side)을 심볼에 고정, 슬라이드 p.31 관례** — 연산·MUX 는 데이터 입력 bottom / 출력 top, 레지스터는 D top / Q bottom, 제어(`sel`/`EN`/`RST`) left, `CLK` right | 레지스터가 맨 아래 줄에 있고 조합 논리가 위로 쌓이는 그림(M1 에서 M0 의 left/right 배치를 교체). NodeGraph 는 가까운 포트를 거리로 골라 선이 뒤집혔다 |
| R3 | 레지스트리에 없는 모듈은 에러가 아니다(`kind: "module"` 일반 상자) | `base/` 를 점진적으로 늘린다 |
| R4 | `base/*.v` 와 레지스트리의 모듈·포트·폭·파라미터 일치를 테스트로 강제 | 승격 시 동기화 누락 방지 |

## 뷰 필터 (`packages/rtl-ir/src/view.ts`) — M1

| # | 결정 | 이유 |
|---|---|---|
| V1 | 프리셋 5개(`all` `datapath` `controlpath` `comb` `seq`)를 `rtl-ir` 에 둔다 | 에디터와 HTML export 가 같은 규칙으로 숨긴다 |
| V2 | clock·reset 넷은 control 축 | 2×2 격자에 세 번째 축을 만들지 않는다 |
| V3 | 숨김 정책 `hide` — 드라이버와 싱크 하나 이상이 보여야 넷을 그린다. 포트 노드는 연결된 넷이 보일 때만 | `datapath` 프리셋 결과가 슬라이드 p.31 요소와 정확히 같다(테스트). `bridge` 는 M2 |

## 레이아웃 (`packages/rtl-layout`) — M1

| # | 결정 | 이유 |
|---|---|---|
| L1 | **행 = 조합 깊이** — 레지스터 맨 아래, 조합 논리는 입력 쪽 깊이만큼 위로, 제어 블록은 맨 위 행 왼쪽, 출력 포트는 레지스터 아래 | 슬라이드 p.31 |
| L2 | 열 순서는 데이터 넷으로 연결된 이웃의 barycenter 로 8회 교대 정렬, 겹치지 않게 당겨 배치 | 결정적이고 작은 설계에 충분. NodeGraph 의 greedy 재배치가 흔들렸던 교훈으로 매 실행 같은 결과를 테스트 |
| L3 | **배선은 직교 채널 라우팅** — 핀은 옆 채널의 트랙으로 나가고, 여러 채널에 걸친 넷은 상자·스텁·다른 라이저가 없는 x 의 수직 라이저로 잇는다 | 회로도 관례. NodeGraph 의 격자 A* 는 결국 대부분 지워졌다 |
| L4 | 채널 안 트랙은 구간 색칠 후, 위에서 내려오는 스텁이 아래에서 올라오는 스텁과 같은 x 에서 겹치지 않도록 위상 정렬 | 테스트가 실제로 잡은 겹침 버그의 수정 |
| L5 | 좌우 핀은 박스 옆 드롭으로 빠지고, 한 변의 드롭은 연결 대상이 대부분 아래면 아래 채널로 | 제어선이 위로 올라갔다 곧바로 내려오는 지그재그 제거 |
| L6 | 핀 하나에만 연결된 포트는 채널을 쓰지 않고 그 핀 옆에 붙인다 | `RST/SHOW/MODE → acc_cp`, `OUT_FF → ACC` 가 직선 |
| L7 | 숨김(`hidden`) 넷은 라우팅하지 않고, 그 넷뿐인 포트는 상자도 없다 | `CLK` |
| L8 | **필터와 무관하게 전체를 배치**한다. 렌더러가 기본으로 보이는 부분에 맞춰 잘라내고, 에디터는 `crop: false` | 필터를 바꿔도 상자가 움직이지 않는다 |
| L9 | 사용자 `layout` 좌표는 아직 반영하지 않는다 | 수동 배치와 재라우팅은 M3 |

테스트가 보장하는 성질: 결정성, 상자 겹침 없음, 모든 선분 수평·수직, 선이 상자를 관통하지 않음,
서로 다른 넷의 선분이 겹치지 않음, 각 넷이 드라이버와 모든 싱크를 실제로 연결, 팬아웃에 접점.

## 에디터 (`packages/vscode-ext`) — M2

| # | 결정 | 이유 |
|---|---|---|
| E1 | 웹뷰는 React 없이 vanilla TS. `rtl-render` 의 SVG 를 넣고 팬·줌·툴바만 다룬다 | 그림은 이미 순수 함수가 만든다. 의존성 최소화. 드래그 편집(M3)에서 필요해지면 다시 판단 |
| E2 | **읽기 전용 에디터** — 호스트는 문서 텍스트만 전달하고, 파싱·검증·배치·렌더는 웹뷰에서 | 렌더 경로가 하나. 호스트는 얇게 |
| E3 | **필터 상태는 JSON 이 아니라** 웹뷰 state + 파일별 `workspaceState` 에 저장. 파일의 `view.filter` 는 첫 기본값으로만 읽는다 | 보기만 해도 파일이 수정되던 NodeGraph 문제. e2e 가 문서가 dirty 가 되지 않음을 확인한다 |
| E4 | 배치는 문서 버전마다 한 번, 필터 변경은 `crop: false` 로 다시 그리기만 | 필터를 바꿔도 상자가 제자리 |
| E5 | 외부 수정(에이전트가 JSON 을 다시 씀)은 `onDidChangeTextDocument` 로 즉시 반영 | NodeGraph 의 Reload 버튼 단계를 없앤다 |
| E6 | CSP `default-src 'none'`, 스크립트·스타일 모두 nonce | |
| E7 | 툴바 문구는 영어 | 마켓플레이스 배포, NodeGraph 와 일관 |
| E8 | 명령 `RTLGraph: Fit View`, `RTLGraph: Set View Preset`. 내부 명령 `rtlgraph._renderState` 는 팔레트에 올리지 않는다 | 선언과 등록이 같은 집합인지 테스트한다(NodeGraph 의 "command not found") |
| E9 | **실제 VS Code 로 e2e** — 설치된 VS Code 를 격리 프로필(`.vscode-test/`)·`xvfb-run` 으로 띄워, 기본 에디터로 열림 · 웹뷰가 그린 노드·넷 수 · 프리셋 · 재오픈 후 필터 유지 · 문서 비수정을 확인 | NodeGraph 는 테스트가 없었다. 웹뷰 안은 호스트에서 못 보므로 웹뷰가 그린 결과를 `rendered` 메시지로 보고한다 |

## 개발 환경

- Node 22 의 타입 스트리핑 + `node:test`. 의존성은 `typescript`, `@types/node` 뿐.
- `erasableSyntaxOnly` 로 enum/namespace 같은 런타임 TS 문법을 막는다.
- NodeGraph 교훈에 따라 `node_modules/`, `dist/`, `*.vsix` 는 처음부터 ignore.
- 골든 SVG(`demo/acc/*.svg`)는 의도한 시각 변경 후 `npm run golden` 으로 갱신한다.
