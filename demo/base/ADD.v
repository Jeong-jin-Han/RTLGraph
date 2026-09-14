`timescale 1ns / 1ps
`default_nettype none
// ADD — 덧셈.  y = a + b   (자리올림 없음, 폭 유지)
module ADD #(parameter BW = 5) (
    input  wire [BW:0] a,
    input  wire [BW:0] b,
    output wire [BW:0] y
);
assign y = a + b;
endmodule
`default_nettype wire
