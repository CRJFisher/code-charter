import { symbolRepoLocalName, symbolDisplayName } from '../symbols';
import { expect, test, describe } from 'vitest';


describe('symbolRepoLocalName', () => {
    test('should return the local name of a class method symbol', () => {
        const symbol = "scip-python python aider 1.0.0 `aider.linter`/Linter#__init__().";
        const expected = "aider.linter.Linter#__init__()";
        const result = symbolRepoLocalName(symbol);
        expect(result).toBe(expected);
    });

    test('should return the local name of a function symbol', () => {
        const symbol = "scip-python python aider 1.0.0 `aider.linter`/traverse_tree().";
        const expected = "aider.linter.traverse_tree()";
        const result = symbolRepoLocalName(symbol);
        expect(result).toBe(expected);
    });

    test('should return an empty string if symbol is empty', () => {
        const symbol = '';
        const expected = '';
        const result = symbolRepoLocalName(symbol);
        expect(result).toBe(expected);
    });
});

describe('symbolDisplayName', () => {
    test('should return the display name of a class method symbol', () => {
        const symbol = "scip-python python aider 1.0.0 `aider.linter`/Linter#__init__().";
        const expected = "Linter.__init__()";
        const result = symbolDisplayName(symbol);
        expect(result).toBe(expected);
    });

    test('should return the display name of a function symbol', () => {
        const symbol = "scip-python python aider 1.0.0 `aider.linter`/traverse_tree().";
        const expected = "traverse_tree()";
        const result = symbolDisplayName(symbol);
        expect(result).toBe(expected);
    });

    test('should return an empty string if symbol is empty', () => {
        const symbol = '';
        const expected = '';
        const result = symbolDisplayName(symbol);
        expect(result).toBe(expected);
    });
});