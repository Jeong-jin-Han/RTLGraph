`timescale 1ns / 1ps
`default_nettype none
// host_cp — reset wins; START advances the counter and marks DATA valid
module host_cp (
    input  wire RST,
    input  wire START,

    // @sch: meaning="1=clear the sample counter"
    output wire CNT_RST,
    // @sch: meaning="1=advance to the next sample"
    output wire CNT_EN,
    // @sch: meaning="1=DATA holds a sample for the device"
    output wire VALID
);

    reg [2:0] CONTROL_OUT;
    assign {CNT_RST, CNT_EN, VALID} = CONTROL_OUT;

    always @(*) begin
        casex ({RST, START})
            2'b1x:   CONTROL_OUT = 3'b100;
            2'b00:   CONTROL_OUT = 3'b000;
            2'b01:   CONTROL_OUT = 3'b011;
            default: CONTROL_OUT = 3'b100;
        endcase
    end

endmodule
`default_nettype wire
