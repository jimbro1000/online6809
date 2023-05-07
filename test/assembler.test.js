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
    describe('find mnemonic', () => {
        it('identifies an operation on a single byte code', () => {
            const operation = asm.opFind(206, 0);
            expect(operation).not.toBeNull();
            expect(operation.op).toBe(206);
            expect(operation.mnem).toBe('LDU');
        })
        it.each([
            [206, 16, 'LDS'],
            [206, '0x10', 'LDS'],
        ])('identifies an operation on a double byte code', (code, page, op) => {
            const operation = asm.opFind(code, page);
            expect(operation).not.toBeNull();
            expect(operation.op).toBe(code);
            expect(operation.mnem).toBe(op);
        })
    })
})