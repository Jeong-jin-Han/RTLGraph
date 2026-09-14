`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// host_top — sends an incrementing sample while START is held
//------------------------------------------------------------------
module host_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       START,
    output wire [5:0] DATA,
    output wire       VALID
);

    wire [5:0] CNT_D;
    wire [5:0] CNT_Q;
    wire       CNT_RST;
    wire       CNT_EN;

    // Data-path
    host_dp data_path (
        .CNT_Q (CNT_Q),
        .CNT_D (CNT_D)
    );

    // Control-path
    host_cp control_path (
        .RST     (RST),
        .START   (START),
        .CNT_RST (CNT_RST),
        .CNT_EN  (CNT_EN),
        .VALID   (VALID)
    );

    // Registers
    DFF #(5) CNT_FF (
        .CLK (CLK),
        .RST (CNT_RST),
        .EN  (CNT_EN),
        .D   (CNT_D),
        .Q   (CNT_Q)
    );

    assign DATA = CNT_Q;

endmodule
`default_nettype wire
