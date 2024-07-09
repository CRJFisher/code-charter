import { Digraph } from 'ts-graphviz';
import { generateDOT } from './d3GraphViz';
import { describe, it } from 'node:test';

describe('generateDOT', () => {
    it('should generate a Digraph object', () => {
        // Arrange
        const topLevelFunctionSymbol = 'myFunction';
        const graph = {
            definitionNodes: {
                myFunction: {
                    symbol: 'myFunction',
                    children: [],
                    document: 'myDocument.ts',
                },
            },
        };
        const summaries = new Map<string, string>();

        // Act
        // const result = generateDOT(topLevelFunctionSymbol, graph, summaries);

        // Assert
        // expect(result).toBeInstanceOf(Digraph);
    });

    it('should throw an error if summary is not found', () => {
        // Arrange
        const topLevelFunctionSymbol = 'myFunction';
        const graph = {
            definitionNodes: {
                myFunction: {
                    symbol: 'myFunction',
                    children: [],
                    document: 'myDocument.ts',
                },
            },
        };
        const summaries = new Map<string, string>();

        // Act & Assert
        // expect(() => generateDOT(topLevelFunctionSymbol, graph, summaries)).toThrowError('Summary not found for myFunction');
    });

    // Add more test cases as needed
});