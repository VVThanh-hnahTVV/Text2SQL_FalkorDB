import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DatabaseProvider>
      <SettingsProvider>
        <ChatProvider>
          <TooltipProvider>
            {/* relative + absolute Toaster: toasts stay mounted but do not consume flex height (fixes empty main column) */}
            <div className="relative flex min-h-full w-full flex-1 flex-col overflow-visible">
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/settings" element={<Settings />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
              <div className="pointer-events-none absolute inset-0 z-[200]">
                <Toaster />
              </div>
            </div>
          </TooltipProvider>
        </ChatProvider>
      </SettingsProvider>
    </DatabaseProvider>
  </QueryClientProvider>
);

export default App;
