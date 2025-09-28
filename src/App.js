import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

import Login from './components/Login';
// [핵심 수정] Timetable 폴더 경로를 모두 소문자 'timetable'로 변경했습니다.
import Timetable from './components/timetable/Timetable';

import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container">
      {!session ? (
        <Login />
      ) : (
        <Timetable key={session.user.id} user={session.user} />
      )}
    </div>
  );
}

export default App;

