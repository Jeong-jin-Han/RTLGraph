PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow A — RTL →
RTLGraph" 를 따라줘. 이미 있는 RTL 코드로 회로도를 만드는 작업이니 .v/.sv 파일은
절대 수정하지 마.

먼저 이 프로젝트의 탑 모듈, 컴포넌트 구성, 그리고 계약 C1–C7 을 얼마나 따르는지를
간단히 설명해줘. 그 다음 바로 RTLGraph 파일을 만들어줘.

meaning, label, note, 진단 메시지는 한국어로 쓰되, 신호·모듈·인스턴스·핀 이름은
코드 그대로 쓰고, 기술 용어는 처음 등장할 때 영어 표현을 괄호로 병기해(예:
"누산기(accumulator)").

만든 파일은 node PROJECT_FOLDER/.agent/rtlgraph-validate.mjs <파일> 로 에러가 0개가
될 때까지 검증해줘. 스펙 그대로 따르고, 중간에 나한테 아무것도 묻지 말고 끝까지
진행해줘. 다 되면 만든 파일 경로, 검증 결과, 계약 검사 결과를 알려줘.
