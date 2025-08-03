import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useReactFlow, useStore, ReactFlowState } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './react_flow_types';
import { symbolDisplayName } from './symbol_utils';

export interface SearchResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  summary?: string;
  filePath?: string;
  score: number;
}

export interface SearchPanelProps {
  onNodeSelect?: (nodeId: string) => void;
  maxResults?: number;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ 
  onNodeSelect, 
  maxResults = 10 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getNodes, setCenter, setNodes } = useReactFlow<CodeChartNode, CodeChartEdge>();
  const nodes = useStore((state: ReactFlowState) => state.nodes as CodeChartNode[]);
  
  // Search algorithm with fuzzy matching
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];
    
    nodes.forEach(node => {
      if (!node.data) return;
      
      const nodeName = node.data.function_name || node.data.module_name || '';
      const lowerName = nodeName.toLowerCase();
      const summary = node.data.summary || node.data.description || '';
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
      // Fuzzy match
      else {
        const fuzzyScore = fuzzyMatch(lowerQuery, lowerName);
        if (fuzzyScore > 0) {
          score = fuzzyScore * 30;
        }
      }
      
      if (score > 0) {
        results.push({
          nodeId: node.id,
          nodeName,
          nodeType: node.type || 'unknown',
          summary: summary.substring(0, 100),
          filePath: node.data.file_path,
          score,
        });
      }
    });
    
    // Sort by score and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }, [query, nodes, maxResults]);
  
  // Fuzzy matching algorithm
  const fuzzyMatch = (query: string, target: string): number => {
    let queryIndex = 0;
    let targetIndex = 0;
    let matches = 0;
    
    while (queryIndex < query.length && targetIndex < target.length) {
      if (query[queryIndex] === target[targetIndex]) {
        matches++;
        queryIndex++;
      }
      targetIndex++;
    }
    
    return queryIndex === query.length ? matches / query.length : 0;
  };
  
  // Handle node selection
  const selectNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Deselect all nodes and select the found one
    setNodes(nodes.map(n => ({
      ...n,
      selected: n.id === nodeId,
    })));
    
    // Center the view on the selected node
    setCenter(node.position.x, node.position.y, {
      zoom: 1,
      duration: 500,
    });
    
    // Close search panel
    setIsOpen(false);
    setQuery('');
    
    // Notify parent component
    if (onNodeSelect) {
      onNodeSelect(nodeId);
    }
  }, [nodes, setNodes, setCenter, onNodeSelect]);
  
  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          selectNode(searchResults[selectedIndex].nodeId);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
        break;
    }
  }, [searchResults, selectedIndex, selectNode]);
  
  // Global keyboard shortcut for search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check for '/' key to open search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't open if user is typing in an input
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsOpen(true);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  
  // Reset selected index when results change
  useEffect(() => {
    if (searchResults.length > 0) {
      setSelectedIndex(0);
    }
  }, [searchResults.length]);
  
  return (
    <>
      {/* Search Button */}
      <button
        onClick={() => {
          setIsOpen(true);
          // Use requestAnimationFrame for more reliable focus
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        }}
        style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ddd',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 5,
        }}
        aria-label="Search nodes (press / to open)"
      >
        🔍 Search nodes
        <kbd style={{
          fontSize: '11px',
          padding: '2px 4px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ccc',
          borderRadius: '2px',
        }}>/</kbd>
      </button>
      
      {/* Search Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '400px',
            maxHeight: '500px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search Input */}
          <div style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search functions, modules..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                outline: 'none',
              }}
              aria-label="Search input"
              aria-describedby="search-results"
              role="searchbox"
              aria-controls="search-results-list"
            />
          </div>
          
          {/* Search Results */}
          <div
            id="search-results"
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '400px',
            }}
          >
            {query && searchResults.length === 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
              }}>
                No results found for "{query}"
              </div>
            )}
            
            <ul
              id="search-results-list"
              role="listbox"
              aria-label="Search results"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
              }}
            >
              {searchResults.map((result, index) => (
                <li
                  key={result.nodeId}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => selectNode(result.nodeId)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    backgroundColor: index === selectedIndex ? '#f5f5f5' : 'white',
                    borderBottom: '1px solid #eee',
                    transition: 'background-color 0.1s',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 'bold',
                        fontSize: '14px',
                        marginBottom: '4px',
                      }}>
                        {highlightMatch(result.nodeName, query)}
                      </div>
                      {result.summary && (
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          marginBottom: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {result.summary}
                        </div>
                      )}
                      {result.filePath && (
                        <div style={{
                          fontSize: '11px',
                          color: '#999',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {result.filePath}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#999',
                      marginLeft: '8px',
                    }}>
                      {result.nodeType === 'module_group' ? '📦' : '🔧'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Footer */}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid #eee',
            fontSize: '11px',
            color: '#666',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>↑↓ Navigate • Enter Select • Esc Close</span>
            <span>{searchResults.length} results</span>
          </div>
        </div>
      )}
    </>
  );
};

// Helper function to highlight matching text
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  
  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, index) => 
    regex.test(part) ? (
      <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px' }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}