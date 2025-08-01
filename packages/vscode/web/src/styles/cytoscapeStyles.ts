import {
    bgColor,
    editorBorderColor,
    fgColor,
    findMatchHighlightBgColor,
    gutterBgColor,
    hoverHighlightBgColor,
    inactiveSelectionBgColor,
    lineNumberColor,
    selectionFgColor,
    selectionHighlightBgColor,
  } from "../colorTheme";

export const nodeAndEdgeStyles: cytoscape.Stylesheet[] = [
    // Common node style
    {
      selector: "node",
      style: {
        label: "data(label)",
        shape: "roundrectangle",
        "background-color": bgColor,
        color: fgColor,
        "text-halign": "center",
        "text-valign": "center",
        "text-justification": "left",
        "font-size": "14px",
        "text-wrap": "wrap",
        width: "label",
        height: "label",
        "padding-left": "10px",
        "padding-right": "10px",
        "padding-top": "10px",
        "padding-bottom": "10px",
        "border-width": 1,
        "border-color": editorBorderColor,
      },
    },
    // Top-level node styles
    {
      selector: ".top-level-node",
      style: {
        "font-size": "14px",
        "background-color": findMatchHighlightBgColor,
        color: selectionHighlightBgColor,
        "border-width": 2,
        "border-color": editorBorderColor,
      },
    },
    // Regular node styles
    {
      selector: ".node",
      style: {
        "font-size": "14px",
        "background-color": bgColor,
        color: fgColor,
        "border-width": 1,
        "border-color": editorBorderColor,
      },
    },
    // Edge styles
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": lineNumberColor,
        "target-arrow-color": lineNumberColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    // Compound edge styles
    {
      selector: ".compound-edge",
      style: {
        width: 12,
        "line-color": editorBorderColor,
        "target-arrow-color": editorBorderColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    // Hidden elements
    {
      selector: ".hidden",
      style: {
        visibility: "hidden",
      },
    },
    // Hidden labels
    {
      selector: ".hidden-label",
      style: {
        "text-opacity": 0,
      },
    },
    // Selected nodes
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": findMatchHighlightBgColor,
        "background-color": selectionHighlightBgColor,
        color: selectionFgColor,
      },
    },
    // Hovered nodes
    {
      selector: "node:active",
      style: {
        "overlay-opacity": 0,
        "border-width": 2,
        "border-color": hoverHighlightBgColor,
      },
    },
    // Compound nodes
    {
      selector: ".compound",
      style: {
        "background-color": inactiveSelectionBgColor,
        shape: "roundrectangle",
        "text-valign": "top",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "600px",
        "border-width": 2,
        "border-color": editorBorderColor,
        "text-margin-y": 10,
        color: fgColor,
        visibility: "visible",
        display: "element",
        content: "data(label)",
        width: "label",
        height: "label",
        "padding-left": "10px",
        "padding-right": "10px",
        "padding-top": "10px",
        "padding-bottom": "10px",
      },
    },
    // Parent nodes (compound nodes)
    {
      selector: ":parent",
      style: {
        "background-opacity": 0.5,
        "background-color": gutterBgColor,
      },
    },
  ];