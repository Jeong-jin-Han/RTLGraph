PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <비워 두거나, 이 설계가 요구된 문서 경로 예: spec/pwm_brief.pdf>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/RTLGRAPH_ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow A — RTL →
RTLGraph" 를 따라줘. 이미 있는 RTL 코드로 회로도를 만드는 작업이니 .v/.sv 파일은
절대 수정하지 마.

먼저 이 프로젝트의 탑 모듈, 컴포넌트 트리(main component 와, 어떤 모듈이 그 안의
컴포넌트 상자가 되는지), 그리고 계약 C1–C7 을 얼마나 따르는지를 간단히 설명해줘.
그 다음 바로 RTLGraph 파일들을 만들어줘: PROJECT_FOLDER 에 루트 <top>.rtlgraph.json,
그리고 컴포넌트마다 그 컴포넌트 폴더에 <이름>.rtlgraph-schematic.json. 상태 기계(FSM)
를 가진 컴포넌트라면 같은 폴더에 <이름>.rtlgraph-fsm.json 까지 쓰고(Step 7b), 상태
레지스터에 fsm 을 표시해줘.

각 파일의 source.root 는 그 파일에서 자기가 설명하는 코드까지 가는 길이야 — 같은
폴더면 ".", JSON 이 한 칸 떨어져 있으면 ".." 나 "../src". 여기서 틀리는 게 가장 흔한
실패고, 그러면 검증기가 source-root(경고 아니라 에러)로 코드가 실제로 있는 폴더와
source.root 가 무엇이어야 하는지까지 알려줘. source.lib 도 같은 방식으로 검사돼.

SPEC_DOCUMENT 가 주어졌으면 Step 7c 도 따라줘: 루트의 source.spec 에 그 문서를 적고
(아래 파일들이 물려받으니까, 문장을 인용하지 않은 상자에서도 그 문서를 열 수 있어),
문서가 실제로 말하고 있는 요소에는 spec: { quote, page } 로 그 문장 그대로(축약하지
말고)와 쪽 번호를 남겨줘. 그 인용이 독자가 뛰어가는 지점이야 — 상자를 우클릭하면 도면
옆에 문서가 열리고 그 문장이 하이라이트되고, workbook(xlsx) 내보내기는 요구사항마다
그것을 지고 있는 요소를 함께 적어줘.

코드가 자기 안에 없는 기본 소자를 인스턴스화하면 — 핸드아웃 스켈레톤이 DFF 를 쓰면서
정작 DFF 를 안 주는 일이 흔해 — `.agent/` 옆에 같이 복사된 `.base/` 를 써줘.
source.lib 을 거기로 두고, 설계가 실제로 쓰는 파일만 source.libFiles 에 적고,
라이브러리를 거기서 가져왔다는 걸 diagnostics 에 남겨줘. 코드의 기본 소자가 기본
라이브러리와 다르면(폭을 BITWIDTH 로 받는 DFF vs 최상위 인덱스 BW 를 받는 우리 것)
코드를 믿어: 그 파라미터를 그대로 쓰고, .base/ 의 사본을 코드에 맞게 고치고,
library-adapted 진단을 남겨줘.

meaning, label, note, 진단 메시지는 한국어로 쓰되, 신호·모듈·인스턴스·핀 이름은
코드 그대로 쓰고, 기술 용어는 처음 등장할 때 영어 표현을 괄호로 병기해(예:
"누산기(accumulator)").

루트를 node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs <top>.rtlgraph.json 으로
(루트가 가리키는 schematic 까지 함께 검사돼) 에러가 0개가 될 때까지 검증해줘. 스펙
그대로 따르고, 중간에 나한테 아무것도 묻지 말고 끝까지 진행해줘. 다 되면 만든 파일
경로, 검증 결과, 계약 검사 결과, 그리고 VS Code 에서 어떤 파일을 열면 회로도가
보이는지 알려줘. 요구사항으로 연결되는 상자가 있으면 어떤 것들인지도 알려주고 —
그래야 독자가 그 링크가 있다는 걸 알아.
