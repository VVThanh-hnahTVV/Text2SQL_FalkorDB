import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, PanelLeft } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import ChatInterface from "@/components/chat/ChatInterface";
import DatabaseModal from "@/components/modals/DatabaseModal";
import DeleteDatabaseModal from "@/components/modals/DeleteDatabaseModal";
import SchemaViewer from "@/components/schema";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useDatabase } from "@/contexts/DatabaseContext";
import { DatabaseService } from "@/services/database";
import { useToast } from "@/components/ui/use-toast";
import { csrfHeaders } from "@/lib/csrf";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Index = () => {
  const { selectedGraph, graphs, selectGraph, uploadSchema } = useDatabase();
  const { toast } = useToast();
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  // userRulesSpec is now fetched from the graph database per query
  const [useMemory, setUseMemory] = useState(() => {
    // Load from localStorage on init, default to true
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
  const [isRefreshingSchema, setIsRefreshingSchema] = useState(false);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [schemaViewerWidth, setSchemaViewerWidth] = useState(() =>
    typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.4) : 0,
  );
  const [databaseToDelete, setDatabaseToDelete] = useState<{ id: string; name: string; isDemo: boolean } | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // No need to fetch rules - we just pass the toggle state to backend

  const handleConnectDatabase = () => {
    if (isRefreshingSchema || isChatProcessing) return;
    setShowDatabaseModal(true);
  };

  const handleUploadSchema = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await uploadSchema(file, file.name.replace(/\.[^/.]+$/, ""));
      toast({
        title: "Schema Uploaded",
        description: "Database schema uploaded successfully!",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload schema",
        variant: "destructive",
      });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteGraph = async (graphId: string, graphName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent dropdown from closing/selecting
    
    // Check if this is a demo database
    const isDemo = graphId.startsWith('general_');
    
    if (isRefreshingSchema) return;
    // Show the delete confirmation modal
    setDatabaseToDelete({ id: graphId, name: graphName, isDemo });
    setShowDeleteModal(true);
  };

  const confirmDeleteGraph = async () => {
    if (!databaseToDelete) return;

    try {
      await DatabaseService.deleteGraph(databaseToDelete.id);

      toast({
        title: "Database Deleted",
        description: `Successfully deleted "${databaseToDelete.name}"`,
      });

      // Close modal before refresh
      setShowDeleteModal(false);
      setDatabaseToDelete(null);

      // Refresh the graphs list (can be replaced with a context refresh later)
      window.location.reload();
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete database",
        variant: "destructive",
      });
    }
  };

  const handleRefreshSchema = async () => {
    if (!selectedGraph) {
      toast({
        title: "No Database Selected",
        description: "Please select a database first",
        variant: "destructive",
      });
      return;
    }

    if (isChatProcessing) {
      toast({
        title: "Chat is Processing",
        description: "Please wait for the current query to complete",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRefreshingSchema(true);
      const response = await fetch(`/graphs/${selectedGraph.id}/refresh`, {
        method: 'POST',
        headers: {
          ...csrfHeaders(),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to refresh schema' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let hasError = false;
      const delimiter = '|||FALKORDB_MESSAGE_BOUNDARY|||';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete messages
        const parts = buffer.split(delimiter);
        buffer = parts.pop() || ''; // Keep incomplete part in buffer

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          try {
            const message = JSON.parse(trimmed);
            if (message.type === 'error') {
              hasError = true;
              throw new Error(message.message || 'Schema refresh failed');
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.error('Failed to parse message:', trimmed);
            } else {
              throw e;
            }
          }
        }
      }

      if (hasError) {
        return; // Error already thrown and caught
      }

      toast({
        title: "Schema Refreshed",
        description: "Database schema refreshed successfully!",
      });

      // Reload to show updated schema
      window.location.reload();
    } catch (error) {
      console.error('Refresh error:', error);
      toast({
        title: "Refresh Failed",
        description: error instanceof Error ? error.message : "Failed to refresh schema",
        variant: "destructive",
      });
    }
    finally {
      setIsRefreshingSchema(false);
    }
  };

  return (
    <div className="flex min-h-full flex-1 bg-background overflow-x-hidden">
      {/* Hidden file input for schema upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sql,.csv,.json"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        data-testid="schema-upload-input"
      />
      
      {/* Left Sidebar */}
      <Sidebar 
        onSchemaClick={() => { if (!isRefreshingSchema) setShowSchemaViewer(!showSchemaViewer); }}
        isSchemaOpen={showSchemaViewer}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      {/* Schema Viewer */}
      <SchemaViewer 
        isOpen={showSchemaViewer}
        onClose={() => setShowSchemaViewer(false)}
        onWidthChange={setSchemaViewerWidth}
        sidebarWidth={sidebarWidth}
      />
      
      {/* Main Content — min-h-0 lets nested flex children shrink so chat scrolls inside the column */}
      <div
        className="flex min-h-full flex-1 flex-col overflow-x-hidden transition-all duration-300"
        style={getMainContentStyles()}
      >
        {/* Header */}
        <header className="shrink-0 border-b border-border">
          {/* Desktop Header */}
          <div className="hidden md:flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">Graph-Powered Text-to-SQL</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedGraph ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="database-status-badge">
                  Connected: {selectedGraph.name}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700" data-testid="database-status-badge">
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

            {/* Row 2: Tagline + Database Status */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Graph-Powered Text-to-SQL</p>
              {selectedGraph ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs px-2 py-0.5 flex-shrink-0">
                  {selectedGraph.name === 'DEMO_CRM' ? 'CRM' : selectedGraph.name}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700 text-xs px-2 py-0.5 flex-shrink-0">
                  No DB
                </Badge>
              )}
            </div>
          </div>
        </header>

        {/* Sub-header for controls */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex gap-3 flex-wrap md:flex-nowrap">
              <Button
                variant="outline"
                className="bg-card border-border text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed p-2"
                onClick={handleRefreshSchema}
                disabled={!selectedGraph || isRefreshingSchema || isChatProcessing}
                title={selectedGraph ? (isRefreshingSchema ? 'Refreshing schema...' : isChatProcessing ? 'Wait for query to complete' : 'Refresh Schema') : "Select a database first"}
                data-testid="refresh-schema-btn"
              >
                {isRefreshingSchema ? <LoadingSpinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-card border-border text-muted-foreground hover:bg-muted flex-1 md:flex-initial"
                    disabled={isRefreshingSchema || isChatProcessing}
                    title={isRefreshingSchema ? 'Refreshing schema...' : isChatProcessing ? 'Wait for query to complete' : undefined}
                    data-testid="database-selector-trigger"
                  >
                    <span className="truncate">{selectedGraph?.name || 'Select Database'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-foreground">
                  {graphs.map((graph) => {
                    const isDemo = graph.id.startsWith('general_');
                    return (
                      <DropdownMenuItem
                        key={graph.id}
                        className="hover:!bg-muted flex items-center justify-between group"
                        onClick={() => { if (!isRefreshingSchema && !isChatProcessing) selectGraph(graph.id); }}
                        disabled={isRefreshingSchema || isChatProcessing}
                        data-testid={`database-option-${graph.id}`}
                      >
                        <span>{graph.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isDemo || isRefreshingSchema || isChatProcessing ? 'cursor-not-allowed opacity-40' : 'hover:bg-red-600 hover:text-white'
                          }`}
                          onClick={(e) => { if (isDemo || isRefreshingSchema || isChatProcessing) return; handleDeleteGraph(graph.id, graph.name, e); }}
                          disabled={isDemo || isRefreshingSchema}
                          title={isDemo ? 'Demo databases cannot be deleted' : (isRefreshingSchema ? 'Refreshing schema...' : `Delete ${graph.name}`)}
                          data-testid={`delete-graph-btn-${graph.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuItem>
                    );
                  })}
                  {graphs.length === 0 && (
                    <DropdownMenuItem disabled className="text-muted-foreground">
                      No databases available
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                className="bg-purple-600 border-purple-500 text-white hover:bg-purple-700 hover:border-purple-600 hover:text-white flex-1 md:flex-initial shadow-sm hover:shadow-md transition-all"
                onClick={handleConnectDatabase}
                disabled={isRefreshingSchema || isChatProcessing}
                title={isRefreshingSchema ? 'Refreshing schema...' : isChatProcessing ? 'Wait for query to complete' : undefined}
                data-testid="connect-database-btn"
              >
                  <span className="hidden sm:inline">Connect to Database</span>
                  <span className="sm:hidden">Connect DB</span>
              </Button>
              <Button
                variant="outline"
                className="bg-card border-border text-muted-foreground opacity-60 cursor-not-allowed hidden md:flex"
                disabled
                title="Upload schema feature coming soon"
                onClick={(e) => e.preventDefault()}
                data-testid="upload-schema-btn"
              >
                  Upload Schema
              </Button>
          </div>
        </div>
        
        {/* Chat — h-full + min-h-0 so grid/flex children get a definite height */}
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden">
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-x-hidden md:px-[15px]">
            <ChatInterface
              className="min-h-0 flex-1"
              disabled={isRefreshingSchema}
              onProcessingChange={setIsChatProcessing}
              useMemory={useMemory}
              useRulesFromDatabase={useRulesFromDatabase}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <DatabaseModal open={showDatabaseModal} onOpenChange={setShowDatabaseModal} />
      <DeleteDatabaseModal 
        open={showDeleteModal} 
        onOpenChange={setShowDeleteModal}
        databaseName={databaseToDelete?.name || ''}
        onConfirm={confirmDeleteGraph}
        isDemo={databaseToDelete?.isDemo || false}
      />
    </div>
  );
};

export default Index;
