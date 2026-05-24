import { useEffect, useCallback } from 'react';
import { useReactFlow, useStore, ReactFlowState } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './chart_types';
import { error_notification_manager } from './error_handling';
import { use_flow_theme_styles } from './use_chart_theme_styles';

export interface KeyboardNavigationProps {
  on_node_navigate?: (node_id: string) => void;
}

export function use_keyboard_navigation(props?: KeyboardNavigationProps) {
  const { getNodes: get_nodes, getEdges: get_edges, setNodes: set_nodes, fitView: fit_view } = useReactFlow<CodeChartNode, CodeChartEdge>();
  const selected_node_id = useStore((state: ReactFlowState) => 
    state.nodes.find(n => n.selected)?.id
  );

  const handle_key_navigation = useCallback((event: KeyboardEvent) => {
    // Skip if user is typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const nodes = get_nodes();
    const edges = get_edges();
    const selected_node = nodes.find(n => n.selected);

    switch (event.key) {
      case 'Tab':
        // Let default tab behavior work for focus management
        break;

      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Navigate between connected nodes
        if (selected_node) {
          event.preventDefault();
          
          let target_node_id: string | undefined;
          
          if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            // Find parent nodes (incoming edges)
            const incoming_edge = edges.find(e => e.target === selected_node.id);
            target_node_id = incoming_edge?.source;
          } else {
            // Find child nodes (outgoing edges)
            const outgoing_edge = edges.find(e => e.source === selected_node.id);
            target_node_id = outgoing_edge?.target;
          }
          
          if (target_node_id) {
            // Deselect all nodes and select target
            set_nodes((current_nodes) => current_nodes.map(n => ({ ...n, selected: n.id === target_node_id })));
            
            // Focus on the target node element
            const target_element = document.querySelector(`[data-id="${target_node_id}"]`);
            if (target_element instanceof HTMLElement) {
              target_element.focus();
            }
            
            // Notify parent component
            if (props?.on_node_navigate) {
              props.on_node_navigate(target_node_id);
            }
          }
        }
        break;

      case 'f':
      case 'F':
        // Fit view to show all nodes
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          fit_view({ padding: 0.2, duration: 500 });
        }
        break;

      case '/':
        // Focus search - handled by SearchPanel component
        // SearchPanel listens for the '/' key globally
        break;

      case 'Escape':
        // Deselect all nodes
        event.preventDefault();
        set_nodes((current_nodes) => current_nodes.map(n => ({ ...n, selected: false })));
        break;

      case '?':
        // Show keyboard shortcuts help
        if (event.shiftKey) {
          event.preventDefault();
          show_keyboard_shortcuts();
        }
        break;
    }
  }, [get_nodes, get_edges, set_nodes, fit_view, props]);

  useEffect(() => {
    window.addEventListener('keydown', handle_key_navigation);
    return () => {
      window.removeEventListener('keydown', handle_key_navigation);
    };
  }, [handle_key_navigation]);

  return { selected_node_id };
}

function show_keyboard_shortcuts() {
  error_notification_manager.notify(
    "Keyboard shortcuts: Tab (navigate nodes), Arrow keys (connected nodes), Enter/Space (open file), Escape (deselect), Ctrl+F (fit view), / (search), Shift+? (help)",
    "info"
  );
}

// Skip link component for accessibility
export function SkipToGraph() {
  const theme_styles = use_flow_theme_styles();

  const handle_skip = () => {
    const graph_element = document.querySelector('.react-flow');
    if (graph_element instanceof HTMLElement) {
      graph_element.focus();
    }
  };

  return (
    <a
      href="#code-flow-graph"
      onClick={(e) => {
        e.preventDefault();
        handle_skip();
      }}
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
      onFocus={(e) => {
        e.currentTarget.style.left = '10px';
        e.currentTarget.style.top = '10px';
        e.currentTarget.style.width = 'auto';
        e.currentTarget.style.height = 'auto';
        e.currentTarget.style.padding = '8px';
        e.currentTarget.style.backgroundColor = theme_styles.colors.ui.background.panel;
        e.currentTarget.style.border = `2px solid ${theme_styles.colors.ui.border}`;
        e.currentTarget.style.color = theme_styles.colors.ui.text.primary;
        e.currentTarget.style.zIndex = '9999';
      }}
      onBlur={(e) => {
        e.currentTarget.style.left = '-9999px';
        e.currentTarget.style.width = '1px';
        e.currentTarget.style.height = '1px';
      }}
    >
      Skip to code flow diagram
    </a>
  );
}