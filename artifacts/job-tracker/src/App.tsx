import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/not-found";

import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import ApplicationNew from "@/pages/ApplicationNew";
import ApplicationDetail from "@/pages/ApplicationDetail";
import Profile from "@/pages/Profile";
import JobSearch from "@/pages/JobSearch";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Layout><Dashboard /></Layout>
      </Route>
      <Route path="/jobs">
        <Layout><JobSearch /></Layout>
      </Route>
      <Route path="/applications/new">
        <Layout><ApplicationNew /></Layout>
      </Route>
      <Route path="/applications/:id">
        {params => <Layout><ApplicationDetail id={params.id!} /></Layout>}
      </Route>
      <Route path="/profile">
        <Layout><Profile /></Layout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login />;

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
