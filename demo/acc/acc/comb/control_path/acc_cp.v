`timescale 1ns / 1ps
module acc_cp (

    // Input controls
    input wire RST,
    input wire SHOW,
    input wire MODE,

    // Reset controls
    output wire CNT_RST,
    output wire ACC_RST,
    output wire OUT_RST,

    // Enable
    output wire OUT_EN,

    // Selection
    output wire ACC_SEL
);

// wires
reg [4:0] CONTROL_OUT;
assign {CNT_RST, ACC_RST, OUT_RST, OUT_EN, ACC_SEL} = CONTROL_OUT;

always @ *
begin
    casex({RST, SHOW, MODE})
        {1'b1, 1'bx, 1'bx}: CONTROL_OUT <= {1'b1, 1'b1, 1'b1, 1'bx, 1'bx};
        {1'b0, 1'b0, 1'b0}: CONTROL_OUT <= {1'b0, 1'b0, 1'b0, 1'b0, 1'b0};
        {1'b0, 1'b0, 1'b1}: CONTROL_OUT <= {1'b0, 1'b0, 1'b0, 1'b0, 1'b1};
        {1'b0, 1'b1, 1'b0}: CONTROL_OUT <= {1'b0, 1'b0, 1'b0, 1'b1, 1'b0};
        {1'b0, 1'b1, 1'b1}: CONTROL_OUT <= {1'b0, 1'b0, 1'b0, 1'b1, 1'b1};
        default:            CONTROL_OUT <= {1'b1, 1'b1, 1'b1, 1'bx, 1'bx};
    endcase
end

endmodule
