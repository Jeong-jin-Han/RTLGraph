PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
MAIN_COMPONENT = <main component 이름. 정해두지 않았으면 비워둬>
REQUEST = <추가하거나 바꾸고 싶은 기능. 없으면 "구조만 정리">

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow C —
Existing RTL → Refactored RTL" 을 따라줘. 이미 있는 코드를 바탕으로 다시 만드는
작업이야.

먼저 지금 코드가 어떤 구조인지, 계약 C1–C7 중 무엇을 어기는지, REQUEST 를 넣으려면
어디를 어떻게 바꿔야 하는지를 짧게 설명해줘. 그 다음 바로 작업해줘.

- 코드를 건드리기 전에 테스트벤치로 기준선(tb/baseline.txt)을 먼저 덤프해줘.
- 구조 정리와 기능 추가는 반드시 나눠서 해줘. 먼저 동작이 같은 상태로 3층 구조(main
  component 폴더 안의 comb/data_path, comb/control_path, seq, tb)로 옮기고, 기준선
  diff 가 비어 있는지 확인해. 그 다음에 REQUEST 의 기능을 더하고, 그 기능에 대한
  테스트를 새로 추가해줘. 어느 출력이 왜 달라지는지 설명해줘.
- MAIN_COMPONENT 가 적혀 있으면 그 이름을 그대로 써. 비어 있으면 네가 정하고 왜 그렇게
  정했는지 알려줘.
- 계약 C1–C7 을 지키고, ENVIRONMENT.md 에 있는 시뮬레이터로 컴파일·엘라보레이션·
  시뮬레이션까지 확인해줘.

코드와 코드 주석은 영어로, 설명과 보고는 한국어로 해줘. 기술 용어는 처음 등장할 때
영어 표현을 괄호로 병기해.

마지막으로 Workflow A 로 RTLGraph 파일들을 다시 만들어줘: 루트 <top>.rtlgraph.json,
컴포넌트마다 <이름>.rtlgraph-schematic.json, 상태 기계(FSM)를 가진 컴포넌트는
<이름>.rtlgraph-fsm.json 까지(Step 7b) — 상태 레지스터에는 fsm 표시. 구조를 바꾸면
파일이 움직이니까 끝나고 나서 source.root 를 전부 다시 확인해줘. 각 JSON 파일에서
그 파일이 지금 설명하는 코드까지 가는 길이고, 틀리면 source-root 에러로 무엇이어야
하는지까지 알려줘(source.lib 도 마찬가지). spec 인용은 해당 요소가 옮겨 간 자리로
같이 옮겨줘. 그리고 루트를 node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs 로
에러 0개까지 검증해줘. 스펙 그대로 따르고, 중간에 나한테
아무것도 묻지 말고 끝까지 진행해줘. 다 되면 바꾼 파일 목록, 구조 정리 단계의 기준선
diff 결과, 기능 추가 뒤의 시뮬레이션 결과, RTLGraph 검증 결과, 그리고 VS Code 에서
어떤 파일을 열면 회로도가 보이는지 알려줘.
