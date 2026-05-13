import type { ThemeConfig } from "antd";

/** Architect / Material-style palette (light-first). */
export const architectTheme: ThemeConfig = {
  token: {
    colorPrimary: "#3f51b5",
    colorInfo: "#3f51b5",
    colorSuccess: "#006e1c",
    colorWarning: "#b45309",
    colorError: "#ba1a1a",
    colorBgLayout: "#f7f9fc",
    colorBgContainer: "#ffffff",
    colorBorder: "#e0e3e6",
    colorBorderSecondary: "#c5c5d4",
    colorText: "#1a1c1e",
    colorTextSecondary: "#64748b",
    colorTextTertiary: "#94a3b8",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontSize: 14,
    borderRadius: 8,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: "#f7f9fc",
      headerHeight: 64,
      headerPadding: "0 24px",
      bodyBg: "#ffffff",
      siderBg: "#f2f4f7",
      triggerBg: "#e8eaed",
    },
    Menu: {
      itemBg: "transparent",
      itemColor: "#475569",
      itemHoverBg: "#e8eaed",
      itemHoverColor: "#24389c",
      itemSelectedBg: "#ffffff",
      itemSelectedColor: "#24389c",
      itemActiveBg: "#dee0ff",
      iconSize: 18,
      fontSize: 14,
    },
    Button: {
      primaryShadow: "0 2px 0 rgba(63, 81, 181, 0.06)",
    },
  },
};

export const headlineFontFamily = "'Space Grotesk', 'Inter', system-ui, sans-serif";
