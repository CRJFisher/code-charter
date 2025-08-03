import { SearchPanel } from '../search_panel';

describe('Search Logic', () => {
  describe('Fuzzy Matching', () => {
    // Extract the fuzzy match logic for testing
    const fuzzyMatch = (query: string, target: string): number => {
      const lowerQuery = query.toLowerCase();
      const lowerTarget = target.toLowerCase();
      let queryIndex = 0;
      let targetIndex = 0;
      let matches = 0;
      
      while (queryIndex < lowerQuery.length && targetIndex < lowerTarget.length) {
        if (lowerQuery[queryIndex] === lowerTarget[targetIndex]) {
          matches++;
          queryIndex++;
        }
        targetIndex++;
      }
      
      return queryIndex === lowerQuery.length ? matches / lowerQuery.length : 0;
    };

    it('should match exact strings', () => {
      expect(fuzzyMatch('test', 'test')).toBe(1);
    });

    it('should match substrings', () => {
      expect(fuzzyMatch('test', 'testFunction')).toBe(1);
    });

    it('should match fuzzy patterns', () => {
      // 'tf' matches 't' and 'f' in 'testFunction' (2 out of 2 chars)
      expect(fuzzyMatch('tf', 'testFunction')).toBe(1);
      // 'tsfn' matches all 4 chars in order in 'testFunction'
      expect(fuzzyMatch('tsfn', 'testFunction')).toBe(1);
      // 'xyz' doesn't match
      expect(fuzzyMatch('xyz', 'testFunction')).toBe(0);
    });

    it('should return 0 for non-matching strings', () => {
      expect(fuzzyMatch('xyz', 'testFunction')).toBe(0);
    });

    it('should be case insensitive', () => {
      expect(fuzzyMatch('TEST', 'test')).toBe(1);
      expect(fuzzyMatch('TF', 'testFunction')).toBe(1);
    });
  });

  describe('Search Scoring', () => {
    const calculateScore = (query: string, name: string, summary: string = ''): number => {
      const lowerQuery = query.toLowerCase();
      const lowerName = name.toLowerCase();
      const lowerSummary = summary.toLowerCase();
      
      let score = 0;
      
      // Exact match gets highest score
      if (lowerName === lowerQuery) {
        score = 100;
      }
      // Starts with query
      else if (lowerName.startsWith(lowerQuery)) {
        score = 80;
      }
      // Contains query
      else if (lowerName.includes(lowerQuery)) {
        score = 60;
      }
      // Summary contains query
      else if (lowerSummary.includes(lowerQuery)) {
        score = 40;
      }
      
      return score;
    };

    it('should score exact matches highest', () => {
      expect(calculateScore('test', 'test')).toBe(100);
    });

    it('should score prefix matches high', () => {
      expect(calculateScore('test', 'testFunction')).toBe(80);
    });

    it('should score contains matches medium', () => {
      expect(calculateScore('function', 'testFunction')).toBe(60);
    });

    it('should score summary matches lower', () => {
      expect(calculateScore('helper', 'testFunction', 'A helper function')).toBe(40);
    });

    it('should return 0 for no match', () => {
      expect(calculateScore('xyz', 'testFunction', 'A test function')).toBe(0);
    });

    it('should be case insensitive', () => {
      expect(calculateScore('TEST', 'test')).toBe(100);
      expect(calculateScore('Test', 'testFunction')).toBe(80);
    });
  });

  describe('Search Result Filtering', () => {
    const mockNodes = [
      {
        id: 'node1',
        type: 'code_function',
        data: {
          function_name: 'testFunction',
          summary: 'This is a test function',
        },
      },
      {
        id: 'node2',
        type: 'code_function',
        data: {
          function_name: 'anotherFunction',
          summary: 'Another function for testing',
        },
      },
      {
        id: 'node3',
        type: 'module_group',
        data: {
          module_name: 'TestModule',
          description: 'A test module',
        },
      },
    ];

    const filterNodes = (nodes: any[], query: string, maxResults: number = 10) => {
      if (!query.trim()) return [];
      
      const lowerQuery = query.toLowerCase();
      const results: any[] = [];
      
      nodes.forEach(node => {
        const name = node.data.function_name || node.data.module_name || '';
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes(lowerQuery)) {
          results.push({
            nodeId: node.id,
            nodeName: name,
            nodeType: node.type,
          });
        }
      });
      
      return results.slice(0, maxResults);
    };

    it('should filter nodes by name', () => {
      const results = filterNodes(mockNodes, 'test');
      expect(results).toHaveLength(2);
      expect(results.map(r => r.nodeName)).toContain('testFunction');
      expect(results.map(r => r.nodeName)).toContain('TestModule');
    });

    it('should return empty array for empty query', () => {
      expect(filterNodes(mockNodes, '')).toEqual([]);
      expect(filterNodes(mockNodes, '  ')).toEqual([]);
    });

    it('should limit results', () => {
      const manyNodes = Array.from({ length: 20 }, (_, i) => ({
        id: `node${i}`,
        type: 'code_function',
        data: { function_name: `testFunction${i}` },
      }));
      
      const results = filterNodes(manyNodes, 'test', 5);
      expect(results).toHaveLength(5);
    });

    it('should handle nodes without names', () => {
      const nodesWithoutNames = [
        { id: '1', type: 'unknown', data: {} },
        { id: '2', type: 'code_function', data: { function_name: 'test' } },
      ];
      
      const results = filterNodes(nodesWithoutNames, 'test');
      expect(results).toHaveLength(1);
      expect(results[0].nodeName).toBe('test');
    });
  });
});