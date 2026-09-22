PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOC = <사양 문서 경로. 없으면 비우고 REQUEST 에 요구사항을 직접 적어줘>
MAIN_COMPONENT = <main component 이름. 정해두지 않았으면 비워둬>
REQUEST = <SPEC_DOC 가 없을 때만: 무엇을 만들지>

PROJECT_FOLDER/.agent/rtlgraph/SPEC.md 와 PROJECT_FOLDER/.agent/rtlgraph/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow B — Spec →
RTL" 을 따라서 **새 프로젝트의 RTL 을 처음부터** 만들어줘. (이미 있는 코드를 고치는
경우라면 이 프롬프트가 아니라 .prompt/rtlgraph/refactor/korean.md 를 써야 해.)

SPEC_DOC 이 있으면 그 문서를 먼저 끝까지 읽고, 그 문서가 정한 포트·컴포넌트·제어 신호
표를 그대로 따라줘. 문서와 다르게 만들어야 할 이유가 생기면 그 이유를 보고에 적어줘.

컴포넌트가 하나뿐이어도 main component 폴더를 먼저 만들고 그 안에 comb/data_path,
comb/control_path, seq, tb 를 둔 뒤, 데이터패스 상자와 제어 신호 표를 정하고 코드를
채워줘. MAIN_COMPONENT 가 적혀 있으면 그 이름을 그대로 쓰고, 비어 있으면 네가 정하고
왜 그렇게 정했는지 알려줘.

**벤치는 나중에 세 가지로 다시 읽힌다: 이 체크가 무엇을 위한 것인지(목적), 어떻게
구동했는지(방식), 무엇이 일어났는지(결과).** `run-tb.sh --wave` 와 파형 뷰가 첫째는
네가 찍은 줄에서, 둘째는 그 줄 직전에 실행한 문장들에서, 셋째는 덤프에서 가져간다.
셋 다 살아남도록 써줘:

- **무엇을 증명하는지를 찍어라.** `ok: held while data_out_ready is low` 는 읽는
  사람이 확인할 수 있는 주장이고, `ok: case 3` 은 아니다.
- **이름 있는 태스크로 구동해라** — `frame(8'hA5)`, `put(1'b0, 2)`, `take` — 그래야
  방식이 `@(negedge clk)` 더미가 아니라 문장으로 읽힌다.
- **한 구간에 체크 하나**, 판정되는 그 순간에 찍어라. 실행은 찍힌 줄마다 잘리므로,
  한 호흡에 두 체크를 찍으면 둘을 구분할 수 없다.
- **모든 줄 앞에 `[%0t]`** — 이것이 있어야 체크를 덤프 위에 올려놓을 수 있다.

**왜** 그렇게 동작했는지는 여기서 할 일이 아니다. 그건 나중에 코드를 보고 하는 별도의
단계(`waveform` 프롬프트)다.

주석은 스펙의 "Comments — top down, in the reader's language" 대로 써줘 — 모듈마다
머리말(무엇을 위한 것인지, 무엇이 흐르는지, 그것을 성립시키는 **하나의 생각**, 그리고
기억하는 상태 목록), 그 다음 블록마다 **왜** 그런지 한 줄. 한국어로 쓰되 신호·모듈
이름은 코드 그대로. 계약 C1–C7 을 지키고, RTLGRAPH_ENVIRONMENT.md 에 있는 시뮬레이터로 컴파일·엘라보레이션·
시뮬레이션까지 확인해줘. 테스트벤치는 tb/ 에 두고, 하강 에지에서 입력을 넣고 상승
에지에서 확인하는 방식으로 써줘.

코드와 코드 주석은 영어로, 설명과 보고는 한국어로 해줘. 기술 용어는 처음 등장할 때
영어 표현을 괄호로 병기해.

마지막으로 Workflow A 로 RTLGraph 파일들도 만들어줘: 루트 <top>.rtlgraph.json,
컴포넌트마다 <이름>.rtlgraph-schematic.json, 그리고 상태 기계(FSM)를 가진 컴포넌트는
<이름>.rtlgraph-fsm.json 까지(Step 7b) — 상태 레지스터에는 fsm 표시. 각 파일의
source.root 는 그 파일에서 자기가 설명하는 코드까지 가는 길이고, 틀리면 source-root
에러로 무엇이어야 하는지까지 알려줘. SPEC_DOC 이 이 설계가 요구된 문서니까 그것도
남겨줘 — 루트의 source.spec(아래 파일들이 물려받아)과, 문서가 실제로 말하는 요소에
spec: { quote, page } 로 그 문장 그대로. 그리고 루트를
node PROJECT_FOLDER/.agent/rtlgraph/validate.mjs 로 에러 0개까지 검증해줘.
스펙 그대로 따르고, 중간에 나한테 아무것도 묻지 말고 끝까지 진행해줘. 다 되면 만든 파일 목록, 시뮬레이션 결과,
RTLGraph 검증 결과, VS Code 에서 어떤 파일을 열면 회로도가 보이는지, 그리고 요구사항
으로 연결되는 상자가 어떤 것들인지 알려줘.
