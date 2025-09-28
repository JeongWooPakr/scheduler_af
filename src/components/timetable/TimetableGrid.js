import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';
import ClassBlock from './ClassBlock'; // 수업 블록 컴포넌트를 불러옵니다.

const pxPerMinute = 2;

// "HH:mm" 형식의 시간을 분으로 변환하는 함수
const t2m = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const TimetableGrid = ({ periods, days, classes, deleteClass }) => {
  const containerRef = useRef(null);
  const dayThRefs = useRef({});
  const rowRefs = useRef([]);
  const [rowMeta, setRowMeta] = useState([]);
  const [colMeta, setColMeta] = useState({});
  const [ready, setReady] = useState(false);

  // 시간표의 행과 열의 크기와 위치를 계산하는 함수
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const crect = container.getBoundingClientRect();

    const rows = periods.map((p, i) => {
      const el = rowRefs.current[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { startMin: t2m(p.start), endMin: t2m(p.end), top: r.top - crect.top, height: r.height };
    });

    const cols = {};
    days.forEach((d) => {
      const th = dayThRefs.current[d];
      if (!th) return;
      const r = th.getBoundingClientRect();
      cols[d] = { left: r.left - crect.left, width: r.width };
    });

    setRowMeta(rows);
    setColMeta(cols);
    setReady(true);
  }, [periods, days]);

  // 컴포넌트가 처음 렌더링되거나 창 크기가 바뀔 때 크기를 다시 계산
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]); // measure 함수가 변경될 때만 이 효과를 다시 실행

  return (
    <div className="grid-container" ref={containerRef}>
      <table className="timetable">
        <thead>
          <tr>
            <th>교시</th>
            {days.map((d) => (
              <th key={d} ref={(el) => (dayThRefs.current[d] = el)}>
                {d}
              </th>
            ))}
            <th>시간</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p, idx) => {
            const duration = t2m(p.end) - t2m(p.start);
            return (
              <tr
                key={idx}
                ref={(el) => (rowRefs.current[idx] = el)}
                style={{ height: `${duration * pxPerMinute}px` }}
              >
                <td>{p.name}</td>
                {days.map((day) => (
                  <td key={day}></td>
                ))}
                <td>
                  {p.start} ~ {p.end}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 크기 계산이 완료되면 수업 블록들을 렌더링 */}
      {ready &&
        classes.map((cls) => (
          <ClassBlock
            key={cls.id}
            cls={cls}
            rowMeta={rowMeta}
            colMeta={colMeta}
            onDelete={deleteClass}
          />
        ))}
    </div>
  );
};

export default TimetableGrid;
