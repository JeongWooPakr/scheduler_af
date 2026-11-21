import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './StudentInfo.css';

// 확인 시각 (교시 시작 + 5분 여유)
const PRESETS = [
  { slot: 'morning', label: '아침 09:05', time: '09:05' },
  { slot: 'lunch', label: '점심 후 13:35', time: '13:35' },
  { slot: 'dinner', label: '저녁 후 19:05', time: '19:05' },
];

const SLOT_LABEL = { morning: '아침', lunch: '점심 후', dinner: '저녁 후', manual: '수동' };

const GROUPS = [
  { key: '미등원', title: '미등원', tone: 'danger' },
  { key: '외출', title: '외출 중', tone: 'warn' },
  { key: '좌석없음', title: 'Awesome Manager 좌석을 못 찾음', tone: 'muted' },
];

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const AttendanceCheck = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_checks')
      .select('check_time, slot, student_name, seat_no, result')
      .eq('check_date', todayKst())
      .order('checked_at', { ascending: true });
    setHistory(data || []);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const runCheck = async (preset) => {
    setLoading(true);
    setError('');
    const body = preset ? { time: preset.time, slot: preset.slot } : { slot: 'manual' };
    const { data, error: invokeError } = await supabase.functions.invoke('attendance-check', { body });
    setLoading(false);
    if (invokeError || data?.error) {
      setError(data?.error || invokeError.message);
      return;
    }
    setResult(data);
  };

  const rows = result?.rows || [];
  const expected = rows.filter((r) => r.result !== '외부일정');
  const present = expected.filter((r) => r.result === '등원');

  // 오늘 기록: 확인 회차별 미등원 명단
  const historyByRun = history.reduce((acc, row) => {
    const key = `${row.check_time} ${SLOT_LABEL[row.slot] || row.slot}`;
    if (!acc[key]) acc[key] = { total: 0, missing: [] };
    acc[key].total += 1;
    if (row.result === '미등원') acc[key].missing.push(`${row.seat_no ?? '-'} ${row.student_name}`);
    return acc;
  }, {});

  return (
    <div className="info-page">
      <div className="info-toolbar">
        <h2>미등원 확인</h2>
        <button className="info-btn" onClick={() => runCheck(null)} disabled={loading}>
          지금 확인
        </button>
        {PRESETS.map((preset) => (
          <button key={preset.slot} className="info-btn secondary" onClick={() => runCheck(preset)} disabled={loading}>
            {preset.label} 기준
          </button>
        ))}
      </div>
      <p className="info-message subtle">
        관리형으로 체크된 학생 중, 확인 시각에 시간표가 비어 있는데(학원에 있어야 하는 시간) Awesome Manager에서 "입실"이 아닌 학생을 보여 줍니다.
        시각 버튼은 오늘 요일 시간표 기준이고, 좌석 상태는 지금 상태입니다.
      </p>

      {loading && <p className="info-message">Awesome Manager에서 좌석 상태를 가져오는 중입니다...</p>}
      {error && <p className="info-message error">확인 실패: {error}</p>}

      {result && !loading && (
        <>
          <div className="att-summary">
            <span>{result.date} ({result.day}) {result.time} 기준</span>
            <span>등원 대상 {expected.length}명</span>
            <span className="ok">등원 {present.length}명</span>
            <span className="danger">미등원 {expected.filter((r) => r.result === '미등원').length}명</span>
            <span>외부 일정 {rows.length - expected.length}명</span>
          </div>

          {GROUPS.map((group) => {
            const list = rows.filter((r) => r.result === group.key);
            if (!list.length) return null;
            return (
              <section key={group.key} className={`att-group ${group.tone}`}>
                <h3>
                  {group.title} ({list.length})
                </h3>
                <table className="info-table">
                  <thead>
                    <tr>
                      <th>좌석</th>
                      <th>이름</th>
                      <th>좌석 상태</th>
                      <th>학생 연락처</th>
                      <th>학부모 연락처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.user_id}>
                        <td>{r.seat_no ?? '-'}</td>
                        <td className="name">
                          {r.name}
                          {r.af_name && r.af_name !== r.name ? ` (좌석: ${r.af_name})` : ''}
                        </td>
                        <td>{r.af_state || '없음'}</td>
                        <td>{r.student_phone || '-'}</td>
                        <td>{r.parent_phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

          {expected.length > 0 && expected.length === present.length && (
            <p className="info-message">등원 대상 학생이 모두 입실했습니다.</p>
          )}
        </>
      )}

      <section className="att-history">
        <h3>오늘 확인 기록</h3>
        {Object.keys(historyByRun).length === 0 ? (
          <p className="info-message subtle">아직 기록이 없습니다. 자동 확인이 켜지면 여기에 쌓입니다.</p>
        ) : (
          <ul>
            {Object.entries(historyByRun).map(([run, info]) => (
              <li key={run}>
                <strong>{run}</strong> · 대상 {info.total}명 · 미등원 {info.missing.length}명
                {info.missing.length > 0 && <div className="att-missing">{info.missing.join(', ')}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AttendanceCheck;
