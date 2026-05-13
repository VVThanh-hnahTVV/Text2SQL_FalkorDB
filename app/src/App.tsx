import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import { DatabaseProvider } from "@/contexts/DatabaseContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { architectTheme } from "@/theme/architectTheme";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import History from "./pages/History";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ConfigProvider theme={architectTheme}>
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider>
          <SettingsProvider>
            <ChatProvider>
              <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/history" element={<History />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
              </BrowserRouter>
            </ChatProvider>
          </SettingsProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </AntdApp>
  </ConfigProvider>
);

export default App;
