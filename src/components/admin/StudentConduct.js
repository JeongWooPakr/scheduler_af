import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { CUTLINE, PENALTIES, PENALTY_POINTS, todayKst, weekStartKst } from './conductRules';
import './StudentInfo.css';

// 상벌점 탭: 벌점 입력, 학생별 누적 확인, 기록 삭제(잘못 누른 경우)
const StudentConduct = ({ students }) => {
  const [records, setRecords] = useState([]);
  const [managedIds, setManagedIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [managedOnly, setManagedOnly] = useState(true);
  const [targetId, setTargetId] = useState('');
  const [date, setDate] = useState(todayKst());
  const [note, setNote] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: infos }] = await Promise.all([
      supabase
        .from('student_points')
        .select('id, user_id, kind, points, note, occurred_on, created_at')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('student_info').select('user_id, is_managed'),
    ]);
    if (error) setMessage(`상벌점을 불러오지 못했습니다: ${error.message}`);
    setRecords(data || []);
    setManagedIds(new Set((infos || []).filter((i) => i.is_managed).map((i) => i.user_id)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
  const weekStart = weekStartKst();

  const summary = useMemo(() => {
    const map = new Map();
    students.forEach((s) => map.set(s.id, { penalty: 0, merit: 0, week: 0, last: null }));
    records.forEach((r) => {
      const row = map.get(r.user_id);
      if (!row) return;
      const pts = Number(r.points);
      if (r.kind === '상점') row.merit += pts;
      else {
        row.penalty += pts;
        if (r.occurred_on >= weekStart) row.week += pts;
        if (!row.last) row.last = r;
      }
    });
    return map;
  }, [records, students, weekStart]);

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return students
      .filter((s) => !managedOnly || !managedIds || managedIds.has(s.id))
      .filter((s) => !keyword || (s.name || '').toLowerCase().includes(keyword))
      .map((s) => ({ student: s, ...summary.get(s.id) }))
      .sort((a, b) => b.penalty - a.penalty || (a.student.name || '').localeCompare(b.student.name || ''));
  }, [students, summary, search, managedOnly, managedIds]);

  const addPenalty = async (kind) => {
    if (!targetId) {
      setMessage('먼저 학생을 고르세요.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('student_points').insert({
      user_id: targetId,
      kind,
      points: PENALTY_POINTS[kind],
      note: note.trim() || null,
      occurred_on: date,
    });
    setBusy(false);
    if (error) {
      setMessage(`저장 실패: ${error.message}`);
      return;
    }
    setMessage(`${nameById.get(targetId)} 학생에게 ${kind} 벌점 ${PENALTY_POINTS[kind]}점을 기록했습니다.`);
    setNote('');
    load();
  };

  const removeRecord = async (record) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`${record.occurred_on} ${record.kind} ${record.points}점 기록을 지울까요?`)) return;
    const { error } = await supabase.from('student_points').delete().eq('id', record.id);
    if (error) {
      setMessage(`삭제 실패: ${error.message}`);
      return;
    }
    load();
  };

  if (loading) return <div>상벌점을 불러오는 중입니다...</div>;

  const detailRecords = detailId ? records.filter((r) => r.user_id === detailId) : [];

  return (
    <div className="info-page">
      <div className="info-toolbar">
        <h2>상벌점</h2>
        <span className="info-message subtle">
          {PENALTIES.map((p) => `${p.kind} ${p.points}`).join(' · ')} · 커트라인 {CUTLINE}점 · 한 주 벌점 0이면 상점 1점(월요일 자동)
        </span>
      </div>

      <section className="conduct-entry">
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">학생 선택</option>
          {students
            .filter((s) => !managedOnly || !managedIds || managedIds.has(s.id))
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          className="conduct-note"
          placeholder="메모 (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {PENALTIES.map((p) => (
          <button key={p.kind} className="info-btn danger-btn" disabled={busy} onClick={() => addPenalty(p.kind)}>
            {p.kind} +{p.points}
          </button>
        ))}
      </section>
      {message && <p className="info-message">{message}</p>}

      <div className="info-toolbar">
        <input
          type="search"
          className="student-search-input info-search"
          placeholder="학생 이름 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="info-check">
          <input type="checkbox" checked={managedOnly} onChange={(e) => setManagedOnly(e.target.checked)} />
          관리형만 보기
        </label>
      </div>

      <div className="info-table-wrap">
        <table className="info-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>벌점 누적</th>
              <th>이번 주 벌점</th>
              <th>상점</th>
              <th>최근 벌점</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.student.id}>
                <tr className={row.penalty >= CUTLINE ? 'over-cutline' : ''}>
                  <td className="name">{row.student.name}</td>
                  <td>
                    {row.penalty}점{row.penalty >= CUTLINE ? ' (커트라인 초과)' : ''}
                  </td>
                  <td>{row.week}점</td>
                  <td>{row.merit}점</td>
                  <td>{row.last ? `${row.last.occurred_on} ${row.last.kind}` : '-'}</td>
                  <td>
                    <button
                      className="info-btn secondary small"
                      onClick={() => setDetailId(detailId === row.student.id ? null : row.student.id)}
                    >
                      {detailId === row.student.id ? '닫기' : '기록 보기'}
                    </button>
                  </td>
                </tr>
                {detailId === row.student.id && (
                  <tr className="preview-row">
                    <td colSpan={6}>
                      {detailRecords.length === 0 ? (
                        <p className="info-message subtle">기록이 없습니다.</p>
                      ) : (
                        <ul className="conduct-history">
                          {detailRecords.map((r) => (
                            <li key={r.id}>
                              {r.occurred_on} · {r.kind} {r.kind === '상점' ? '+' : ''}
                              {Number(r.points)}점{r.note ? ` · ${r.note}` : ''}{' '}
                              <button className="link-btn" onClick={() => removeRecord(r)}>
                                지우기
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="student-search-empty">표시할 학생이 없습니다.</p>}
      </div>
    </div>
  );
};

export default StudentConduct;
