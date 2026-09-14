`timescale 1ns / 1ps
`default_nettype none
// inbuf_top — one-stage input buffer with enable
module inbuf_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       EN,
    input  wire [5:0] DIN,
    output wire [5:0] DOUT
);

    wire [5:0] BUF_D;
    wire [5:0] BUF_Q;

    DFF #(5) BUF_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (EN),
        .D   (BUF_D),
        .Q   (BUF_Q)
    );

    assign BUF_D = DIN;
    assign DOUT  = BUF_Q;

endmodule
`default_nettype wire
