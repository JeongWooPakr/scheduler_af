// 상벌점 규칙 (여기 숫자만 바꾸면 화면 전체에 적용됩니다)
export const PENALTIES = [
  { kind: '지각', points: 1 },
  { kind: '졸음', points: 0.5 },
  { kind: '게임', points: 10 },
  { kind: 'SNS', points: 10 },
  { kind: '떠들기', points: 0.5 },
];

export const PENALTY_POINTS = Object.fromEntries(PENALTIES.map((p) => [p.kind, p.points]));

// 벌점 누적 커트라인
export const CUTLINE = 30;

export const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 한국 날짜 기준 이번 주 월요일 (YYYY-MM-DD)
export const weekStartKst = () => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const diff = (d.getUTCDay() + 6) % 7; // 월요일 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
};
