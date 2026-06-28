import type { NodeTypes } from '@xyflow/react';
import {
  ZoomAwareNode,
  ModuleGroupNode,
  register_node_kind,
  resolve_node_type,
  build_node_types,
} from './chart_node_types';

const noop_component: NodeTypes[string] = () => null;

describe('node-kind registry', () => {
  it('resolves the built-in code kind to its React Flow type', () => {
    expect(resolve_node_type('code.function')).toBe('code_function');
  });

  it('resolves the built-in group kind to its React Flow type', () => {
    expect(resolve_node_type('agentic.group')).toBe('module_group');
  });

  it('returns undefined for an unregistered kind', () => {
    expect(resolve_node_type('does.not.exist')).toBeUndefined();
  });

  it('maps each built-in React Flow type to its component', () => {
    const node_types = build_node_types();
    expect(node_types.code_function).toBe(ZoomAwareNode);
    expect(node_types.module_group).toBe(ModuleGroupNode);
  });

  it('surfaces a newly registered kind through resolve and build', () => {
    register_node_kind('doc.note', { type: 'doc_note', component: noop_component });

    expect(resolve_node_type('doc.note')).toBe('doc_note');
    expect(build_node_types().doc_note).toBe(noop_component);
  });

  it('replaces the entry when a kind is registered twice', () => {
    register_node_kind('shape.flow', { type: 'shape_a', component: noop_component });
    register_node_kind('shape.flow', { type: 'shape_b', component: noop_component });

    expect(resolve_node_type('shape.flow')).toBe('shape_b');
    expect(build_node_types().shape_a).toBeUndefined();
    expect(build_node_types().shape_b).toBe(noop_component);
  });
});
