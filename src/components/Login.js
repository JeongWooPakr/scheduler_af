import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css'; // 새로 만들 CSS 파일을 불러옵니다.

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      const email = `${phoneDigits}@study.com`;
      const password = phoneDigits;

      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;
      // 로그인 성공 알림은 굳이 필요 없으므로 제거했습니다.
    } catch (error) {
      alert('휴대폰 번호 4자리를 다시 확인해주세요.');
      console.error('Login Error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Font Awesome 아이콘을 사용하기 위해, public/index.html 파일 <head> 태그 안에 아래 링크를 추가해주세요.
    // <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
    <div className="login-container">
      <div className="text sign-in" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <h2>어썸팩토리 철산점</h2>
        <p>시간표 관리 시스템에 오신 것을 환영합니다!</p>
      </div>
      <div className="img sign-in" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        {/* 간단한 SVG 아이콘 추가 */}
        <svg xmlns="https://www.w3.org/2000/svg" fill="currentColor" className="bi bi-calendar-check" viewBox="0 0 16 16" style={{ width: "25vw", color: 'white' }}>
          <path d="M10.854 7.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 9.793l2.646-2.647a.5.5 0 0 1 .708 0z" />
          <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z" />
        </svg>
      </div>
      <div className="form-wrapper align-items-center" style={{ display: 'flex', justifyContent: 'center' }}>
        <form className="form sign-in" onSubmit={handleLogin} style={{ width: '100%', maxWidth: '400px' }}>
          <div className="input-group">
            <i className="fa-solid fa-phone"></i>
            <input
              type="tel"
              placeholder="휴대폰 뒷자리 4개"
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value)}
              maxLength="4"
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '등원하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
