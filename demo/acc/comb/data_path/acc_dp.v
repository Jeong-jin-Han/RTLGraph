`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// acc_dp — 조합 · data-path
//   base/ 의 프리미티브를 인스턴스로 조합한다. 클럭 없음.
//   슬라이드 p.31 그림의 상자들(+1 / ADD / SUB / MUX)과 1:1 대응.
//------------------------------------------------------------------
module acc_dp (
    // CNT_FF interface
    input  wire [5:0] CNT_Q,
    output wire [5:0] CNT_D,

    // ACC_FF interface
    input  wire [5:0] ACC_Q,
    output wire [5:0] ACC_D,

    // Selection signal
    // @sch: meaning="0=덧셈(ADD), 1=뺄셈(SUB)"
    input  wire       ACC_SEL
);

    wire [5:0] ADD_OUT;
    wire [5:0] SUB_OUT;

    // CNT : 매 사이클 +1
    INC  #(5) u_inc (.a(CNT_Q), .y(CNT_D));

    // ACC : 덧셈/뺄셈을 모두 계산하고 MUX 로 고른다
    ADD  #(5) u_add (.a(ACC_Q), .b(CNT_Q), .y(ADD_OUT));
    SUB  #(5) u_sub (.a(ACC_Q), .b(CNT_Q), .y(SUB_OUT));
    MUX2 #(5) u_mux (.sel(ACC_SEL), .d0(ADD_OUT), .d1(SUB_OUT), .y(ACC_D));

endmodule
`default_nettype wire
