import React, { useState } from "react";
import { use_backend } from "../hooks/use_backend";
import type { FlowSummary } from "@code-charter/types";

/**
 * How many flows the selector shows before the "more" affordance reveals the rest. The list is a flat
 * capped list; richer secondary navigability (grouping, naming, ranking) is D-FLOW-LIST-LEGIBILITY (open).
 */
const FLOW_LIST_CAP = 12;

interface SidebarProps {
  flows: FlowSummary[];
  selected_flow_id: string | null;
  on_select: (flow_id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ flows, selected_flow_id, on_select }) => {
  const [is_sidebar_open, set_is_sidebar_open] = useState(true);

  const toggle_sidebar = () => {
    set_is_sidebar_open(!is_sidebar_open);
  };

  return (
    <div
      className={`flex h-screen transition-all duration-300 ${
        is_sidebar_open ? "w-1/4" : "w-12"
      } bg-vscodeGutter border-r border-vscodeBorder`}
    >
      <div className="relative h-full flex flex-col w-full">
        <div className="flex items-center p-2 bg-vscodeBg">
          <div className="flex-grow">
            <button onClick={toggle_sidebar} className="p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none">
              {is_sidebar_open ? '◀' : '☰'}
            </button>
          </div>
          {is_sidebar_open && (
            <button
              onClick={toggle_sidebar}
              className="ml-auto p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none"
            >
              ⚙️
            </button>
          )}
        </div>
        <aside
          className={`flex-1 overflow-y-auto ${
            is_sidebar_open ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        >
          <FlowList flows={flows} selected_flow_id={selected_flow_id} on_select={on_select} />
        </aside>
      </div>
    </div>
  );
};

interface FlowListProps {
  flows: FlowSummary[];
  selected_flow_id: string | null;
  on_select: (flow_id: string) => void;
}

const FlowList: React.FC<FlowListProps> = ({ flows, selected_flow_id, on_select }) => {
  const { backend } = use_backend();
  const [show_all, set_show_all] = useState(false);

  // The list arrives already ordered (hydrated flows first by recency, then the size-ranked skeleton);
  // render in that order without re-sorting.
  const visible = show_all ? flows : flows.slice(0, FLOW_LIST_CAP);
  const hidden_count = flows.length - visible.length;

  const on_click_item = async (flow: FlowSummary) => {
    on_select(flow.id);
    if (flow.seed_location) {
      await backend.navigate_to_doc(flow.seed_location.file_path, flow.seed_location.line_number);
    }
  };

  return (
    <ul className="w-full">
      {visible.map((flow) => {
        const is_selected = flow.id === selected_flow_id;
        return (
          <li
            key={flow.id}
            className={`p-4 cursor-pointer bg-vscodeBg shadow-sm hover:bg-vscodeSelection ${
              is_selected ? "bg-vscodeSelection text-vscodeFg border border-vscodeBorder" : ""
            }`}
            onClick={() => on_click_item(flow)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate" title={flow.label}>{flow.label}</span>
              {flow.is_hydrated && (
                <span
                  className="text-xs px-1 rounded bg-vscodeFg text-vscodeBg"
                  title="This flow has an agentic diagram"
                >
                  ●
                </span>
              )}
            </div>
            <div className="flex items-center text-xs text-vscodeLineNumber h-5">
              <span className="ellipsis-end">
                {flow.is_unattributed ? "unattributed code" : `${flow.member_count} functions`}
              </span>
            </div>
          </li>
        );
      })}
      {hidden_count > 0 && (
        <li
          className="p-3 text-center text-xs text-vscodeLineNumber cursor-pointer hover:bg-vscodeSelection"
          onClick={() => set_show_all(true)}
        >
          Show {hidden_count} more
        </li>
      )}
    </ul>
  );
};

export default Sidebar;
