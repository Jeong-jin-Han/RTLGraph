`timescale 1ns / 1ps

module acc_top (
    // CLK RST
    input wire CLK,
    input wire RST,

    // Input signals
    input wire SHOW,
    input wire MODE,

    // Output signal
    output wire [5:0] ACC
);

    // Wires
    wire [5:0] CNT_D;
    wire [5:0] CNT_Q;
    wire       CNT_RST;

    wire [5:0] ACC_D;
    wire [5:0] ACC_Q;
    wire       ACC_RST;

    wire [5:0] OUT_D;
    wire [5:0] OUT_Q;
    wire       OUT_RST;

    wire       OUT_EN;
    wire       ACC_SEL;

    // Data-path
    acc_dp data_path (
        .CNT_Q   (CNT_Q),
        .CNT_D   (CNT_D),
        .ACC_Q   (ACC_Q),
        .ACC_D   (ACC_D),
        .ACC_SEL (ACC_SEL)
    );

    // Control-path
    acc_cp control_path (
        .RST     (RST),
        .SHOW    (SHOW),
        .MODE    (MODE),
        .CNT_RST (CNT_RST),
        .ACC_RST (ACC_RST),
        .OUT_RST (OUT_RST),
        .OUT_EN  (OUT_EN),
        .ACC_SEL (ACC_SEL)
    );

    // Registers
    DFF #(5) CNT_FF (
        .CLK (CLK),
        .RST (CNT_RST),
        .EN  (1'b1),
        .D   (CNT_D),
        .Q   (CNT_Q)
    );

    DFF #(5) ACC_FF (
        .CLK (CLK),
        .RST (ACC_RST),
        .EN  (1'b1),
        .D   (ACC_D),
        .Q   (ACC_Q)
    );

    DFF #(5) OUT_FF (
        .CLK (CLK),
        .RST (OUT_RST),
        .EN  (OUT_EN),
        .D   (OUT_D),
        .Q   (OUT_Q)
    );

    // Direct assigns
    assign OUT_D = ACC_D;
    assign ACC   = OUT_Q;

endmodule
