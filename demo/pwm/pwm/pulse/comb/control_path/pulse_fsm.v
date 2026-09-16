`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// pulse_fsm — the phase machine (Moore: PWM is the phase itself).
//   Reset or stopped, it holds the low phase with the counter cleared,
//   so the first running cycle already sees ZERO and starts a high phase.
//------------------------------------------------------------------
module pulse_fsm (
    input  wire RST,
    input  wire RUN,
    input  wire ZERO,
    input  wire PHASE,

    // @sch: meaning="the phase the next cycle is in; 1=high"
    output wire PHASE_D,
    // @sch: meaning="1=hold the counter at zero while stopped"
    output wire CNT_RST,
    // @sch: meaning="1=start a new phase from RELOAD"
    output wire CNT_LOAD,
    // @sch: meaning="1=one cycle of the current phase has passed"
    output wire CNT_DEC,
    // @sch: meaning="1=the phase being started is the high one"
    output wire LOAD_HIGH
);

    reg [4:0] FSM_OUT;
    assign {PHASE_D, CNT_RST, CNT_LOAD, CNT_DEC, LOAD_HIGH} = FSM_OUT;

    always @(*) begin
        casex ({RST, RUN, ZERO, PHASE})
            4'b1xxx: FSM_OUT = 5'b0_1_0_0_0;  // reset: low, counter cleared
            4'b00xx: FSM_OUT = 5'b0_1_0_0_0;  // stopped: the same standing still
            4'b0100: FSM_OUT = 5'b0_0_0_1_0;  // low phase, still counting
            4'b0101: FSM_OUT = 5'b1_0_0_1_0;  // high phase, still counting
            4'b0110: FSM_OUT = 5'b1_0_1_0_1;  // low phase ended: start the high one
            4'b0111: FSM_OUT = 5'b0_0_1_0_0;  // high phase ended: start the low one
            default: FSM_OUT = 5'b0_1_0_0_0;
        endcase
    end

endmodule
`default_nettype wire
