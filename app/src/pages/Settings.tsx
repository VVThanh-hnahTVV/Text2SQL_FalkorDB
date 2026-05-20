import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Switch, Typography, Space, Input, Flex } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { showToast } from "@/lib/notify";
import { useDatabase } from "@/contexts/DatabaseContext";
import { databaseService } from "@/services/database";
import ArchitectShell from "@/components/layout/ArchitectShell";
import SchemaViewer from "@/components/schema";

const { TextArea } = Input;

const Settings = () => {
  const navigate = useNavigate();
  const { selectedGraph } = useDatabase();

  const [rules, setRules] = useState("");
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [initialRulesLoaded, setInitialRulesLoaded] = useState(false);
  const loadedRulesRef = useRef<string>("");
  const currentRulesRef = useRef<string>("");
  const currentGraphIdRef = useRef<string | null>(null);
  const useRulesFromDatabaseRef = useRef<boolean>(true);
  const initialRulesLoadedRef = useRef<boolean>(false);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);

  const [useMemory, setUseMemory] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_memory");
      return saved === null ? true : saved === "true";
    }
    return true;
  });
  const [initialUseMemory] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_memory");
      return saved === null ? true : saved === "true";
    }
    return true;
  });
  const [useRulesFromDatabase, setUseRulesFromDatabase] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_rules_from_database");
      return saved === null ? false : saved === "true";
    }
    return false;
  });
  const [initialUseRulesFromDatabase] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("queryweaver_use_rules_from_database");
      return saved === null ? false : saved === "true";
    }
    return false;
  });

  useEffect(() => {
    const loadRules = async () => {
      if (!selectedGraph) {
        setRules("");
        setIsLoadingRules(false);
        setInitialRulesLoaded(false);
        loadedRulesRef.current = "";
        currentGraphIdRef.current = null;
        return;
      }

      currentGraphIdRef.current = selectedGraph.id;

      if (!useRulesFromDatabase) {
        setIsLoadingRules(false);
        setInitialRulesLoaded(true);
        return;
      }

      try {
        setIsLoadingRules(true);
        setInitialRulesLoaded(false);
        const userRules = await databaseService.getUserRules(selectedGraph.id);
        const rulesValue = userRules || "";
        setRules(rulesValue);
        loadedRulesRef.current = rulesValue;
      } catch (error) {
        console.error("Failed to load user rules:", error);
        showToast({
          title: "Error",
          description: "Failed to load user rules from database",
          variant: "destructive",
        });
      } finally {
        setIsLoadingRules(false);
        setInitialRulesLoaded(true);
        initialRulesLoadedRef.current = true;
      }
    };

    void loadRules();
  }, [selectedGraph?.id, useRulesFromDatabase]);

  useEffect(() => {
    useRulesFromDatabaseRef.current = useRulesFromDatabase;
  }, [useRulesFromDatabase]);

  useEffect(() => {
    currentRulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    return () => {
      const graphId = currentGraphIdRef.current;
      const loadedRules = loadedRulesRef.current;
      const currentRules = currentRulesRef.current;
      const shouldUseDb = useRulesFromDatabaseRef.current;
      const isLoaded = initialRulesLoadedRef.current;

      if (graphId && shouldUseDb && currentRules !== loadedRules && isLoaded) {
        void databaseService.updateUserRules(graphId, currentRules).catch((err) => console.error("Failed to save rules on unmount:", err));
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("queryweaver_use_memory", String(useMemory));
    }
  }, [useMemory]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("queryweaver_use_rules_from_database", String(useRulesFromDatabase));
    }
  }, [useRulesFromDatabase]);

  const hasChanges =
    useMemory !== initialUseMemory ||
    useRulesFromDatabase !== initialUseRulesFromDatabase ||
    (useRulesFromDatabase && rules !== loadedRulesRef.current);

  const handleBackClick = async () => {
    const graphId = currentGraphIdRef.current;
    const loadedRules = loadedRulesRef.current;
    const currentRules = currentRulesRef.current;

    if (graphId && useRulesFromDatabase && currentRules !== loadedRules && initialRulesLoaded) {
      try {
        await databaseService.updateUserRules(graphId, currentRules);
        loadedRulesRef.current = currentRules;
      } catch (error) {
        showToast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to save user rules",
          variant: "destructive",
        });
      }
    }

    navigate("/");
  };

  const headerExtra = selectedGraph ? (
    <Typography.Text type="secondary">
      DB: <Typography.Text strong>{selectedGraph.name}</Typography.Text>
    </Typography.Text>
  ) : null;

  return (
    <>
      <ArchitectShell
        activeNav="settings"
        showRightRail={false}
        headerExtra={headerExtra}
        onOpenDataViewer={() => setShowSchemaViewer(true)}
      >
        <div className="page-container page-container--narrow">
          <Flex align="center" gap={16} style={{ marginBottom: 24, flexWrap: "wrap" }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => void handleBackClick()}>
              Back
            </Button>
            <div>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Query settings
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
                Custom rules for SQL generation. Changes save when you leave this page or tap Save.
              </Typography.Paragraph>
            </div>
          </Flex>

          <Space direction="vertical" size={24} style={{ width: "100%" }}>
            <Flex align="center" justify="space-between" wrap="wrap" gap={16} style={{ padding: 16, border: "1px solid #e0e3e6", borderRadius: 12, background: "#fafbfc" }}>
              <div>
                <Typography.Text strong>Use memory context</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", maxWidth: 520 }}>
                  Let the model use prior turns for more contextual answers.
                </Typography.Paragraph>
              </div>
              <Switch checked={useMemory} onChange={setUseMemory} />
            </Flex>

            <Flex align="center" justify="space-between" wrap="wrap" gap={16} style={{ padding: 16, border: "1px solid #e0e3e6", borderRadius: 12, background: "#fafbfc" }}>
              <div>
                <Typography.Text strong>Use database rules</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", maxWidth: 520 }}>
                  Persist rules in the graph and reuse them for every session.
                </Typography.Paragraph>
              </div>
              <Switch checked={useRulesFromDatabase} onChange={setUseRulesFromDatabase} />
            </Flex>

            {useRulesFromDatabase && (
              <div>
                <Flex align="center" justify="space-between" style={{ marginBottom: 8 }}>
                  <Typography.Text strong>User rules &amp; specifications</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {rules.length}/5000
                  </Typography.Text>
                </Flex>
                <TextArea
                  id="rules"
                  placeholder="Example: prefer explicit column names, limit to 100 rows…"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  maxLength={5000}
                  rows={14}
                  disabled={isLoadingRules}
                  style={{ fontFamily: "monospace" }}
                />
                <Flex justify="flex-end" gap={8} style={{ marginTop: 12 }}>
                  <Button onClick={() => setRules("")}>Clear</Button>
                  {hasChanges && selectedGraph?.id && (
                    <Button
                      type="primary"
                      className="sql-gradient"
                      style={{ border: "none" }}
                      onClick={async () => {
                        try {
                          await databaseService.updateUserRules(selectedGraph.id, rules);
                          loadedRulesRef.current = rules;
                          showToast({ title: "Saved", description: "User rules saved successfully" });
                        } catch (error) {
                          showToast({
                            title: "Error",
                            description: error instanceof Error ? error.message : "Failed to save user rules",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Save
                    </Button>
                  )}
                </Flex>
              </div>
            )}
          </Space>
        </div>
      </ArchitectShell>

      <SchemaViewer isOpen={showSchemaViewer} onClose={() => setShowSchemaViewer(false)} />
    </>
  );
};

export default Settings;
