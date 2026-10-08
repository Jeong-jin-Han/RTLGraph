PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
RTLGRAPH_FOLDER = <비워 두면 각 파일을 코드 옆에, 폴더 이름을 적으면 그 폴더 하나에>
SPEC_DOCUMENT = <비워 두거나, 이 설계가 요구된 문서 경로>

남이 쓴(또는 오래된) RTL 을 **읽기 위해** 도는 순서다. 코드는 한 줄도 고치지 않는다 —
그림을 그리고, 돌려 보고, 왜 그렇게 도는지 쓴다. 아래 단계를 위에서부터 따라라.

**공통 규칙**

- 단계가 **실패하면 다음 단계로 넘어가지 마라.**
- ⏸ 에서는 멈추고 보고한 뒤 계속할지 물어봐라. 나머지는 묻지 말고 진행해라.
- 설계의 `.v`/`.sv` 는 읽기만 한다. 고쳐야 할 것이 보이면 고치지 말고 마지막 보고에 적어라.
  예외는 `.base/` 하나다 — 그건 이 도구가 넣어 준 사본이고, 설계가 그 소자를 다른 파라미터
  이름으로 부르면(`DFF #(.BITWIDTH(4))`) 사본을 코드에 맞추라고 `SPEC.md` 가 시킨다. 고치면
  `library-adapted` 진단과 파일 머리말에 왜 고쳤는지 남겨라.

---

**1. 회로도를 만든다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/rtlgraph/korean.md` 를 읽고
그대로 해라. RTLGRAPH_FOLDER 와 SPEC_DOCUMENT 는 위 값을 넘겨라.

⏸ **여기서 멈춘다.** 검증기 결과(`0 errors` 여야 한다), 어떤 파일을 열면 회로도가
보이는지, 그리고 **이 설계를 성립시키는 하나의 생각**을 한 문장으로 보고해라.

**2. 글로 옮긴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/codespec/korean.md` 를 읽고
그대로 해라. SPEC_FOLDER 는 `me`, SPEC_DOCUMENT 는 위에서 정한 값. 회로도가 모양을
보여 줬다면 이것은 **동작을 글로** 남기는 단계다 — 깊이 여섯 절, 숫자마다 출처, 핸드아웃이 말하지 않은 것은 `[미정]`.

다 쓰고 나면 **명세를 뷰어로 열어 확인해라**(문서 맨 위 `📖`). 시나리오 제목 아래에 스텝이
하나도 보이지 않으면 그 제목이나 `00-format.md` 의 표기 표가 양식과 다른 것이니, 보고하기
전에 고쳐라.

⏸ **여기서 멈춘다.** `[미정]` 중 가장 위험한 것 하나와, 재지 못한 숫자를 보고해라.

**3. 테스트벤치가 있으면 돌린다.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh --wave
```

벤치가 하나도 없으면(`tb/given/` 과 `tb/mine/` 이 둘 다 비었으면) 여기서 멈추고 그렇게
말해라 — 벤치를 새로 쓰는 것은 이 순서의 일이 아니다.

컴파일되지 않으면 실행기가 먼저 그 까닭을 말한다. "정의되지 않은 모듈"이라고 하면
설계가 아니라 **이 기계의 설정** 문제다 — 합성된 넷리스트의 벤더 셀(LUT6, FDRE …)은 Vivado
라이브러리에 있다. `RTLGRAPH_VENDOR_SRC` 를 알려 주거나 `settings64.sh` 를 불러오면 된다고
보고하고, 코드는 한 줄도 건드리지 마라.

설계가 크면(합성된 넷리스트, 셀 수천 개) `--wave` 대신 `--wave-depth 3` 을 써라 — LUT
안쪽은 읽을 것이 없고, 전부 덤프하면 VCD 가 열리지도 않을 만큼 커진다.

**4. 왜 그렇게 도는지 쓴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/waveform/korean.md` 를
읽고 그대로 해라. WAVEFORM 은 비워 둬라.

**5. 보고한다.** 회로도 파일 경로, 명세 폴더, 벤치 판정, 그리고 **읽으면서 의심스러웠던 것 하나** —
고치지는 말고, 어느 줄이 왜 의심스러운지만.
