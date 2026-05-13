import { Card, Row, Col, Typography } from "antd";

interface SuggestionCardsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

const SuggestionCards = ({ suggestions, onSelect, disabled = false }: SuggestionCardsProps) => {
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {suggestions.map((suggestion) => (
        <Col xs={24} sm={12} lg={8} key={suggestion}>
          <Card
            size="small"
            hoverable={!disabled}
            onClick={disabled ? undefined : () => onSelect(suggestion)}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(suggestion);
              }
            }}
            styles={{ body: { padding: 12 } }}
            style={{
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
              borderColor: "#e0e3e6",
            }}
          >
            <Typography.Paragraph
              ellipsis={{ rows: 2 }}
              type="secondary"
              style={{ margin: 0, textAlign: "center", fontSize: 13 }}
            >
              {suggestion}
            </Typography.Paragraph>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default SuggestionCards;
