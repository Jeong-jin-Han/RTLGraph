PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
RTLGRAPH_FOLDER = <비워 두면 각 파일을 코드 옆에, 폴더 이름을 적으면 그 폴더 하나에(예: rtlgraph)>
SPEC_DOCUMENT = <과제 핸드아웃 PDF 경로, 없으면 비워 둠>
GIVEN_TB = <처음부터 테스트벤치를 같이 받았다면 그 경로, 아니면 비워 둠>

받은 과제를 처음부터 끝까지 도는 순서다. 아래 단계를 **위에서부터** 따라라. 각 단계는
"읽고 그대로 할 프롬프트" 아니면 "돌릴 명령" 둘 중 하나다.

**공통 규칙**

- 단계가 **실패하면 다음 단계로 넘어가지 마라.** 벤치가 FAIL 인 채로 분석이나 제출로
  가지 마라.
- ⏸ 에서는 **멈추고 보고한 뒤 계속할지 물어봐라.** 나머지는 묻지 말고 진행해라.
- 프롬프트의 맨 위 변수는 **여기서 정한 값**으로 채워라.
- 핸드아웃이 준 `.v` 파일은 포트도 이름도 바꾸지 마라. 핸드아웃의 주석은 한 글자도
  건드리지 말고, 네 주석은 그 주위에 써라.

---

**1. 회로도와 우리 벤치를 만든다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/assignment/korean.md`
를 읽고 그대로 해라. RTLGRAPH_FOLDER · SPEC_DOCUMENT · GIVEN_TB 는 위 값을 넘겨라.
이 단계가 `tb/given/`(비어 있음)과 `tb/mine/`(네가 쓴 벤치)을 만든다.

**2. 우리 벤치를 돌린다.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh mine
```

컴파일되지 않으면 실행기가 먼저 그 까닭을 말한다. "정의되지 않은 모듈"이라고 하면
설계가 아니라 **이 기계의 설정** 문제다 — 합성된 넷리스트의 벤더 셀(LUT6, FDRE …)은 Vivado
라이브러리에 있다. `RTLGRAPH_VENDOR_SRC` 를 알려 주거나 `settings64.sh` 를 불러오면 된다고
보고하고, 코드는 한 줄도 건드리지 마라.

⏸ **여기서 멈춘다.** 벤치마다 판정 한 줄과, 검증기가 뭐라고 했는지(`0 errors` 여야
한다)를 보고해라. FAIL 이면 **고치기 전에** 무엇이 틀렸는지 먼저 말해라 — 벤치가 틀린
것인지 설계가 틀린 것인지는 내가 정한다.

**3. 파형을 남긴다.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh --wave
```

설계가 크면(합성된 넷리스트, 셀 수천 개) `--wave` 대신 `--wave-depth 3` 을 써라 — LUT
안쪽은 읽을 것이 없고, 전부 덤프하면 VCD 가 열리지도 않을 만큼 커진다.

**4. 왜 통과했는지 쓴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/waveform/korean.md` 를 읽고
그대로 해라. WAVEFORM 은 비워 두고 방금 생긴 것 전부를 다뤄라.

**5. 이해한 것을 글로 남긴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/codespec/korean.md`
를 읽고 그대로 해라. SPEC_FOLDER 는 `me`, SPEC_DOCUMENT 는 위에서 정한 핸드아웃. 채점 당일에
설계를 다시 읽을 시간은 없고, 이 문서가 그 자리를 대신한다. 특히 **`[미정]` 목록**이 —
핸드아웃이 말하지 않아 코드가 알아서 정한 것들 — 조교 벤치가 건드릴 수 있는 자리다.

다 쓰고 나면 **명세를 뷰어로 열어 확인해라**(문서 맨 위 `📖`). 시나리오 제목 아래에 스텝이
하나도 보이지 않으면 그 제목이나 `00-format.md` 의 표기 표가 양식과 다른 것이니, 보고하기
전에 고쳐라.

**6. 제출물을 확인만 한다.**

```
PROJECT_FOLDER/.agent/rtlgraph/make-submission.sh --list
```

⏸ **여기서 멈춘다.** 들어갈 파일 목록을 보고하고, 설계가 elaborate 하는 데 필요해서 따라
들어간 파일이 있으면 그것도 보고해라. **zip 은 내가 말할 때 만든다.**

**7. 보고한다.** 만든 파일 경로, 벤치 판정, 검증기 줄, 그리고 조교 벤치가 오는 날 할
일이 `run-tb.sh given` 하나뿐인지 — 아니라면 무엇이 더 필요한지.
