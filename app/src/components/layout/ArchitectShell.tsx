import { useState } from "react";
import { Layout, Menu, Button, Typography, Drawer, Grid, Space, Tag, Avatar } from "antd";
import {
  AppstoreOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  SettingOutlined,
  PlusOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { headlineFontFamily } from "@/theme/architectTheme";
import ChatRightRail from "./ChatRightRail";

const { Sider, Header, Content } = Layout;

const LEFT_WIDTH = 256;
const RIGHT_WIDTH = 280;

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

export type ArchitectNavKey = "workspace" | "history" | "settings";

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

  const menuItems = [
    { key: "workspace", icon: <AppstoreOutlined />, label: "Workspace", path: "/" },
    { key: "history", icon: <HistoryOutlined />, label: "History", path: "/history" },
    {
      key: "dataviewer",
      icon: <DatabaseOutlined />,
      label: "Data Viewer",
      path: "#",
    },
    { key: "settings", icon: <SettingOutlined />, label: "Settings", path: "/settings" },
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
        <div
          className="sql-gradient"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="material-symbols-outlined" style={{ color: "#fff", fontSize: 22 }}>
            architecture
          </span>
        </div>
        <div>
          <Typography.Title
            level={5}
            style={{
              margin: 0,
              fontFamily: headlineFontFamily,
              color: "#24389c",
              fontWeight: 700,
            }}
          >
            QueryWeaver
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

  const showDesktopSider = screens.md;

  return (
    <Layout style={{ minHeight: "100vh", background: "#fff" }}>
      {showDesktopSider ? (
        <Sider
          width={LEFT_WIDTH}
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
          width={LEFT_WIDTH}
          onClose={() => setMobileNavOpen(false)}
          open={mobileNavOpen}
          styles={{ body: { padding: 0 } }}
        >
          {siderContent}
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: showDesktopSider ? LEFT_WIDTH : 0,
          minHeight: "100vh",
          transition: "margin-left 0.2s",
        }}
      >
        <Header
          style={{
            position: "fixed",
            top: 0,
            left: showDesktopSider ? LEFT_WIDTH : 0,
            right: showRightRail && screens.xl ? RIGHT_WIDTH : 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingInline: 24,
            borderBottom: "1px solid #e0e3e6",
            background: "#f7f9fc",
            height: 64,
            lineHeight: "64px",
          }}
        >
          <Space size="middle" align="center">
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
              style={{
                fontFamily: headlineFontFamily,
                color: "#24389c",
                fontSize: 18,
              }}
            >
              QueryWeaver
            </Typography.Text>
            {showVersionBadge ? (
              <Tag
                style={{
                  margin: 0,
                  background: "#dee0ff",
                  color: "#24389c",
                  borderColor: "rgba(36, 56, 156, 0.12)",
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {versionLabel}
              </Tag>
            ) : null}
            {headerContext != null && headerContext !== false ? (
              <>
                <div
                  aria-hidden
                  style={{ width: 1, height: 16, background: "#e0e3e6", flexShrink: 0, alignSelf: "center" }}
                />
                <Typography.Text style={{ fontSize: 14, fontWeight: 500, color: "#64748b", margin: 0 }}>
                  {headerContext}
                </Typography.Text>
              </>
            ) : null}
          </Space>
          <Space wrap>{headerExtra}</Space>
        </Header>

        <Layout
          style={{
            background: "#fff",
            marginRight: showRightRail && screens.xl ? RIGHT_WIDTH : 0,
            minHeight: "100vh",
            paddingTop: 64,
          }}
        >
          <Content style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
            {children}
          </Content>

          {showRightRail && screens.xl ? (
            <Sider
              width={RIGHT_WIDTH}
              theme="light"
              style={{
                position: "fixed",
                right: 0,
                top: 64,
                height: "calc(100vh - 64px)",
                borderLeft: "1px solid #e0e3e6",
                background: "#ffffff",
                overflow: "auto",
                zIndex: 40,
              }}
            >
              <div style={{ padding: 24 }} className="custom-scrollbar">
                <ChatRightRail />
              </div>
            </Sider>
          ) : null}
        </Layout>
      </Layout>
    </Layout>
  );
};

export default ArchitectShell;
