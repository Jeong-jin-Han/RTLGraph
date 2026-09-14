PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOC = <사양 문서 경로. 없으면 비우고 REQUEST 에 요구사항을 직접 적어줘>
MAIN_COMPONENT = <main component 이름. 정해두지 않았으면 비워둬>
REQUEST = <SPEC_DOC 가 없을 때만: 무엇을 만들지>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow B — Spec →
RTL" 을 따라서 **새 프로젝트의 RTL 을 처음부터** 만들어줘. (이미 있는 코드를 고치는
경우라면 이 프롬프트가 아니라 .prompt/refactor/korean.md 를 써야 해.)

SPEC_DOC 이 있으면 그 문서를 먼저 끝까지 읽고, 그 문서가 정한 포트·컴포넌트·제어 신호
표를 그대로 따라줘. 문서와 다르게 만들어야 할 이유가 생기면 그 이유를 보고에 적어줘.

컴포넌트가 하나뿐이어도 main component 폴더를 먼저 만들고 그 안에 comb/data_path,
comb/control_path, seq, tb 를 둔 뒤, 데이터패스 상자와 제어 신호 표를 정하고 코드를
채워줘. MAIN_COMPONENT 가 적혀 있으면 그 이름을 그대로 쓰고, 비어 있으면 네가 정하고
왜 그렇게 정했는지 알려줘.

계약 C1–C7 을 지키고, ENVIRONMENT.md 에 있는 시뮬레이터로 컴파일·엘라보레이션·
시뮬레이션까지 확인해줘. 테스트벤치는 tb/ 에 두고, 하강 에지에서 입력을 넣고 상승
에지에서 확인하는 방식으로 써줘.

코드와 코드 주석은 영어로, 설명과 보고는 한국어로 해줘. 기술 용어는 처음 등장할 때
영어 표현을 괄호로 병기해.

마지막으로 Workflow A 로 RTLGraph 파일들(루트 <top>.rtlgraph.json 과 컴포넌트마다
<이름>.rtlgraph-schematic.json)도 만들고, 루트를 node PROJECT_FOLDER/.agent/
rtlgraph-validate.mjs 로 에러 0개까지 검증해줘. 스펙 그대로 따르고, 중간에 나한테
아무것도 묻지 말고 끝까지 진행해줘. 다 되면 만든 파일 목록, 시뮬레이션 결과,
RTLGraph 검증 결과, 그리고 VS Code 에서 어떤 파일을 열면 회로도가 보이는지 알려줘.
