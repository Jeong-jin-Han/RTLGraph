PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
SPEC_DOCUMENT = <비워 두거나, 이 설계가 요구된 문서 경로 예: spec/pwm_brief.pdf>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow A — RTL →
RTLGraph" 를 따라줘. 이미 있는 RTL 코드로 회로도를 만드는 작업이니 .v/.sv 파일은
절대 수정하지 마.

먼저 이 프로젝트의 탑 모듈, 컴포넌트 트리(main component 와, 어떤 모듈이 그 안의
컴포넌트 상자가 되는지), 그리고 계약 C1–C7 을 얼마나 따르는지를 간단히 설명해줘.
그 다음 바로 RTLGraph 파일들을 만들어줘: PROJECT_FOLDER 에 루트 <top>.rtlgraph.json,
그리고 컴포넌트마다 그 컴포넌트 폴더에 <이름>.rtlgraph-schematic.json. SPEC_DOCUMENT 가
주어졌으면 Step 7c 도 따라서 source.spec 을 적고, 각 요소가 왜 있는지를 그 문서의 문장
그대로(축약하지 말고) spec 에 인용해줘. 상태 기계(FSM)
를 가진 컴포넌트라면 같은 폴더에 <이름>.rtlgraph-fsm.json 까지 쓰고(Step 7b), 상태
레지스터에 fsm 을 표시해줘.

meaning, label, note, 진단 메시지는 한국어로 쓰되, 신호·모듈·인스턴스·핀 이름은
코드 그대로 쓰고, 기술 용어는 처음 등장할 때 영어 표현을 괄호로 병기해(예:
"누산기(accumulator)").

루트를 node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs <top>.rtlgraph.json 으로
(루트가 가리키는 schematic 까지 함께 검사돼) 에러가 0개가 될 때까지 검증해줘. 스펙
그대로 따르고, 중간에 나한테 아무것도 묻지 말고 끝까지 진행해줘. 다 되면 만든 파일
경로, 검증 결과, 계약 검사 결과, 그리고 VS Code 에서 어떤 파일을 열면 회로도가
보이는지 알려줘.
