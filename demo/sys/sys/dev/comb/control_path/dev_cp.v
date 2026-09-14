`timescale 1ns / 1ps
`default_nettype none
// dev_cp — reset clears buffer and sum; VALID loads the buffer and updates the sum
module dev_cp (
    input  wire RST,
    input  wire VALID,

    // @sch: meaning="1=clear the input buffer"
    output wire BUF_RST,
    // @sch: meaning="1=capture DATA into the input buffer"
    output wire BUF_EN,
    // @sch: meaning="1=clear the running sum"
    output wire SUM_RST,
    // @sch: meaning="1=add the buffered sample to the sum"
    output wire SUM_EN
);

    reg [3:0] CONTROL_OUT;
    assign {BUF_RST, BUF_EN, SUM_RST, SUM_EN} = CONTROL_OUT;

    always @(*) begin
        casex ({RST, VALID})
            2'b1x:   CONTROL_OUT = 4'b1010;
            2'b00:   CONTROL_OUT = 4'b0000;
            2'b01:   CONTROL_OUT = 4'b0101;
            default: CONTROL_OUT = 4'b1010;
        endcase
    end

endmodule
`default_nettype wire
