import { useState, useRef, useLayoutEffect, type CSSProperties } from "react";
import { Layout, Menu, Button, Typography, Drawer, Grid, Space, Tag, Avatar, Flex } from "antd";
import {
  AppstoreOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  PlusOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { headlineFontFamily } from "@/theme/architectTheme";
import ChatRightRail from "./ChatRightRail";
import {
  SHELL_HEADER_HEIGHT,
  SHELL_HEADER_HEIGHT_MOBILE,
  SHELL_LEFT_WIDTH,
  SHELL_RIGHT_WIDTH,
} from "./shellLayout";

const { Sider, Header, Content } = Layout;

/** Brand wordmark: “Query” (indigo–violet, data side) + “Mind” (cyan, neural side). */
function AppBrandText({ style }: { style?: CSSProperties }) {
  return (
    <span style={style}>
      <span style={{ color: "#5b4fcf" }}>Query</span>
      <span style={{ color: "#00b8d4" }}>Mind</span>
    </span>
  );
}

function SiderFooterLinks() {
  const [theme, setTheme] = useState(() => {
    try {
      const t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : "light";
    } catch {
      return "light";
    }
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ padding: "0 16px 12px" }}>
      <Button
        type="text"
        size="small"
        data-testid="theme-toggle"
        icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
        style={{ paddingInline: 0 }}
      >
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </Button>
    </div>
  );
}

export type ArchitectNavKey = "workspace" | "history";

export interface ArchitectShellProps {
  /** Which left-nav item is active */
  activeNav: ArchitectNavKey;
  /** Top header row (database controls, etc.) */
  headerExtra?: React.ReactNode;
  /** Main scrollable column */
  children: React.ReactNode;
  /** Workspace-only: show chat outline + sessions */
  showRightRail?: boolean;
  onNewAnalysis?: () => void;
  onOpenDataViewer?: () => void;
  /** App version label in header */
  versionLabel?: string;
  /** When false, hides the version chip (e.g. History top bar closer to reference layout). */
  showVersionBadge?: boolean;
  /** Short page label after the title (e.g. “Query History”), with a vertical divider. */
  headerContext?: React.ReactNode;
}

const ArchitectShell = ({
  activeNav,
  headerExtra,
  children,
  showRightRail = false,
  onNewAnalysis,
  onOpenDataViewer,
  versionLabel = "v4.0",
  showVersionBadge = true,
  headerContext,
}: ArchitectShellProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const showDesktopSider = screens.md;
  const showDesktopRightRail = showRightRail && screens.xl;
  const showRailDrawer = showRightRail && !screens.xl;
  const isMobileHeader = !showDesktopSider;
  const headerRef = useRef<HTMLElement>(null);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isMobileHeader) {
      setMobileHeaderHeight(null);
      return;
    }
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      setMobileHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobileHeader, headerExtra, showRailDrawer, headerContext, showVersionBadge]);

  const headerHeight = showDesktopSider ? SHELL_HEADER_HEIGHT : (mobileHeaderHeight ?? SHELL_HEADER_HEIGHT_MOBILE);
  const headerPadX = screens.md ? 24 : 12;

  const menuItems = [
    { key: "workspace", icon: <AppstoreOutlined />, label: "Workspace", path: "/" },
    { key: "history", icon: <HistoryOutlined />, label: "History", path: "/history" },
    {
      key: "dataviewer",
      icon: <DatabaseOutlined />,
      label: "Data Viewer",
      path: "#",
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    setMobileNavOpen(false);
    if (key === "dataviewer") {
      onOpenDataViewer?.();
      return;
    }
    const item = menuItems.find((i) => i.key === key);
    if (item?.path && item.path !== "#") {
      navigate(item.path);
    }
  };

  const siderContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: "1px solid #e0e3e6",
        background: "#f2f4f7",
      }}
    >
      <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src="/logo.png"
          alt="QueryMind"
          width={40}
          height={40}
          style={{ borderRadius: 8, objectFit: "contain", flexShrink: 0 }}
        />
        <div>
          <Typography.Title
            level={5}
            style={{
              margin: 0,
              fontFamily: headlineFontFamily,
              fontWeight: 700,
            }}
          >
            <AppBrandText />
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>
            Database IDE
          </Typography.Text>
        </div>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[activeNav]}
        style={{ flex: 1, border: "none", background: "transparent", paddingInline: 8 }}
        items={menuItems.map((item) => ({
          key: item.key,
          icon: item.icon,
          label:
            item.key === "dataviewer" ? (
              <span data-testid="schema-button">{item.label}</span>
            ) : (
              item.label
            ),
          onClick: () => handleMenuClick({ key: item.key }),
        }))}
      />
      <SiderFooterLinks />
      <div style={{ padding: 16 }}>
        <Button
          type="primary"
          block
          size="large"
          icon={<PlusOutlined />}
          className="sql-gradient"
          style={{ border: "none", fontWeight: 700, height: 44 }}
          onClick={() => {
            onNewAnalysis?.();
            setMobileNavOpen(false);
            if (location.pathname !== "/") {
              navigate("/");
            }
          }}
        >
          New Analysis
        </Button>
        <Space align="start" style={{ marginTop: 20, paddingInline: 4 }} size={12}>
          <Avatar style={{ background: "#e2e2e5", color: "#475569" }}>U</Avatar>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong ellipsis style={{ display: "block", fontSize: 13 }}>
              User
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 11 }}>
              Session
            </Typography.Text>
          </div>
        </Space>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: "100vh", background: "#fff" }}>
      {showDesktopSider ? (
        <Sider
          width={SHELL_LEFT_WIDTH}
          theme="light"
          style={{
            background: "#f2f4f7",
            overflow: "auto",
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
          }}
        >
          {siderContent}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          width={SHELL_LEFT_WIDTH}
          onClose={() => setMobileNavOpen(false)}
          open={mobileNavOpen}
          styles={{ body: { padding: 0 } }}
        >
          {siderContent}
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: showDesktopSider ? SHELL_LEFT_WIDTH : 0,
          minHeight: "100vh",
          transition: "margin-left 0.2s",
        }}
      >
        <Header
          ref={headerRef}
          style={{
            position: "fixed",
            top: 0,
            left: showDesktopSider ? SHELL_LEFT_WIDTH : 0,
            right: showDesktopRightRail ? SHELL_RIGHT_WIDTH : 0,
            zIndex: 50,
            paddingInline: headerPadX,
            paddingBlock: isMobileHeader ? 8 : 0,
            borderBottom: "1px solid #e0e3e6",
            background: "#f7f9fc",
            height: isMobileHeader ? "auto" : headerHeight,
            minHeight: isMobileHeader ? SHELL_HEADER_HEIGHT_MOBILE : headerHeight,
            boxSizing: "border-box",
          }}
        >
          <div className="shell-header-inner">
            <Flex align="center" gap={8} className="shell-header-brand" wrap={false}>
              {!showDesktopSider && (
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open menu"
                />
              )}
              <Typography.Text
                strong
                ellipsis
                className="shell-header-title"
                style={{
                  fontFamily: headlineFontFamily,
                  fontSize: screens.md ? 18 : 16,
                  ...(showDesktopSider
                    ? { maxWidth: screens.sm ? 200 : 120 }
                    : { flex: 1, minWidth: 0, maxWidth: "100%" }),
                }}
              >
                <AppBrandText />
              </Typography.Text>
              {showVersionBadge ? (
                <Tag
                  className="shell-version-badge"
                  style={{
                    margin: 0,
                    background: "#dee0ff",
                    color: "#24389c",
                    borderColor: "rgba(36, 56, 156, 0.12)",
                    fontWeight: 700,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    flexShrink: 0,
                  }}
                >
                  {versionLabel}
                </Tag>
              ) : null}
              {headerContext != null && headerContext !== false ? (
                <>
                  <div
                    aria-hidden
                    className="shell-header-context"
                    style={{ width: 1, height: 16, background: "#e0e3e6", flexShrink: 0 }}
                  />
                  <Typography.Text
                    className="shell-header-context"
                    ellipsis
                    style={{ fontSize: 14, fontWeight: 500, color: "#64748b", margin: 0, maxWidth: 180 }}
                  >
                    {headerContext}
                  </Typography.Text>
                </>
              ) : null}
            </Flex>
            <Space size="small" wrap className="shell-header-actions">
              {showRailDrawer ? (
                <Button
                  type="text"
                  icon={<UnorderedListOutlined />}
                  onClick={() => setMobileRailOpen(true)}
                  aria-label="Open chat outline"
                />
              ) : null}
              {headerExtra}
            </Space>
          </div>
        </Header>

        <Layout
          style={{
            background: "#fff",
            marginRight: showDesktopRightRail ? SHELL_RIGHT_WIDTH : 0,
            minHeight: "100vh",
            paddingTop: headerHeight,
          }}
        >
          <Content style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            {children}
          </Content>

          {showDesktopRightRail ? (
            <Sider
              width={SHELL_RIGHT_WIDTH}
              theme="light"
              style={{
                position: "fixed",
                right: 0,
                top: headerHeight,
                height: `calc(100vh - ${headerHeight}px)`,
                borderLeft: "1px solid #e0e3e6",
                background: "#ffffff",
                overflow: "auto",
                zIndex: 40,
              }}
            >
              <div style={{ padding: screens.md ? 24 : 16 }} className="custom-scrollbar">
                <ChatRightRail />
              </div>
            </Sider>
          ) : null}
        </Layout>

        {showRailDrawer ? (
          <Drawer
            title="Chat outline"
            placement="right"
            width={Math.min(SHELL_RIGHT_WIDTH, typeof window !== "undefined" ? window.innerWidth - 24 : SHELL_RIGHT_WIDTH)}
            open={mobileRailOpen}
            onClose={() => setMobileRailOpen(false)}
            styles={{ body: { padding: 16 } }}
          >
            <ChatRightRail />
          </Drawer>
        ) : null}
      </Layout>
    </Layout>
  );
};

export default ArchitectShell;
