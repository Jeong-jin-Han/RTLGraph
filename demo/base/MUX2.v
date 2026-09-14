`timescale 1ns / 1ps
`default_nettype none
// MUX2 — 2-to-1 선택.  sel=0 -> d0,  sel=1 -> d1
module MUX2 #(parameter BW = 5) (
    input  wire          sel,
    input  wire [BW:0]   d0,
    input  wire [BW:0]   d1,
    output wire [BW:0]   y
);
assign y = sel ? d1 : d0;
endmodule
`default_nettype wire
