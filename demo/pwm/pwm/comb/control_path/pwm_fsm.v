`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// pwm_fsm — the core's machine (Moore).
//   IDLE waits for SET, LOAD captures PERIOD and DUTY for one cycle,
//   RUN drives the wave until STOP.
//------------------------------------------------------------------
module pwm_fsm (
    input  wire       RST,
    input  wire       SET,
    input  wire       STOP,
    input  wire [1:0] STATE,

    // @sch: meaning="the state the next cycle is in"
    output wire [1:0] STATE_D,
    // @sch: meaning="1=capture PERIOD and DUTY"
    output wire       LOAD_EN,
    // @sch: meaning="1=the pulse generator is running"
    output wire       RUN_EN,
    // @sch: meaning="1=the core is not driving a wave"
    output wire       STOPPED
);

    reg [4:0] FSM_OUT;
    assign {STATE_D, LOAD_EN, RUN_EN, STOPPED} = FSM_OUT;

    always @(*) begin
        casex ({RST, SET, STOP, STATE})
            5'b1xxxx: FSM_OUT = 5'b00_0_0_1;  // reset: idle
            5'b0xx01: FSM_OUT = 5'b10_1_0_0;  // LOAD: take PERIOD and DUTY, then run
            5'b0x110: FSM_OUT = 5'b00_0_0_1;  // RUN: STOP asked, back to idle
            5'b0xx10: FSM_OUT = 5'b10_0_1_0;  // RUN: keep driving
            5'b01x00: FSM_OUT = 5'b01_0_0_1;  // IDLE: SET asked, go and load
            5'b00x00: FSM_OUT = 5'b00_0_0_1;  // IDLE: nothing asked
            default:  FSM_OUT = 5'b00_0_0_1;
        endcase
    end

endmodule
`default_nettype wire
