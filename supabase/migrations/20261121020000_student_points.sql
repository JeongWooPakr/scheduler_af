-- 상벌점 (Supabase SQL Editor에서 실행. 여러 번 실행해도 안전합니다)
create extension if not exists pg_cron;

create table if not exists public.student_points (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('지각', '졸음', '게임', 'SNS', '떠들기', '상점')),
  points       numeric(5,1) not null,          -- 벌점은 양수, 상점도 양수 (kind로 구분)
  note         text,
  occurred_on  date not null default ((now() at time zone 'Asia/Seoul')::date),
  week_start   date,                           -- 상점: 대상 주의 월요일
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists student_points_user_idx on public.student_points (user_id, occurred_on);
create unique index if not exists student_points_merit_week_uniq on public.student_points (user_id, week_start) where kind = '상점';

alter table public.student_points enable row level security;
drop policy if exists "student_points admin all" on public.student_points;
create policy "student_points admin all" on public.student_points
  for all using (public.is_admin()) with check (public.is_admin());

-- 지난주(월~일, 한국 날짜)에 벌점이 없는 관리형 학생에게 상점 1점
create or replace function public.award_weekly_merits(p_week_start date default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_week date := coalesce(p_week_start, date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date - 7);
  v_count integer;
begin
  insert into public.student_points (user_id, kind, points, note, occurred_on, week_start, created_by)
  select si.user_id, '상점', 1, v_week || ' 주 벌점 없음', v_week + 6, v_week, null
  from public.student_info si
  where si.is_managed
    and not exists (
      select 1 from public.student_points sp
      where sp.user_id = si.user_id and sp.kind <> '상점'
        and sp.occurred_on between v_week and v_week + 6)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;
revoke execute on function public.award_weekly_merits(date) from public, anon, authenticated;

-- 매주 월요일 00:10 (한국) = 일요일 15:10 UTC
select cron.unschedule(jobid) from cron.job where jobname = 'award-weekly-merits';
select cron.schedule('award-weekly-merits', '10 15 * * 0', 'select public.award_weekly_merits()');
