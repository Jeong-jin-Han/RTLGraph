`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// rdy_top — the ready/busy handshake. SET makes the core busy and it
//   is ready again once the core reports that it stopped.
//------------------------------------------------------------------
module rdy_top (
    input  wire CLK,
    input  wire RST,
    input  wire SET,
    input  wire STOPPED,
    output wire RDY
);

    wire BUSY_Q;
    wire BUSY_D;

    // Control-path: the machine
    rdy_fsm control_path (
        .RST     (RST),
        .SET     (SET),
        .STOPPED (STOPPED),
        .BUSY    (BUSY_Q),
        .BUSY_D  (BUSY_D),
        .RDY     (RDY)
    );

    // Registers (for FSM)
    DFF #(0) BUSY_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (1'b1),
        .D   (BUSY_D),
        .Q   (BUSY_Q)
    );

endmodule
`default_nettype wire
