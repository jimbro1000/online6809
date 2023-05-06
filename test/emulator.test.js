/**
 * @jest-environment jsdom
 */
import * as Emulator from "../src/emulator";
import * as Interface from "../src/interface";

jest.mock("../src/interface");

describe("6809 CPU", () => {

})

describe("assembler", () => {
    let cpu;
    beforeEach(() => {
        cpu = new Emulator.CPU();
    })
    describe("handling literals", () => {
        it.each([
            ["$FC,EOT", ["$FC", "EOT"]],
            ["$00,$AA,$55,$FF", ["$00", "$AA", "$55", "$FF"]],
        ])("splits literals on commas", (example, expected) => {
            const result = cpu.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
        it.each([
            ['"LEAX [,X++]",EOT', ['"LEAX [,X++]"', 'EOT']]
        ])("matches pairs of double quotes to enclose strings", (example, expected) => {
            const result = cpu.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
        it.each([
            ["'LEAX [,X++]',EOT", ["'LEAX [,X++]'", 'EOT']]
        ])("matches pairs of single quotes to enclose strings", (example, expected) => {
            const result = cpu.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
    })
})