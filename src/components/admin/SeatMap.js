import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { CUTLINE } from './conductRules';
import './StudentInfo.css';

// Awesome Manager 좌석 배치도를 그대로 그립니다. 좌석 위치는 AF의 seat_x / seat_y(픽셀)를 씁니다.
const SEAT_W = 74;
const SEAT_H = 56;
const MIN_SCALE = 0.7; // 휴대폰에서 이보다 작아지면 옆으로 스크롤

const SeatMap = ({ students, seatNoById, renderBadge, seatClass, selectedId, onPick }) => {
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('attendance-check', {
      body: { action: 'layout' },
    });
    setLoading(false);
    if (invokeError || data?.error) {
      let detail = data?.error || invokeError?.message;
      try {
        const body = await invokeError?.context?.json?.();
        if (body?.error) detail = body.error;
      } catch (e) {
        // 본문이 없으면 기본 메시지
      }
      setError(`좌석 배치도를 불러오지 못했습니다: ${detail}`);
      return;
    }
    setLayout(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 좌석이 있는 방만 보이도록 도면을 잘라냅니다.
  const bounds = useMemo(() => {
    const seats = layout?.seats || [];
    if (!seats.length) return { x0: 0, y0: 0, w: 0, h: 0 };
    const seatRooms = new Set(seats.map((s) => String(s.room)));
    const boxes = [
      ...seats.map((s) => ({ x: s.x, y: s.y, w: SEAT_W, h: SEAT_H })),
      ...(layout.rooms || []).filter((r) => seatRooms.has(String(r.no))),
    ];
    const pad = 10;
    const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  }, [layout]);
  const at = (b) => ({ left: b.x - bounds.x0, top: b.y - bounds.y0 });

  // 화면 폭에 맞게 줄이기
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || !bounds.w) return undefined;
    const fit = () => setScale(Math.max(MIN_SCALE, Math.min(1, el.clientWidth / bounds.w)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bounds.w]);

  // 좌석 → 학생: 학생 정보의 좌석 번호가 우선, 없으면 AF 이름으로
  const studentBySeat = useMemo(() => {
    const byName = new Map(students.filter((s) => s.name).map((s) => [s.name.replace(/\s/g, ''), s]));
    const bySeatNo = new Map();
    students.forEach((s) => {
      const no = seatNoById.get(s.id);
      if (no) bySeatNo.set(Number(no), s);
    });
    const map = new Map();
    (layout?.seats || []).forEach((seat) => {
      const fromName = seat.name ? byName.get(seat.name.replace(/\s/g, '')) : null;
      const fromNo = bySeatNo.get(seat.seatNo);
      // AF에 앉은 사람 이름이 있으면 그 사람, 없으면 학생 정보상 좌석 주인
      map.set(seat.seatNo, fromName || (!seat.name ? fromNo : null) || null);
    });
    return map;
  }, [layout, students, seatNoById]);

  if (error)
    return (
      <div className="seatmap-status">
        <p className="info-message">{error}</p>
        <button className="info-btn secondary small" onClick={load}>
          다시 시도
        </button>
      </div>
    );
  if (!layout) return <p className="info-message subtle">좌석 배치도를 불러오는 중입니다...</p>;

  return (
    <div className="seatmap">
      <div className="seatmap-tools">
        <span className="info-message subtle">좌석을 누르면 그 학생에게 벌점을 줄 수 있어요.</span>
        <button className="info-btn secondary small" onClick={load} disabled={loading}>
          {loading ? '불러오는 중...' : '배치도 새로고침'}
        </button>
      </div>
      <div className="seatmap-scroll" ref={wrapRef}>
        <div className="seatmap-sizer" style={{ width: bounds.w * scale, height: bounds.h * scale }}>
          <div
            className="seatmap-canvas"
            style={{ width: bounds.w, height: bounds.h, transform: `scale(${scale})` }}
          >
            {(layout.rooms || []).map((b, i) => (
              <div key={`r${i}`} className="seatmap-room" style={{ ...at(b), width: b.w, height: b.h }} />
            ))}
            {(layout.walls || []).map((b, i) => (
              <div key={`w${i}`} className="seatmap-wall" style={{ ...at(b), width: b.w, height: b.h }} />
            ))}
            {(layout.etc || []).map((b, i) => (
              <div key={`e${i}`} className="seatmap-etc" style={{ ...at(b), width: b.w, height: b.h }}>
                {b.name}
              </div>
            ))}
            {(layout.seats || []).map((seat) => {
              const student = studentBySeat.get(seat.seatNo);
              const cls = ['seatmap-seat'];
              if (!student) cls.push(seat.name ? 'unknown' : 'empty');
              else {
                const extra = seatClass?.(student);
                if (extra) cls.push(extra);
                if (student.id === selectedId) cls.push('selected');
              }
              if (seat.state === '입실') cls.push('in');
              else if (seat.state === '외출') cls.push('out');
              return (
                <button
                  key={seat.seatNo}
                  type="button"
                  className={cls.join(' ')}
                  style={{ ...at(seat), width: SEAT_W, height: SEAT_H }}
                  disabled={!student}
                  title={student ? `${seat.seatNo}번 ${student.name}` : seat.name ? `${seat.seatNo}번 ${seat.name} (명단에 없음)` : `${seat.seatNo}번 빈 좌석`}
                  onClick={() => student && onPick(student, seat)}
                >
                  <span className="seat-no">{seat.seatNo}</span>
                  <span className="seat-name">{student?.name || seat.name || ''}</span>
                  {student && <span className="seat-badge">{renderBadge?.(student)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="seatmap-legend">
        <span>
          <i className="lg in" /> 입실
        </span>
        <span>
          <i className="lg out" /> 외출
        </span>
        <span>
          <i className="lg warn" /> 벌점 {CUTLINE / 2}점 이상
        </span>
        <span>
          <i className="lg over" /> 커트라인 초과
        </span>
      </div>
    </div>
  );
};

export default SeatMap;
