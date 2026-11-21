import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { PENALTY_POINTS } from './conductRules';
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

// 요약 칸을 누르면 해당 명단만 보여 줍니다.
const FILTERS = [
  { key: 'expected', label: '등원 대상', tone: '', match: (r) => r.result !== '외부일정' },
  { key: '등원', label: '등원', tone: 'ok', match: (r) => r.result === '등원' },
  { key: '미등원', label: '미등원', tone: 'danger', match: (r) => r.result === '미등원' },
  { key: '외출', label: '외출', tone: 'warn', match: (r) => r.result === '외출' },
  { key: '외부일정', label: '외부 일정', tone: 'muted', match: (r) => r.result === '외부일정' },
  { key: '좌석없음', label: '좌석 못 찾음', tone: 'muted', match: (r) => r.result === '좌석없음' },
];

const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const AttendanceCheck = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lateIds, setLateIds] = useState(new Set());
  const [lateMessage, setLateMessage] = useState('');
  const [lateDone, setLateDone] = useState(new Set()); // 이 날짜에 이미 지각 처리된 학생
  const [activeSlot, setActiveSlot] = useState(null);

  const loadLateDone = useCallback(async (date) => {
    const { data } = await supabase.from('student_points').select('user_id').eq('kind', '지각').eq('occurred_on', date);
    setLateDone(new Set((data || []).map((r) => r.user_id)));
  }, []);

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
    setActiveSlot(preset ? preset.slot : 'manual');
    const body = preset ? { time: preset.time, slot: preset.slot } : { slot: 'manual' };
    const { data, error: invokeError } = await supabase.functions.invoke('attendance-check', { body });
    setLoading(false);
    if (invokeError || data?.error) {
      setError(data?.error || invokeError.message);
      return;
    }
    setResult(data);
    setSelected(null);
    setLateIds(new Set());
    setLateMessage('');
    loadLateDone(data.date || todayKst());
  };

  const toggleLate = (id) => {
    setLateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 체크한 미등원 학생을 지각으로 표시 (같은 날 이미 지각이면 건너뜀)
  const markLate = async () => {
    const ids = [...lateIds];
    if (!ids.length) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`${ids.length}명을 지각으로 표시하겠습니까? (벌점 ${PENALTY_POINTS['지각']}점씩)`)) return;
    const date = result?.date || todayKst();
    const { data: existing } = await supabase
      .from('student_points')
      .select('user_id')
      .eq('kind', '지각')
      .eq('occurred_on', date)
      .in('user_id', ids);
    const already = new Set((existing || []).map((r) => r.user_id));
    const toInsert = ids.filter((id) => !already.has(id));
    if (toInsert.length) {
      const { error: insertError } = await supabase.from('student_points').insert(
        toInsert.map((id) => ({
          user_id: id,
          kind: '지각',
          points: PENALTY_POINTS['지각'],
          note: `${result?.time || ''} 등원 확인`,
          occurred_on: date,
        }))
      );
      if (insertError) {
        setLateMessage(`지각 기록 실패: ${insertError.message}`);
        return;
      }
    }
    setLateIds(new Set());
    setLateDone((prev) => new Set([...prev, ...ids]));
    setLateMessage(
      `${toInsert.length}명 지각 처리했습니다.${already.size ? ` (${already.size}명은 오늘 이미 지각으로 기록돼 있어 건너뜀)` : ''}`
    );
  };

  const rows = result?.rows || [];
  const expected = rows.filter((r) => r.result !== '외부일정');
  const present = expected.filter((r) => r.result === '등원');
  const selectedFilter = FILTERS.find((f) => f.key === selected);

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
        <h2>등원 확인</h2>
        <button
          className={`info-btn ${activeSlot === 'manual' ? '' : 'secondary'}`}
          onClick={() => runCheck(null)}
          disabled={loading}
        >
          지금 확인
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.slot}
            className={`info-btn ${activeSlot === preset.slot ? '' : 'secondary'}`}
            onClick={() => runCheck(preset)}
            disabled={loading}
          >
            {preset.label} 기준
          </button>
        ))}
      </div>
      <p className="info-message subtle">
        미등원 명단에서 학생을 체크하고 "지각으로 표시"를 누르면 벌점이 쌓입니다. 관리형으로 체크된 학생 중, 확인 시각에 시간표가 비어 있는데(학원에 있어야 하는 시간) Awesome Manager에서 "입실"이 아닌 학생을 보여 줍니다.
        시각 버튼은 오늘 요일 시간표 기준이고, 좌석 상태는 지금 상태입니다.
      </p>

      {loading && <p className="info-message">Awesome Manager에서 좌석 상태를 가져오는 중입니다...</p>}
      {error && <p className="info-message error">확인 실패: {error}</p>}

      {result && !loading && (
        <>
          <div className="att-summary">
            <span>{result.date} ({result.day}) {result.time} 기준</span>
            {FILTERS.map((f) => {
              const count = rows.filter(f.match).length;
              if (!count && ['외출', '좌석없음'].includes(f.key)) return null;
              return (
                <button
                  key={f.key}
                  className={`att-chip ${f.tone} ${selected === f.key ? 'active' : ''}`}
                  onClick={() => setSelected(selected === f.key ? null : f.key)}
                >
                  {f.label} {count}명
                </button>
              );
            })}
          </div>
          <p className="info-message subtle">숫자를 누르면 명단이 나옵니다. 다시 누르면 기본 화면(미등원·외출 명단)으로 돌아갑니다.</p>

          {selectedFilter ? (
            <AttendanceTable
              title={`${selectedFilter.label} (${rows.filter(selectedFilter.match).length})`}
              tone={selectedFilter.tone}
              list={rows.filter(selectedFilter.match)}
              lateIds={lateIds}
              lateDone={lateDone}
              onToggleLate={toggleLate}
            />
          ) : (
            GROUPS.map((group) => {
              const list = rows.filter((r) => r.result === group.key);
              if (!list.length) return null;
              return (
                <AttendanceTable
                  key={group.key}
                  title={`${group.title} (${list.length})`}
                  tone={group.tone}
                  list={list}
                  lateIds={lateIds}
                  lateDone={lateDone}
                  onToggleLate={toggleLate}
                />
              );
            })
          )}

          {lateIds.size > 0 && (
            <div className="late-bar">
              <span>미등원 {lateIds.size}명 선택됨</span>
              <button className="info-btn danger-btn" onClick={markLate}>
                지각으로 표시
              </button>
              <button className="info-btn secondary" onClick={() => setLateIds(new Set())}>
                선택 해제
              </button>
            </div>
          )}
          {lateMessage && <p className="info-message">{lateMessage}</p>}

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

const AttendanceTable = ({ title, tone, list, lateIds, lateDone, onToggleLate }) => {
  const canMark = list.some((r) => r.result === '미등원');
  return (
  <section className={`att-group ${tone}`}>
    <h3>{title}</h3>
    {list.length === 0 ? (
      <p className="info-message subtle">해당 학생이 없습니다.</p>
    ) : (
      <table className="info-table">
        <thead>
          <tr>
            {canMark && <th>지각</th>}
            <th>좌석</th>
            <th>이름</th>
            <th>결과</th>
            <th>좌석 상태</th>
            <th>외부 일정</th>
            <th>학생 연락처</th>
            <th>학부모 연락처</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.user_id}>
              {canMark && (
                <td className="center">
                  {r.result === '미등원' &&
                    (lateDone.has(r.user_id) ? (
                      <span className="late-done">지각 처리됨</span>
                    ) : (
                      <input type="checkbox" checked={lateIds.has(r.user_id)} onChange={() => onToggleLate(r.user_id)} />
                    ))}
                </td>
              )}
              <td>{r.seat_no ?? '-'}</td>
              <td className="name">
                {r.name}
                {r.af_name && r.af_name !== r.name ? ` (좌석: ${r.af_name})` : ''}
              </td>
              <td>{r.result}</td>
              <td>{r.af_state || '없음'}</td>
              <td>{r.busy_title || '-'}</td>
              <td>{r.student_phone || '-'}</td>
              <td>{r.parent_phone || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
  );
};

export default AttendanceCheck;
