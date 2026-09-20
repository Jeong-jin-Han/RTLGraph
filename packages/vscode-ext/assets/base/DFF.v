`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// DFF — enable + synchronous reset 을 갖는 D 플립플롭
//   BW 는 "최상위 비트 인덱스". 실제 폭은 BW+1 비트.
//   우선순위: RST > EN  (RST=1 이면 EN 이 x 여도 Q 는 0 으로 확정)
//------------------------------------------------------------------
module DFF #(parameter BW = 5) (
    input  wire          CLK,
    input  wire          RST,   // active-high, synchronous
    input  wire          EN,
    input  wire [BW:0]   D,
    output reg  [BW:0]   Q
);
always @(posedge CLK) begin
    if (RST)      Q <= {(BW+1){1'b0}};
    else if (EN)  Q <= D;
end
endmodule
`default_nettype wire
