import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PanelLeft } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useDatabase } from "@/contexts/DatabaseContext";
import { databaseService } from "@/services/database";
import Sidebar from "@/components/layout/Sidebar";
import SchemaViewer from "@/components/schema";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedGraph } = useDatabase();

  const [rules, setRules] = useState('');
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [initialRulesLoaded, setInitialRulesLoaded] = useState(false);
  const loadedRulesRef = useRef<string>(''); // Track the originally loaded rules
  const currentRulesRef = useRef<string>(''); // Track the current rules value
  const currentGraphIdRef = useRef<string | null>(null); // Track current database ID for unmount save
  const useRulesFromDatabaseRef = useRef<boolean>(true); // Track toggle state for unmount
  const initialRulesLoadedRef = useRef<boolean>(false); // Track loaded state for unmount
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  const [schemaViewerWidth, setSchemaViewerWidth] = useState(() =>
    typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.4) : 0,
  );
  const [useMemory, setUseMemory] = useState(() => {
    // Load from localStorage on init, default to true
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('queryweaver_use_memory');
      return saved === null ? true : saved === 'true';
    }
    return true;
  });
  const [initialUseMemory] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('queryweaver_use_memory');
      return saved === null ? true : saved === 'true';
    }
    return true;
  });
  const [useRulesFromDatabase, setUseRulesFromDatabase] = useState(() => {
    // Load from localStorage on init, default to false
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('queryweaver_use_rules_from_database');
      return saved === null ? false : saved === 'true';
    }
    return false;
  });
  const [initialUseRulesFromDatabase] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('queryweaver_use_rules_from_database');
      return saved === null ? false : saved === 'true';
    }
    return false;
  });

  // Handle window resize to update layout
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-collapse sidebar when switching to mobile view
  useEffect(() => {
    const isMobile = windowWidth < 768;
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth]); // Only run when windowWidth changes, not on manual toggle

  // Calculate sidebar width based on collapsed state
  // On desktop: sidebar is always visible (64px), on mobile: can be collapsed (0px)
  const getSidebarWidth = () => {
    const isMobile = windowWidth < 768;
    if (isMobile) {
      return sidebarCollapsed ? 0 : 64;
    }
    return 64; // Always visible on desktop
  };
  
  const sidebarWidth = getSidebarWidth();
  
  // Calculate main content margin and width
  // On mobile: ignore schema viewer (it's an overlay), only account for sidebar
  // On desktop: account for both sidebar and schema viewer
  const getMainContentStyles = () => {
    const isMobile = windowWidth < 768;

    if (isMobile) {
      return {
        marginLeft: `${sidebarWidth}px`,
        width: `calc(100% - ${sidebarWidth}px)`
      };
    }

    // Desktop
    const totalOffset = showSchemaViewer ? schemaViewerWidth + sidebarWidth : sidebarWidth;
    return {
      marginLeft: `${totalOffset}px`,
      width: `calc(100% - ${totalOffset}px)`
    };
  };

  // Fetch user rules from backend when component mounts or database changes (only if using database rules)
  useEffect(() => {
    const loadRules = async () => {
      if (!selectedGraph) {
        setRules('');
        setIsLoadingRules(false);
        setInitialRulesLoaded(false);
        loadedRulesRef.current = '';
        currentGraphIdRef.current = null;
        return;
      }
      
      // Update the ref to track current database
      currentGraphIdRef.current = selectedGraph.id;
      
      // Only fetch from database if toggle is enabled
      if (!useRulesFromDatabase) {
        setIsLoadingRules(false);
        setInitialRulesLoaded(true);
        return;
      }
      
      try {
        setIsLoadingRules(true);
        setInitialRulesLoaded(false);
        const userRules = await databaseService.getUserRules(selectedGraph.id);
        const rulesValue = userRules || '';
        setRules(rulesValue);
        loadedRulesRef.current = rulesValue; // Store the loaded value
      } catch (error) {
        console.error('Failed to load user rules:', error);
        toast({
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
    
    loadRules();
  }, [selectedGraph?.id, toast, useRulesFromDatabase]);

  // Update refs when toggle or rules change
  useEffect(() => {
    useRulesFromDatabaseRef.current = useRulesFromDatabase;
  }, [useRulesFromDatabase]);

  useEffect(() => {
    currentRulesRef.current = rules;
  }, [rules]);

  // Save rules when component unmounts (user navigates away from Settings)
  useEffect(() => {
    return () => {
      // At unmount time, check if there are unsaved changes and save them
      const graphId = currentGraphIdRef.current;
      const loadedRules = loadedRulesRef.current;
      const currentRules = currentRulesRef.current;
      const shouldUseDb = useRulesFromDatabaseRef.current;
      const isLoaded = initialRulesLoadedRef.current;
      
      if (graphId && shouldUseDb && currentRules !== loadedRules && isLoaded) {
        // Save immediately on unmount if there are unsaved changes
        console.log('Saving rules on unmount...', { graphId, length: currentRules.length });
        databaseService.updateUserRules(graphId, currentRules)
          .then(() => console.log('User rules saved on unmount to:', graphId))
          .catch(err => console.error('Failed to save rules on unmount:', err));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array - effect runs once on mount, cleanup runs once on unmount

  // Auto-save to localStorage whenever useMemory changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('queryweaver_use_memory', String(useMemory));
    }
  }, [useMemory]);

  // Auto-save to localStorage whenever useRulesFromDatabase changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('queryweaver_use_rules_from_database', String(useRulesFromDatabase));
    }
  }, [useRulesFromDatabase]);

  // Check if there are any unsaved changes
  const hasChanges = useMemory !== initialUseMemory ||
                     useRulesFromDatabase !== initialUseRulesFromDatabase ||
                     (useRulesFromDatabase && rules !== loadedRulesRef.current);

  const handleBackClick = async () => {
    // Save rules before navigating away if there are unsaved changes
    const graphId = currentGraphIdRef.current;
    const loadedRules = loadedRulesRef.current;
    const currentRules = currentRulesRef.current;

    if (graphId && useRulesFromDatabase && currentRules !== loadedRules && initialRulesLoaded) {
      try {
        await databaseService.updateUserRules(graphId, currentRules);
        loadedRulesRef.current = currentRules; // Update to prevent unmount from saving again
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to save user rules",
          variant: "destructive",
        });
      }
    }

    navigate('/');
  };

  return (
    <div className="flex h-full max-h-full min-h-0 flex-1 bg-background text-foreground overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar 
        onSchemaClick={() => setShowSchemaViewer(!showSchemaViewer)}
        isSchemaOpen={showSchemaViewer}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSettingsClick={() => {}}
      />
      
      {/* Schema Viewer */}
      <SchemaViewer 
        isOpen={showSchemaViewer}
        onClose={() => setShowSchemaViewer(false)}
        onWidthChange={setSchemaViewerWidth}
        sidebarWidth={sidebarWidth}
      />
      
      {/* Main Content */}
      <div className="flex flex-1 flex-col transition-all duration-300" style={getMainContentStyles()}>
        {/* Top Header Bar */}
        <header className="border-b border-border bg-background">
          {/* Desktop Header */}
          <div className="hidden md:flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">Graph-Powered Text-to-SQL</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedGraph ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                  Connected: {selectedGraph.name}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700">
                  No Database Selected
                </Badge>
              )}
            </div>
          </div>

          {/* Mobile Header */}
          <div className="md:hidden p-4 space-y-3">
            {/* Row 1: Hamburger (if collapsed) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {sidebarCollapsed && (
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all"
                    data-testid="sidebar-toggle"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Database Status Badge */}
            <div className="flex justify-center">
              {selectedGraph ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                  Connected: {selectedGraph.name}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700 text-xs">
                  No Database Selected
                </Badge>
              )}
            </div>
          </div>
        </header>

        {/* Settings Header */}
        <div className="border-b border-border bg-card px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackClick}
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl md:text-2xl font-semibold">Query Settings</h1>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  Define custom rules and specifications for SQL generation. Changes are saved automatically.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Memory Toggle */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="use-memory" className="text-base font-semibold text-foreground">
                    Use Memory Context
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enable AI to remember previous interactions, preferences, and query patterns for more personalized results
                  </p>
                </div>
                <Switch
                  id="use-memory"
                  checked={useMemory}
                  onCheckedChange={setUseMemory}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>
            </div>

            {/* Database Rules Toggle */}
            <div className="bg-card p-5 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="use-database-rules" className="text-base font-semibold text-foreground">
                    Use Database Rules
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Store rules in the database and use for all sessions. When disabled, rules are sent with each request
                  </p>
                </div>
                <Switch
                  id="use-database-rules"
                  checked={useRulesFromDatabase}
                  onCheckedChange={setUseRulesFromDatabase}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>
            </div>

            {/* User Rules - only show when database rules are enabled */}
            {useRulesFromDatabase && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rules" className="text-base font-semibold text-foreground">
                    User Rules & Specifications
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {rules.length}/5000 characters
                  </span>
                </div>
              <Textarea
                id="rules"
                placeholder={`Example rules:
- Always use ISO date format (YYYY-MM-DD)
- Limit results to 100 rows unless specified
- Always include ORDER BY for consistent results
- Use LEFT JOIN instead of INNER JOIN for optional relationships
- Add comments to complex queries
- Prefer explicit column names over SELECT *
- Use descriptive aliases for clarity`}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                maxLength={5000}
                className="min-h-[400px] bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-purple-500 focus:ring-purple-500 font-mono text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRules('')}
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  Clear
                </Button>
                {hasChanges && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (selectedGraph?.id) {
                        try {
                          await databaseService.updateUserRules(selectedGraph.id, rules);
                          loadedRulesRef.current = rules;
                          toast({
                            title: "Saved",
                            description: "User rules saved successfully",
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: error instanceof Error ? error.message : "Failed to save user rules",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Save
                  </Button>
                )}
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
