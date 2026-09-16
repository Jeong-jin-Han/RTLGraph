`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// pwm_top — the PWM core of D02-2. SET captures PERIOD and DUTY and
//   starts the wave, STOP ends it. RDY is active-low while the core
//   is activated.
//------------------------------------------------------------------
module pwm_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire [7:0] PERIOD,
    input  wire [7:0] DUTY,
    input  wire       SET,
    input  wire       STOP,
    output wire       PWM,
    output wire       RDY
);

    wire [1:0] STATE_Q;
    wire [1:0] STATE_D;
    wire       LOAD_EN;
    wire       RUN_EN;
    wire       STOPPED;

    wire [7:0] PERIOD_Q;
    wire [7:0] DUTY_Q;

    // Control-path: the machine
    pwm_fsm control_path (
        .RST     (RST),
        .SET     (SET),
        .STOP    (STOP),
        .STATE   (STATE_Q),
        .STATE_D (STATE_D),
        .LOAD_EN (LOAD_EN),
        .RUN_EN  (RUN_EN),
        .STOPPED (STOPPED)
    );

    // The wave generator: a component of its own
    pulse_top u_pulse (
        .CLK    (CLK),
        .RST    (RST),
        .RUN    (RUN_EN),
        .PERIOD (PERIOD_Q),
        .DUTY   (DUTY_Q),
        .PWM    (PWM)
    );

    // The handshake: a component of its own
    rdy_top u_rdy (
        .CLK     (CLK),
        .RST     (RST),
        .SET     (SET),
        .STOPPED (STOPPED),
        .RDY     (RDY)
    );

    // Registers (for FSM)
    DFF #(1) STATE_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (1'b1),
        .D   (STATE_D),
        .Q   (STATE_Q)
    );

    // Registers
    DFF #(7) PERIOD_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (LOAD_EN),
        .D   (PERIOD),
        .Q   (PERIOD_Q)
    );

    DFF #(7) DUTY_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (LOAD_EN),
        .D   (DUTY),
        .Q   (DUTY_Q)
    );

endmodule
`default_nettype wire
