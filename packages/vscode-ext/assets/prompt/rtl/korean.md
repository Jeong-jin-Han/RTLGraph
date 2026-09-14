PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
REQUEST = <무엇을 만들거나 고칠지 — 사양 문서 경로 또는 요구사항>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow B — Spec
→ RTL" 을 따라서 REQUEST 를 수행해줘.

- 기존 코드를 3층 구조로 바꾸는 리팩터라면, 코드를 건드리기 전에 테스트벤치로 기준선
  (tb/baseline.txt)을 먼저 덤프하고, 고친 뒤 출력 diff 가 비어야 완료야. 동작 변경과
  리팩터를 섞지 마.
- 새로 만드는 거라면 컴포넌트가 하나뿐이어도 main component 폴더를 먼저 만들고 그
  안에 comb/data_path, comb/control_path, seq, tb 를 둔 뒤, 데이터패스 상자와 제어
  신호 표를 정한 다음 코드를 채워줘.
- 계약 C1–C7 을 지키고, ENVIRONMENT.md 에 있는 시뮬레이터로 컴파일·엘라보레이션·
  시뮬레이션까지 확인해줘.

코드와 코드 주석은 영어로, 설명과 보고는 한국어로 해줘. 기술 용어는 처음 등장할 때
영어 표현을 괄호로 병기해.

마지막으로 Workflow A 로 RTLGraph 파일들(루트 <top>.rtlgraph.json 과 컴포넌트마다
<이름>.rtlgraph-schematic.json)도 만들고, 루트를 node PROJECT_FOLDER/.agent/
rtlgraph-validate.mjs 로 에러 0개까지 검증해줘. 스펙 그대로 따르고, 중간에 나한테
아무것도 묻지 말고 끝까지 진행해줘. 다 되면 바꾼 파일 목록, 시뮬레이션·기준선 비교
결과, RTLGraph 검증 결과, 그리고 VS Code 에서 어떤 파일을 열면 회로도가 보이는지
알려줘.
