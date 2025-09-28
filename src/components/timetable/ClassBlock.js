import React from 'react';

const formatTime = (time) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? '오후' : '오전';
  const hour12 = ((h + 11) % 12) + 1;
  return `${suffix} ${hour12}:${String(m).padStart(2, '0')}`;
};

const t2m = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const computeBlockRect = (cls, rowMeta, colMeta) => {
  const s = t2m(cls.start);
  const e = t2m(cls.end);
  let top = null;
  let height = 0;
  rowMeta.forEach((row) => {
    if (!row) return;
    const { startMin, endMin, top: rTop, height: rH } = row;
    const os = Math.max(s, startMin);
    const oe = Math.min(e, endMin);
    if (os < oe) {
      const fracStart = (os - startMin) / (endMin - startMin);
      const fracLen = (oe - os) / (endMin - startMin);
      if (top === null) top = rTop + fracStart * rH;
      height += fracLen * rH;
    }
  });
  if (top === null) return null;
  const col = colMeta[cls.day];
  if (!col) return null;
  return { top, height, left: col.left, width: col.width };
};

const ClassBlock = ({ cls, rowMeta, colMeta, onDelete }) => {
  const rect = computeBlockRect(cls, rowMeta, colMeta);
  if (!rect) return null;

  return (
    <div
      className="class-block"
      style={{
        top: rect.top,
        left: rect.left,
        height: rect.height,
        width: rect.width,
        background: cls.color,
      }}
    >
      <button className="delete-btn" onClick={() => onDelete(cls.id)}>×</button>
      <strong>{cls.title}</strong>
      <br />
      {formatTime(cls.start)} ~ {formatTime(cls.end)}
    </div>
  );
};

export default ClassBlock;
