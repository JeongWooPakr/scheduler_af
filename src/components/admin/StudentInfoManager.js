import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import './StudentInfo.css';

const EMPTY_INFO = {
  seat_no: '',
  school: '',
  grade: '',
  gender: '',
  naesin_band: '',
  notes: '',
  student_phone: '',
  parent_phone: '',
  is_managed: false,
};

// 처음 가져올 때 이 번호까지는 관리형으로 체크합니다.
const DEFAULT_MANAGED_MAX_SEAT = 50;

const StudentInfoManager = ({ students }) => {
  const [infoById, setInfoById] = useState({});
  const [savedIds, setSavedIds] = useState(new Set());
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [managedOnly, setManagedOnly] = useState(false);
  const [notionByName, setNotionByName] = useState({});
  const [notionStatus, setNotionStatus] = useState('');

  // 노션 "학생 상담 리스트"에서 기본정보·최근 상담을 읽어 옵니다. (읽기 전용)
  const loadNotion = async (round = 1) => {
    setNotionStatus(
      round === 1 ? '노션에서 상담 기록을 불러오는 중입니다...' : `노션에서 나머지 학생을 불러오는 중입니다... (${round}회차)`
    );
    const { data, error } = await supabase.functions.invoke('notion-students', { body: {} });
    if (error || data?.error) {
      let detail = data?.error || error.message;
      try {
        const body = await error?.context?.json?.();
        if (body?.error) detail = body.error;
      } catch (e) {
        // 응답 본문이 없으면 기본 메시지를 씁니다.
      }
      setNotionStatus(`노션 불러오기 실패: ${detail}`);
      return;
    }
    const map = {};
    (data.students || []).forEach((s) => {
      if (s.name) map[nameKey(s.name)] = s;
    });
    setNotionByName(map);
    if (data.pending > 0 && round < 6) {
      loadNotion(round + 1);
      return;
    }
    setNotionStatus(`노션 학생 ${Object.keys(map).length}명의 상담 기록을 불러왔습니다.`);
  };

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('student_info').select('*');
      if (error) {
        setMessage(`학생 정보를 불러오지 못했습니다: ${error.message}`);
      } else {
        const map = {};
        (data || []).forEach((row) => {
          map[row.user_id] = { ...EMPTY_INFO, ...nullToEmpty(row) };
        });
        setInfoById(map);
        setSavedIds(new Set((data || []).map((row) => row.user_id)));
      }
      setLoading(false);
    };
    load();
    loadNotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return students
      .map((student) => ({ student, info: infoById[student.id] || EMPTY_INFO }))
      .filter(({ student, info }) => {
        if (managedOnly && !info.is_managed) return false;
        if (!keyword) return true;
        const notion = notionByName[nameKey(student.name)] || {};
        return [student.name, notion.mentor, notion.basicInfo, notion.latestNote, String(info.seat_no || '')]
          .some((value) => (value || '').toLowerCase().includes(keyword));
      })
      .sort((a, b) => (Number(a.info.seat_no) || 999) - (Number(b.info.seat_no) || 999));
  }, [students, infoById, search, managedOnly, notionByName]);

  const updateField = (id, field, value) => {
    setInfoById((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_INFO), [field]: value } }));
    setDirtyIds((prev) => new Set(prev).add(id));
  };

  const handleSave = async () => {
    if (!dirtyIds.size) return;
    setBusy(true);
    setMessage('');
    const payload = [...dirtyIds].map((id) => {
      const info = infoById[id] || EMPTY_INFO;
      return {
        user_id: id,
        seat_no: info.seat_no === '' ? null : Number(info.seat_no),
        school: info.school || null,
        grade: info.grade || null,
        gender: info.gender || null,
        naesin_band: info.naesin_band || null,
        notes: info.notes || null,
        student_phone: info.student_phone || null,
        parent_phone: info.parent_phone || null,
        is_managed: !!info.is_managed,
      };
    });

    const { error } = await supabase.from('student_info').upsert(payload, { onConflict: 'user_id' });
    setBusy(false);
    if (error) {
      setMessage(`저장 실패: ${error.message}`);
      return;
    }
    setSavedIds((prev) => new Set([...prev, ...dirtyIds]));
    setDirtyIds(new Set());
    setMessage(`${payload.length}명의 정보를 저장했습니다.`);
  };

  // Awesome Manager 좌석에서 좌석 번호·학교·학년을 가져와 빈 칸만 채웁니다.
  const handleImport = async () => {
    setBusy(true);
    setMessage('Awesome Manager에서 좌석 정보를 가져오는 중입니다...');
    const { data, error } = await supabase.functions.invoke('attendance-check', {
      body: { action: 'seats' },
    });
    setBusy(false);

    if (error || data?.error) {
      setMessage(`가져오기 실패: ${data?.error || error.message}`);
      return;
    }

    const seatsByName = new Map((data.seats || []).map((seat) => [seat.name, seat]));
    let matched = 0;
    const changed = new Set();
    const next = { ...infoById };

    students.forEach((student) => {
      const seat = seatsByName.get((student.name || '').trim());
      if (!seat) return;
      matched += 1;
      const current = next[student.id] || EMPTY_INFO;
      const updated = { ...current };
      if (current.seat_no === '' || current.seat_no == null) updated.seat_no = seat.seatNo;
      if (!current.school && seat.school) updated.school = seat.school;
      if (!current.grade && seat.grade) updated.grade = seat.grade;
      if (!savedIds.has(student.id)) updated.is_managed = Number(updated.seat_no) <= DEFAULT_MANAGED_MAX_SEAT;
      if (JSON.stringify(updated) !== JSON.stringify(current)) {
        next[student.id] = updated;
        changed.add(student.id);
      }
    });

    setInfoById(next);
    setDirtyIds((prev) => new Set([...prev, ...changed]));
    setMessage(
      `이름이 맞는 학생 ${matched}명을 찾았고 ${changed.size}명의 빈 칸을 채웠습니다. 확인 후 "변경사항 저장"을 눌러 주세요.`
    );
  };

  if (loading) return <div>학생 정보를 불러오는 중입니다...</div>;

  return (
    <div className="info-page">
      <div className="info-toolbar">
        <h2>학생 정보 관리</h2>
        <input
          type="search"
          className="student-search-input info-search"
          placeholder="이름, 좌석, 멘토, 상담 내용 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="info-check">
          <input type="checkbox" checked={managedOnly} onChange={(e) => setManagedOnly(e.target.checked)} />
          관리형만 보기
        </label>
        <button className="info-btn secondary" onClick={() => loadNotion()}>
          노션 새로고침
        </button>
        <button className="info-btn secondary" onClick={handleImport} disabled={busy}>
          Awesome Manager에서 가져오기
        </button>
        <button className="info-btn" onClick={handleSave} disabled={busy || !dirtyIds.size}>
          {busy ? '처리 중...' : `변경사항 저장${dirtyIds.size ? ` (${dirtyIds.size})` : ''}`}
        </button>
      </div>
      {message && <p className="info-message">{message}</p>}
      {notionStatus && <p className="info-message subtle">{notionStatus}</p>}

      <div className="info-table-wrap">
        <table className="info-table">
          <thead>
            <tr>
              <th>관리형</th>
              <th>좌석</th>
              <th>이름</th>
              <th>멘토</th>
              <th>기본정보 (노션)</th>
              <th>최근 상담 (노션)</th>
              <th>학생 연락처</th>
              <th>학부모 연락처</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, info }) => (
              <tr key={student.id} className={dirtyIds.has(student.id) ? 'dirty' : ''}>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!!info.is_managed}
                    onChange={(e) => updateField(student.id, 'is_managed', e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    className="narrow"
                    type="number"
                    min="1"
                    value={info.seat_no ?? ''}
                    onChange={(e) => updateField(student.id, 'seat_no', e.target.value)}
                  />
                </td>
                <td className="name">{student.name}</td>
                <NotionCells notion={notionByName[nameKey(student.name)]} />
                <td>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={info.student_phone}
                    onChange={(e) => updateField(student.id, 'student_phone', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={info.parent_phone}
                    onChange={(e) => updateField(student.id, 'parent_phone', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="student-search-empty">표시할 학생이 없습니다.</p>}
      </div>
    </div>
  );
};

const NotionCells = ({ notion }) => {
  if (!notion) {
    return (
      <>
        <td className="muted">-</td>
        <td className="muted" colSpan={2}>
          노션에 같은 이름의 페이지가 없습니다
        </td>
      </>
    );
  }
  return (
    <>
      <td>{notion.mentor || '-'}</td>
      <td className="notion-text">{notion.basicInfo || '-'}</td>
      <td className="notion-text">
        {notion.latestDate ? (
          <details>
            <summary>
              <strong>{notion.latestDate}</strong> 상담 ({notion.sessionCount}회째){' '}
              <a href={notion.url} target="_blank" rel="noreferrer">
                노션 열기
              </a>
            </summary>
            {notion.latestNote || '(내용 없음)'}
          </details>
        ) : (
          <a href={notion.url} target="_blank" rel="noreferrer">
            노션 열기
          </a>
        )}
      </td>
    </>
  );
};

// "김 민 경"과 "김민경"을 같은 이름으로 봅니다.
function nameKey(name) {
  return (name || '').replace(/\s+/g, '');
}

function nullToEmpty(row) {
  const out = {};
  Object.keys(EMPTY_INFO).forEach((key) => {
    out[key] = row[key] == null ? EMPTY_INFO[key] : row[key];
  });
  return out;
}

export default StudentInfoManager;
