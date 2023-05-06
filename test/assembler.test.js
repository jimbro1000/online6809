/**
 * @jest-environment jsdom
 */
import {Assembler} from '../src/assembler';
import * as helper from '../src/helper';

describe("assembler", () => {
    let asm;
    beforeEach(() => {
        jest.spyOn(helper,"trc").mockImplementation(() => {});
        asm = new Assembler();
    })
    describe("handling literals", () => {
        it.each([
            ["$FC,EOT", ["$FC", "EOT"]],
            ["$00,$AA,$55,$FF", ["$00", "$AA", "$55", "$FF"]],
        ])("splits literals on commas", (example, expected) => {
            const result = asm.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
        it.each([
            ['"LEAX [,X++]",EOT', ['"LEAX [,X++]"', 'EOT']]
        ])("matches pairs of double quotes to enclose strings", (example, expected) => {
            const result = asm.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
        it.each([
            ["'LEAX [,X++]',EOT", ["'LEAX [,X++]'", 'EOT']]
        ])("matches pairs of single quotes to enclose strings", (example, expected) => {
            const result = asm.splitByComma(example);
            expect(result.length).toBe(expected.length);
            for (let i = 0; i < expected.length; ++i) {
                expect(result[i]).toBe(expected[i]);
            }
        })
    })
})