import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './chart_types';

interface SearchResult {
  node_id: string;
  node_name: string;
  nodeType: string;
  description?: string;
  filePath?: string;
  score: number;
}

interface SearchPanelProps {
  on_node_select?: (node_id: string) => void;
  max_results?: number;
}

function fuzzy_match(query: string, target: string): number {
  let query_index = 0;
  let target_index = 0;
  let matches = 0;

  while (query_index < query.length && target_index < target.length) {
    if (query[query_index] === target[target_index]) {
      matches++;
      query_index++;
    }
    target_index++;
  }

  return query_index === query.length ? matches / query.length : 0;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  on_node_select,
  max_results = 10
}) => {
  const [is_open, set_is_open] = useState(false);
  const [query, set_query] = useState('');
  const [selected_index, set_selected_index] = useState(0);
  const input_ref = useRef<HTMLInputElement>(null);
  const { setCenter: set_center, setNodes: set_nodes, getNodes: get_nodes, getNode: get_node } = useReactFlow<CodeChartNode, CodeChartEdge>();

  const search_results = useMemo(() => {
    if (!query.trim()) return [];

    const lower_query = query.toLowerCase();
    const results: SearchResult[] = [];
    const nodes = get_nodes();

    nodes.forEach(node => {
      if (!node.data) return;
      const node_data = node.data as Record<string, unknown>;

      const node_name = String(node_data.function_name || node_data.module_name || '');
      const lower_name = node_name.toLowerCase();
      const description = String(node_data.description || '');
      const lower_description = description.toLowerCase();

      let score = 0;

      if (lower_name === lower_query) {
        score = 100;
      } else if (lower_name.startsWith(lower_query)) {
        score = 80;
      } else if (lower_name.includes(lower_query)) {
        score = 60;
      } else if (lower_description.includes(lower_query)) {
        score = 40;
      } else {
        const fuzzy_score = fuzzy_match(lower_query, lower_name);
        if (fuzzy_score > 0) {
          score = fuzzy_score * 30;
        }
      }

      if (score > 0) {
        results.push({
          node_id: node.id,
          node_name,
          nodeType: node.type || 'unknown',
          description: description.substring(0, 100),
          filePath: node_data.file_path as string | undefined,
          score,
        });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, max_results);
  // get_nodes is a stable ref from useReactFlow; nodes are read imperatively
  // so that search only recomputes on query/max_results changes, not on drag/selection
  }, [query, max_results, get_nodes]);

  const select_node = useCallback((node_id: string) => {
    const node = get_node(node_id);
    if (!node) return;

    set_nodes((current_nodes) => current_nodes.map(n => ({
      ...n,
      selected: n.id === node_id,
    })));

    set_center(node.position.x, node.position.y, {
      zoom: 1,
      duration: 500,
    });

    set_is_open(false);
    set_query('');

    if (on_node_select) {
      on_node_select(node_id);
    }
  }, [get_node, set_nodes, set_center, on_node_select]);

  const handle_key_down = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        set_selected_index(prev =>
          prev < search_results.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        set_selected_index(prev => prev > 0 ? prev - 1 : prev);
        break;

      case 'Enter':
        e.preventDefault();
        if (search_results[selected_index]) {
          select_node(search_results[selected_index].node_id);
        }
        break;

      case 'Escape':
        e.preventDefault();
        set_is_open(false);
        set_query('');
        break;
    }
  }, [search_results, selected_index, select_node]);

  useEffect(() => {
    const handle_global_key_down = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        // Don't hijack '/' while the user is typing into a field
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          set_is_open(true);
          requestAnimationFrame(() => {
            input_ref.current?.focus();
          });
        }
      }
    };

    window.addEventListener('keydown', handle_global_key_down);
    return () => window.removeEventListener('keydown', handle_global_key_down);
  }, []);

  useEffect(() => {
    if (search_results.length > 0) {
      set_selected_index(0);
    }
  }, [search_results.length]);

  return (
    <>
      <button
        onClick={() => {
          set_is_open(true);
          // Focus after the panel paints; the input is not yet mounted this tick
          requestAnimationFrame(() => {
            input_ref.current?.focus();
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

      {is_open && (
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
          <div style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
            <input
              ref={input_ref}
              type="text"
              value={query}
              onChange={(e) => set_query(e.target.value)}
              onKeyDown={handle_key_down}
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

          <div
            id="search-results"
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '400px',
            }}
          >
            {query && search_results.length === 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
              }}>
                No results found for &ldquo;{query}&rdquo;
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
              {search_results.map((result, index) => (
                <li
                  key={result.node_id}
                  role="option"
                  aria-selected={index === selected_index}
                  onClick={() => select_node(result.node_id)}
                  onMouseEnter={() => set_selected_index(index)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    backgroundColor: index === selected_index ? '#f5f5f5' : 'white',
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
                        {highlight_match(result.node_name, query)}
                      </div>
                      {result.description && (
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          marginBottom: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {result.description}
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

          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid #eee',
            fontSize: '11px',
            color: '#666',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>↑↓ Navigate • Enter Select • Esc Close</span>
            <span>{search_results.length} results</span>
          </div>
        </div>
      )}
    </>
  );
};

function escape_regex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight_match(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const regex = new RegExp(`(${escape_regex(query)})`, 'gi');
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
