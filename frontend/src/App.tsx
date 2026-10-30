import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import Dashboard from './components/Dashboard/Dashboard';
import EngagementList from './components/Engagement/EngagementList';
import EngagementSetup from './components/Engagement/EngagementSetup';
import EngagementDetail from './components/Engagement/EngagementDetail';
import ApprovalQueue from './components/Approval/ApprovalQueue';
import FindingsTimeline from './components/Findings/FindingsTimeline';
import AuditLog from './components/AuditLog/AuditLog';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/engagements" element={<EngagementList />} />
                  <Route path="/engagements/new" element={<EngagementSetup />} />
                  <Route path="/engagements/:id" element={<EngagementDetail />} />
                  <Route path="/approvals" element={<ApprovalQueue />} />
                  <Route path="/findings" element={<FindingsTimeline />} />
                  <Route path="/audit" element={<AuditLog />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
};

export default App;
