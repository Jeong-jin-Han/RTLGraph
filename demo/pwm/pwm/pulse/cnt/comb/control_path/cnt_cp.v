`timescale 1ns / 1ps
`default_nettype none
// cnt_cp — the counter moves when it is told to load or to count down,
//   and takes the reload value only while loading
module cnt_cp (
    input  wire LOAD,
    input  wire DEC,

    // @sch: meaning="1=the counter register takes a new value"
    output wire CNT_EN,
    // @sch: meaning="1=take LOAD_VAL, 0=take the value one below"
    output wire CNT_SEL
);

    reg [1:0] CONTROL_OUT;
    assign {CNT_EN, CNT_SEL} = CONTROL_OUT;

    always @(*) begin
        casex ({LOAD, DEC})
            2'b1x:   CONTROL_OUT = 2'b11;
            2'b01:   CONTROL_OUT = 2'b10;
            2'b00:   CONTROL_OUT = 2'b00;
            default: CONTROL_OUT = 2'b00;
        endcase
    end

endmodule
`default_nettype wire
