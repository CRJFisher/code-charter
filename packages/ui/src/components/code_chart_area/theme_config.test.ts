import type { Theme } from "@code-charter/types";

import { get_cluster_color, get_theme_colors } from "./theme_config";
import { dark_theme, light_theme } from "../../theme/default_themes";

describe("get_theme_colors", () => {
  it("selects light palette values for a light theme", () => {
    const colors = get_theme_colors(light_theme);
    expect(colors.node.background.default).toBe("rgba(255, 255, 255, 0.9)");
    expect(colors.edge.stroke).toBe("#b1b1b7");
    expect(colors.cluster.palette).toHaveLength(12);
  });

  it("selects dark palette values for a dark theme", () => {
    const colors = get_theme_colors(dark_theme);
    expect(colors.node.background.default).toBe("rgba(30, 30, 30, 0.9)");
    expect(colors.edge.stroke).toBe("#555555");
    expect(colors.cluster.palette).toHaveLength(12);
  });

  it("derives panel and text colors from the supplied VSCode theme colors", () => {
    const colors = get_theme_colors(light_theme);
    expect(colors.ui.background.panel).toBe(light_theme.colors["editor.background"]);
    expect(colors.node.text.default).toBe(light_theme.colors["editor.foreground"]);
    expect(colors.ui.border).toBe(light_theme.colors["editorWidget.border"]);
  });

  it("falls back to built-in colors when a VSCode theme color is absent", () => {
    const sparse_theme: Theme = {
      name: "Sparse Dark",
      type: "dark",
      colors: {
        "editor.background": "",
        "editor.foreground": "",
        "editorWidget.border": "",
      },
    };
    const colors = get_theme_colors(sparse_theme);
    expect(colors.node.text.default).toBe("#d4d4d4");
    expect(colors.ui.background.panel).toBe("#1e1e1e");
    expect(colors.ui.border).toBe("#454545");
  });
});

describe("get_cluster_color", () => {
  const colors = get_theme_colors(light_theme);

  it("returns the palette entry at the given index", () => {
    expect(get_cluster_color(colors, 2)).toBe(colors.cluster.palette[2]);
  });

  it("wraps indices beyond the palette length back to the start", () => {
    const length = colors.cluster.palette.length;
    expect(get_cluster_color(colors, length)).toBe(colors.cluster.palette[0]);
    expect(get_cluster_color(colors, length + 3)).toBe(colors.cluster.palette[3]);
  });

  it("wraps negative indices into range", () => {
    const length = colors.cluster.palette.length;
    expect(get_cluster_color(colors, -1)).toBe(colors.cluster.palette[length - 1]);
  });
});
