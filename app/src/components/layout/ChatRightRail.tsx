import { Typography, List } from "antd";
import { useChat } from "@/contexts/ChatContext";

const ChatRightRail = () => {
  const { messages } = useChat();
  const userTopics = messages
    .filter((m) => m.type === "user")
    .map((m) => ({ id: m.id, text: m.content }))
    .slice(-5)
    .reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Typography.Text
          strong
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#757780",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            list_alt
          </span>
          Chat outline
        </Typography.Text>
        <List
          size="small"
          dataSource={userTopics}
          renderItem={(item, index) => {
            const isCurrent = index === 0;
            return (
              <List.Item style={{ border: "none", padding: "8px 0" }}>
                <div style={{ paddingLeft: 12, borderLeft: `2px solid ${isCurrent ? "#3f51b5" : "transparent"}` }}>
                  <Typography.Text
                    strong
                    style={{
                      fontSize: 10,
                      color: isCurrent ? "#3f51b5" : "#757780",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    {isCurrent ? "CURRENT" : "PREVIOUS"}
                  </Typography.Text>
                  <Typography.Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ margin: 0, fontSize: 12, color: isCurrent ? "#1a1c1e" : "#64748b" }}
                  >
                    {item.text}
                  </Typography.Paragraph>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
      <div style={{ borderTop: "1px solid #e0e3e6", paddingTop: 24 }}>
        <Typography.Text
          strong
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#757780",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            history
          </span>
          Recent sessions
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Session history from the server will appear here in a future update.
        </Typography.Paragraph>
      </div>
    </div>
  );
};

export default ChatRightRail;
