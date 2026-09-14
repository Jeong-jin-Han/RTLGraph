# 설계 결정 — M0

M0 를 만들며 초안(`tmp/draft/03-EXTENSION-PLAN.md` §4, §13)의 미해결 사항 중
IR 에 필요한 것을 확정했다. 근거가 NodeGraph 교훈이면 그렇게 적었다.
나머지 질문(시스템 뷰, 재추출 트리거, bridge 기본값 등)은 해당 마일스톤에서 정한다.

## IR (`packages/rtl-ir`)

| # | 결정 | 이유 |
|---|---|---|
| D1 | **노드 ID = 컴포넌트 TOP 기준 인스턴스 경로** — `CNT_FF`, `data_path.u_inc`, `data_path.u_ch0.u_add` | 줄번호·순번 ID 는 재추출마다 바뀌어 `layout` 병합이 불가능하다. NodeGraph 는 순번 ID 를 끝내 못 고쳤다. 경로라서 같은 모듈을 여러 번 써도 유일하다 |
| D2 | **포트 노드 ID = `@NAME`**, 엔드포인트도 포트명 없이 `@NAME` | `@` 는 Verilog 식별자에 못 오므로 인스턴스와 충돌하지 않는다 |
| D3 | 포트 노드는 `time` 이 없고 필터 대상이 아니다 | 초안 예시의 `time: "port"` 가 `{comb, seq}` 규칙과 모순이었다 |
| D4 | 엔드포인트 = `<노드ID>:<포트>` | 마지막 `:` 로 자르므로 ID 의 `.` 과 충돌 없음 |
| D5 | **층 모듈 평탄화** — `comb/data_path` 모듈은 인스턴스로 펼치고(래퍼는 노드 아님), `comb/control_path` 모듈은 `control` 노드 하나(진리표) | 슬라이드 p.31 그림이 dp 내부 상자를 그리고 cp 는 표로 뺀다 |
| D6 | 서브모듈 내부 전용 신호는 경로 접두 — `data_path.ADD_OUT` | 채널을 복제하면 이름이 겹친다 |
| D7 | TOP 의 단순 배선 `assign` 은 신호를 새로 만들지 않고 `aliases` | `assign OUT_D = ACC_D` 는 같은 넷. 넷마다 드라이버가 정확히 하나라는 C6 이 유지된다 |
| D8 | 상수 연결은 `consts` — `EN: "1'b1"` | 신호가 아니지만 입력이 연결됐다는 사실은 남아야 한다 |
| D9 | **파생 가능한 값은 IR 에 넣지 않는다** — 노드 폭(`params` + registry), MUX 입력 순서(registry). 초안의 `sel`/`inputs`/`width`/`rst`/`en` 필드 제거 | 같은 사실이 두 곳에 있으면 어긋난다. NodeGraph 의 `nodeNaturalY` 누적 오차 교훈 |
| D10 | `component` 는 선택 필드. 없으면 파일 자신의 컴포넌트 | 단일 컴포넌트 예시에 `"host"` 가 들어가 있던 문제 |
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
| R2 | **포트 방향(side)을 심볼에 고정** — 데이터 입력 left, 출력 right, 제어(`sel`/`EN`/`RST`) top, `CLK` bottom | NodeGraph 는 가까운 포트를 거리로 골라 선이 뒤집혔다 |
| R3 | 레지스트리에 없는 모듈은 에러가 아니다(`kind: "module"` 일반 상자) | `base/` 를 점진적으로 늘린다 |
| R4 | `base/*.v` 와 레지스트리의 모듈·포트·폭·파라미터 일치를 테스트로 강제 | 승격 시 동기화 누락 방지 |

## 개발 환경

- Node 22 의 타입 스트리핑 + `node:test`. 의존성은 `typescript`, `@types/node` 뿐.
- `erasableSyntaxOnly` 로 enum/namespace 같은 런타임 TS 문법을 막는다.
- NodeGraph 교훈에 따라 `node_modules/`, `dist/`, `*.vsix` 는 처음부터 ignore.
