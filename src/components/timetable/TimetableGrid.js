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

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    // [수정] grid-container가 스크롤을 담당하도록 합니다.
    <div className="grid-container">
      {/* [핵심 추가] 테이블과 블록을 감싸는 '캔버스' 역할을 할 div를 추가합니다. */}
      <div className="timetable-canvas" ref={containerRef}>
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
    </div>
  );
};

export default TimetableGrid;
