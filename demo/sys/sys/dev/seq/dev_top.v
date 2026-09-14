`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// dev_top — captures each valid sample in its input buffer and adds
//   the buffered sample to a running sum
//------------------------------------------------------------------
module dev_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       VALID,
    input  wire [5:0] DATA,
    output wire [5:0] SUM
);

    wire [5:0] BUF_OUT;
    wire       BUF_RST;
    wire       BUF_EN;

    wire [5:0] SUM_D;
    wire [5:0] SUM_Q;
    wire       SUM_RST;
    wire       SUM_EN;

    // Input buffer: a component of its own
    inbuf_top u_inbuf (
        .CLK  (CLK),
        .RST  (BUF_RST),
        .EN   (BUF_EN),
        .DIN  (DATA),
        .DOUT (BUF_OUT)
    );

    // Data-path
    dev_dp data_path (
        .SUM_Q   (SUM_Q),
        .BUF_OUT (BUF_OUT),
        .SUM_D   (SUM_D)
    );

    // Control-path
    dev_cp control_path (
        .RST     (RST),
        .VALID   (VALID),
        .BUF_RST (BUF_RST),
        .BUF_EN  (BUF_EN),
        .SUM_RST (SUM_RST),
        .SUM_EN  (SUM_EN)
    );

    // Registers
    DFF #(5) SUM_FF (
        .CLK (CLK),
        .RST (SUM_RST),
        .EN  (SUM_EN),
        .D   (SUM_D),
        .Q   (SUM_Q)
    );

    assign SUM = SUM_Q;

endmodule
`default_nettype wire
