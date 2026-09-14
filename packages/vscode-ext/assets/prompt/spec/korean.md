PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
IDEA_FILE = <아이디어를 적어 둔 파일 경로, 예: PROJECT_FOLDER/idea.txt>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md 와 PROJECT_FOLDER/.agent/ENVIRONMENT.md
파일은 이미 준비돼 있어 — 둘 다 끝까지 꼼꼼히 읽어줘. 그 중에서 "Workflow S — Idea →
Spec" 을 따라줘.

IDEA_FILE 을 읽고, 그 아이디어를 RTL 로 옮길 수 있을 만큼 구체적인 사양 문서
PROJECT_FOLDER/SPEC.md 를 만들어줘. 아직 코드는 쓰지 마. 이 문서 하나만 만드는
단계야.

문서에는 무엇을 만드는지, 탑 모듈의 포트(이름·방향·폭·의미), 컴포넌트 구성과 각
컴포넌트가 맡는 일, 레지스터와 그 사이 연산, 제어 신호 표(입력 조합 → 출력), 상태
기계가 필요하면 상태와 전이, 리셋과 우선순위, 그리고 어떻게 검증할지가 들어가야 해.

아이디어에 없어서 네가 정해야 하는 값(비트 폭, 클럭 주기, 초기값 같은 것)은 마음대로
정하되, 문서 안에 "정한 것" 절을 따로 만들어서 무엇을 왜 그렇게 정했는지 모아서 적어줘.
아이디어와 어긋나거나 애매한 부분도 "확인이 필요한 것" 절에 적어줘. 나한테 묻지 말고
일단 합리적으로 정해서 끝까지 진행해줘.

문서는 한국어로 쓰고, 신호·모듈·포트 이름은 영어 식별자로 정해서 코드에 그대로 쓸 수
있게 해줘. 기술 용어는 처음 등장할 때 영어 표현을 괄호로 병기해.

다 되면 만든 문서 경로, 컴포넌트 구성 요약, 그리고 "정한 것"과 "확인이 필요한 것" 을
알려줘. 이 문서가 마음에 들면 다음 단계로 .prompt/rtl/korean.md 를 쓸 거야.
