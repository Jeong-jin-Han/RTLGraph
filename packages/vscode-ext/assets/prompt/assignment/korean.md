PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <비워 두거나, 이 설계가 요구된 문서 경로 예: spec/pwm_brief.pdf>
RTLGRAPH_FOLDER = <비워 두면 각 파일을 코드 옆에, 폴더 이름을 적으면 그 폴더 하나에 모아서 예: rtlgraph>

이건 과제야. 스켈레톤 코드는 받은 그대로 유지해야 해. .v/.sv 파일은 수정·이동·이름
변경·재정렬 전부 금지고, 신호·모듈·포트 이름도 하나도 바꾸지 마. 코드를 위한 폴더도
새로 만들지 마. 네가 쓰는 건 RTLGraph JSON 뿐이고, 코드는 아무것도 건드리지 않아.

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
는 이미 준비돼 있어 — 둘 다 끝까지 읽어줘. "Workflow A — RTL → RTLGraph" 를 따르되,
Step 2 의 배치는 "Follow the code" 쪽으로: 컴포넌트의 schematic 은 그 모듈이 있는
폴더에 두고, source.root 는 보통 ".", 루트에는 layout-follows-code 진단을 남겨.
RTLGRAPH_FOLDER 에 폴더 이름이 적혀 있으면 그 폴더 하나만 만들어서 RTLGraph 파일을
루트 파일까지 전부 거기 모아 두고, source.root 로 코드 쪽으로 빠져나와(".." 나
"../src"). 코드 자체는 그대로.

source.root 는 각 JSON 파일에서 그 파일이 설명하는 코드까지 가는 길이야. 여기서
틀리는 게 이 작업이 어긋나는 가장 흔한 경로고, 그러면 검증기가 source-root 를
알려줘 — 경고가 아니라 에러라서 고치기 전에는 "0 errors" 에 도달할 수 없고,
메시지가 코드가 실제로 있는 폴더와 source.root 가 무엇이어야 하는지까지 말해줘.
source.lib 도 같은 방식으로 검사돼.

먼저 탑 모듈, 어떤 모듈이 컴포넌트 상자가 되는지, 그리고 계약 C1–C7 과 어디가 다른지를
간단히 설명해줘 — 고칠 대상이 아니라 과제를 읽은 결과로. 그 다음 파일을 만들어줘:
<top>.rtlgraph.json 과 컴포넌트마다 <이름>.rtlgraph-schematic.json 을, 각각 그 모듈이
있는 폴더에 (RTLGRAPH_FOLDER 가 정해져 있으면 전부 그 폴더에). 상태 기계(FSM)를 가진
컴포넌트면 같은 폴더에 <이름>.rtlgraph-fsm.json 까지 쓰고 상태 레지스터에 fsm 을
표시해줘.

SPEC_DOCUMENT 가 주어졌으면(과제는 보통 명세 PDF 가 있지) Step 7c 를 따라 루트의
source.spec 에 그 문서를 적어줘. 아래 파일들은 그걸 물려받으니까, 문장을 인용하지 않은
상자에서도 문서를 열 수 있어. 그리고 문서가 실제로 말하고 있는 요소에는
spec: { quote, page } 로 그 문장 그대로와 쪽 번호를 남겨줘. 그 인용이 독자가 뛰어가는
지점이야 — 상자를 우클릭하면 도면 옆에 문서가 열리고 그 문장이 하이라이트되고,
workbook(xlsx) 내보내기는 요구사항마다 그것을 지고 있는 요소를 함께 적어줘.

코드가 자기 안에 없는 기본 소자를 인스턴스화하면 — 핸드아웃 스켈레톤이 DFF 를 쓰면서
정작 DFF 를 안 주는 일이 흔해 — `.agent/` 옆에 같이 복사된 `.base/` 를 써줘.
source.lib 을 거기로 두고, 설계가 실제로 쓰는 파일만 source.libFiles 에 적고,
라이브러리를 거기서 가져왔다는 걸 diagnostics 에 남겨줘. 코드의 기본 소자가 기본
라이브러리와 다르면(폭을 BITWIDTH 로 받는 DFF vs 최상위 인덱스 BW 를 받는 우리 것)
코드를 믿어: 그 파라미터를 그대로 쓰고, .base/ 의 사본을 코드에 맞게 고치고,
library-adapted 진단을 남겨줘.

meaning, label, note, 진단 메시지는 한국어로 쓰되, 신호·모듈·인스턴스·핀 이름은 코드
그대로 쓰고, 기술 용어는 처음 등장할 때 영어를 괄호로 병기해(예: "계수기(counter)").

node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs 로 네가 쓴 루트 파일을 —
PROJECT_FOLDER/<top>.rtlgraph.json, 또는 RTLGRAPH_FOLDER 안의 그 파일을 — 에러가
0개가 될 때까지 검증해줘. 중간에 나한테 묻지 말고 끝까지 진행해. 다 되면 만든 파일
경로, 검증 결과, VS Code 에서 열 파일, 그리고 — 따로 — 만약 리팩터가 허용된다면
무엇을 어떻게 바꾸고 싶은지도 알려줘. 그건 내가 별도 작업으로 시킬지 판단할게.
