`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// rdy_fsm — the handshake machine (Moore: RDY is the state).
//   RDY is active-low while the core is activated, so READY drives it
//   high and BUSY drives it low.
//------------------------------------------------------------------
module rdy_fsm (
    input  wire RST,
    input  wire SET,
    input  wire STOPPED,
    input  wire BUSY,

    // @sch: meaning="the state the next cycle is in; 1=busy"
    output wire BUSY_D,
    // @sch: meaning="active-low: 0 while the core is activated"
    output wire RDY
);

    reg [1:0] FSM_OUT;
    assign {BUSY_D, RDY} = FSM_OUT;

    always @(*) begin
        // RDY is the state and nothing else — it is always the opposite of BUSY.
        casex ({RST, SET, STOPPED, BUSY})
            4'b1xxx: FSM_OUT = 2'b0_1;  // reset: ready
            4'b01x0: FSM_OUT = 2'b1_1;  // ready, SET taken: busy from the next cycle
            4'b01x1: FSM_OUT = 2'b1_0;  // busy already, SET again: stay busy
            4'b0001: FSM_OUT = 2'b1_0;  // busy, the core is still running
            4'b0011: FSM_OUT = 2'b0_0;  // busy, the core stopped: ready next cycle
            4'b000x: FSM_OUT = 2'b0_1;  // ready and nothing asked
            default: FSM_OUT = 2'b0_1;
        endcase
    end

endmodule
`default_nettype wire
