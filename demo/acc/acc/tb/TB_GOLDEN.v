`timescale 1ns / 1ps
// 기준선 덤프용 골든 테스트벤치 (판정이 아니라 덤프가 목적)
module TB_GOLDEN ();
    reg CLK = 0, RST, SHOW, MODE;
    wire [5:0] ACC;
    integer i, seed;

    acc_top dut (.CLK(CLK), .RST(RST), .SHOW(SHOW), .MODE(MODE), .ACC(ACC));
    always #5 CLK = ~CLK;

    initial begin
        seed = 1;
        // ① reset
        RST = 1; SHOW = 0; MODE = 0;  repeat (3) @(posedge CLK);
        // ② normal — 덧셈 누산, 주기적 SHOW
        RST = 0;
        for (i = 0; i < 40; i = i + 1) begin
            SHOW = (i % 4 == 0); MODE = 0; @(posedge CLK);
        end
        // ③ corner — 뺄셈(언더플로), 오버플로까지 누산
        for (i = 0; i < 40; i = i + 1) begin
            SHOW = (i % 3 == 0); MODE = 1; @(posedge CLK);
        end
        // ④ external interrupt — 동작 중 리셋 + 난수 자극
        for (i = 0; i < 200; i = i + 1) begin
            RST  = ($random(seed) % 16 == 0);
            SHOW = $random(seed);
            MODE = $random(seed);
            @(posedge CLK);
        end
        $finish;
    end

    always @(posedge CLK)
        $display("%0t %b%b%b %b", $time, RST, SHOW, MODE, ACC);
endmodule
