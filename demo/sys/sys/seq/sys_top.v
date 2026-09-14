`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// sys_top — main component top
//   A host that counts samples and a device that keeps a running sum
//   of what the host sends. Wiring only: both are components.
//------------------------------------------------------------------
module sys_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       START,
    output wire [5:0] SUM
);

    wire [5:0] DATA;
    wire       VALID;

    host_top u_host (
        .CLK   (CLK),
        .RST   (RST),
        .START (START),
        .DATA  (DATA),
        .VALID (VALID)
    );

    dev_top u_dev (
        .CLK   (CLK),
        .RST   (RST),
        .VALID (VALID),
        .DATA  (DATA),
        .SUM   (SUM)
    );

endmodule
`default_nettype wire
