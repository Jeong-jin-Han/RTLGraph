`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// pulse_top — the square wave itself: a phase machine that switches
//   between the high and the low half whenever the down counter
//   reaches zero. PWM is the phase, so DUTY cycles of every PERIOD
//   are high (with 1 <= DUTY < PERIOD).
//------------------------------------------------------------------
module pulse_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       RUN,
    input  wire [7:0] PERIOD,
    input  wire [7:0] DUTY,
    output wire       PWM
);

    wire [7:0] RELOAD;
    wire       ZERO;
    wire       PHASE_Q;
    wire       PHASE_D;
    wire       CNT_RST;
    wire       CNT_LOAD;
    wire       CNT_DEC;
    wire       LOAD_HIGH;

    // The counter of the phase currently running: a component of its own
    cnt_top u_cnt (
        .CLK      (CLK),
        .RST      (CNT_RST),
        .LOAD     (CNT_LOAD),
        .DEC      (CNT_DEC),
        .LOAD_VAL (RELOAD),
        .VAL      (),
        .ZERO     (ZERO)
    );

    // Data-path
    pulse_dp data_path (
        .PERIOD    (PERIOD),
        .DUTY      (DUTY),
        .LOAD_HIGH (LOAD_HIGH),
        .RELOAD    (RELOAD)
    );

    // Control-path: the machine
    pulse_fsm control_path (
        .RST       (RST),
        .RUN       (RUN),
        .ZERO      (ZERO),
        .PHASE     (PHASE_Q),
        .PHASE_D   (PHASE_D),
        .CNT_RST   (CNT_RST),
        .CNT_LOAD  (CNT_LOAD),
        .CNT_DEC   (CNT_DEC),
        .LOAD_HIGH (LOAD_HIGH)
    );

    // Registers (for FSM)
    DFF #(0) PHASE_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (1'b1),
        .D   (PHASE_D),
        .Q   (PHASE_Q)
    );

    assign PWM = PHASE_Q;

endmodule
`default_nettype wire
