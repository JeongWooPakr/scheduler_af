import React from 'react';
// [수정] 사용하지 않는 useNavigate를 import 목록에서 삭제합니다.
import { Outlet, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './Layout.css';

const Layout = ({ user, isAdmin }) => {
  // [수정] 사용하지 않는 useNavigate 훅 호출을 삭제합니다.
  // const navigate = useNavigate();

  const handleLogout = async () => {
    // 페이지 이동은 App.js의 상태 변화가 알아서 처리해 줄 것입니다.
    await supabase.auth.signOut();
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="logo">
          {/* 로고가 보이지 않도록 Link만 남겨둡니다. */}
          <Link to="/"></Link>
        </div>
        <nav className="app-nav">
          <Link to="/">내 시간표</Link>
          {isAdmin && (
            <Link to="/admin">관리자 페이지</Link>
          )}
        </nav>
        <button onClick={handleLogout} className="logout-btn">로그아웃</button>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;