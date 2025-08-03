import { useEffect, useCallback } from 'react';
import { useReactFlow, useStore, ReactFlowState } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './react_flow_types';

export interface KeyboardNavigationProps {
  onNodeNavigate?: (nodeId: string) => void;
}

export function useKeyboardNavigation(props?: KeyboardNavigationProps) {
  const { getNodes, getEdges, setNodes, fitView } = useReactFlow<CodeChartNode, CodeChartEdge>();
  const selectedNodeId = useStore((state: ReactFlowState) => 
    state.nodes.find(n => n.selected)?.id
  );

  const handleKeyNavigation = useCallback((event: KeyboardEvent) => {
    // Skip if user is typing in an input field
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const nodes = getNodes();
    const edges = getEdges();
    const selectedNode = nodes.find(n => n.selected);

    switch (event.key) {
      case 'Tab':
        // Let default tab behavior work for focus management
        break;

      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Navigate between connected nodes
        if (selectedNode) {
          event.preventDefault();
          
          let targetNodeId: string | undefined;
          
          if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            // Find parent nodes (incoming edges)
            const incomingEdge = edges.find(e => e.target === selectedNode.id);
            targetNodeId = incomingEdge?.source;
          } else {
            // Find child nodes (outgoing edges)
            const outgoingEdge = edges.find(e => e.source === selectedNode.id);
            targetNodeId = outgoingEdge?.target;
          }
          
          if (targetNodeId) {
            // Deselect all nodes
            setNodes(nodes.map(n => ({ ...n, selected: n.id === targetNodeId })));
            
            // Focus on the target node element
            const targetElement = document.querySelector(`[data-id="${targetNodeId}"]`);
            if (targetElement instanceof HTMLElement) {
              targetElement.focus();
            }
            
            // Notify parent component
            if (props?.onNodeNavigate) {
              props.onNodeNavigate(targetNodeId);
            }
          }
        }
        break;

      case 'f':
      case 'F':
        // Fit view to show all nodes
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          fitView({ padding: 0.2, duration: 500 });
        }
        break;

      case '/':
        // Focus search - handled by SearchPanel component
        // SearchPanel listens for the '/' key globally
        break;

      case 'Escape':
        // Deselect all nodes
        event.preventDefault();
        setNodes(nodes.map(n => ({ ...n, selected: false })));
        break;

      case '?':
        // Show keyboard shortcuts help
        if (event.shiftKey) {
          event.preventDefault();
          showKeyboardShortcuts();
        }
        break;
    }
  }, [getNodes, getEdges, setNodes, fitView, props]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyNavigation);
    return () => {
      window.removeEventListener('keydown', handleKeyNavigation);
    };
  }, [handleKeyNavigation]);

  return { selectedNodeId };
}

function showKeyboardShortcuts() {
  // This could be enhanced to show a modal or overlay
  alert(`Keyboard Shortcuts:
  
Navigation:
• Tab - Navigate through nodes
• Arrow Keys - Navigate to connected nodes
• Enter/Space - Activate node (open file)
• Escape - Deselect all nodes

View Control:
• Ctrl/Cmd + F - Fit all nodes in view
• Mouse Wheel - Zoom in/out

Other:
• / - Focus search (when implemented)
• Shift + ? - Show this help`);
}

// Skip link component for accessibility
export function SkipToGraph() {
  const handleSkip = () => {
    const graphElement = document.querySelector('.react-flow');
    if (graphElement instanceof HTMLElement) {
      graphElement.focus();
    }
  };

  return (
    <a
      href="#code-flow-graph"
      onClick={(e) => {
        e.preventDefault();
        handleSkip();
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
        e.currentTarget.style.backgroundColor = '#fff';
        e.currentTarget.style.border = '2px solid #000';
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