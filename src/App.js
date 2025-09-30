import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAdmin } from './hooks/useAdmin';

import Login from './components/Login';
import Timetable from './components/timetable/Timetable';
import AdminPage from './components/admin/AdminPage';
import Layout from './components/Layout'; // 새로 만든 Layout 컴포넌트

import './App.css';

// 보호된 라우트를 위한 헬퍼 컴포넌트
const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AdminRoute = ({ user, isAdmin, children }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin, loading: adminLoading } = useAdmin(session?.user);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => sub.data.subscription.unsubscribe();
  }, []);

  if (loading || adminLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        {/* [수정] 로그인 상태에 따라 /login 경로의 렌더링을 다르게 처리합니다. */}
        <Route 
          path="/login" 
          element={session ? <Navigate to="/" replace /> : <Login />} 
        />
        
        {/* 로그인한 사용자만 접근 가능한 레이아웃 */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute user={session?.user}>
              <Layout user={session?.user} isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        >
          {/* Layout의 Outlet으로 렌더링될 페이지들 */}
          <Route index element={<Timetable user={session?.user} />} />
          <Route 
            path="admin" 
            element={
              <AdminRoute user={session?.user} isAdmin={isAdmin}>
                <AdminPage />
              </AdminRoute>
            } 
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

