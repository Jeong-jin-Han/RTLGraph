PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
RTLGRAPH_FOLDER = <비워 두면 각 파일을 코드 옆에, 폴더 이름을 적으면 그 폴더 하나에>

남이 쓴(또는 오래된) RTL 을 **읽기 위해** 도는 순서다. 코드는 한 줄도 고치지 않는다 —
그림을 그리고, 돌려 보고, 왜 그렇게 도는지 쓴다. 아래 단계를 위에서부터 따라라.

**공통 규칙**

- 단계가 **실패하면 다음 단계로 넘어가지 마라.**
- ⏸ 에서는 멈추고 보고한 뒤 계속할지 물어봐라. 나머지는 묻지 말고 진행해라.
- `.v`/`.sv` 는 읽기만 한다. 고쳐야 할 것이 보이면 고치지 말고 마지막 보고에 적어라.

---

**1. 회로도를 만든다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/rtlgraph/korean.md` 를 읽고
그대로 해라. RTLGRAPH_FOLDER 는 위 값을 넘겨라.

⏸ **여기서 멈춘다.** 검증기 결과(`0 errors` 여야 한다)와, 어떤 파일을 열면 회로도가
보이는지, 그리고 **이 설계를 성립시키는 하나의 생각**을 한 문장으로 보고해라.

**2. 글로 옮긴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/codespec/korean.md` 를 읽고
그대로 해라. SPEC_FOLDER 는 `me`. 회로도가 모양을 보여 줬다면 이것은 **동작을 글로** 남기는
단계다 — 깊이 여섯 절, 숫자마다 출처, 핸드아웃이 말하지 않은 것은 `[미정]`.

⏸ **여기서 멈춘다.** `[미정]` 중 가장 위험한 것 하나와, 재지 못한 숫자를 보고해라.

**3. 테스트벤치가 있으면 돌린다.**

```
PROJECT_FOLDER/.agent/rtlgraph/run-tb.sh --wave
```

벤치가 하나도 없으면(`tb/given/` 과 `tb/mine/` 이 둘 다 비었으면) 여기서 멈추고 그렇게
말해라 — 벤치를 새로 쓰는 것은 이 순서의 일이 아니다.

**4. 왜 그렇게 도는지 쓴다.** `PROJECT_FOLDER/.prompt/rtlgraph/components/waveform/korean.md` 를
읽고 그대로 해라. WAVEFORM 은 비워 둬라.

**5. 보고한다.** 회로도 파일 경로, 명세 폴더, 벤치 판정, 그리고 **읽으면서 의심스러웠던 것 하나** —
고치지는 말고, 어느 줄이 왜 의심스러운지만.
