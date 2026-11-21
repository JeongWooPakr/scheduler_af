-- 학생 정보 + 등원 확인 기록
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행합니다. 여러 번 실행해도 안전합니다.

-- 관리자 여부는 기존 public.is_admin() 함수(profiles.role = 'admin')를 그대로 씁니다.

-- 학생 정보 (학생 1명당 1행)
create table if not exists public.student_info (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  seat_no       integer,
  school        text,
  grade         text,
  gender        text check (gender in ('남', '여')),
  naesin_band   text,          -- 내신 등급대 (예: "1~2등급")
  notes         text,          -- 특징
  student_phone text,
  parent_phone  text,
  is_managed    boolean not null default false,  -- 관리형 여부 (등원 확인·문자 대상)
  updated_at    timestamptz not null default now()
);

create index if not exists student_info_seat_no_idx on public.student_info (seat_no);

alter table public.student_info enable row level security;

drop policy if exists "student_info admin all" on public.student_info;
create policy "student_info admin all" on public.student_info
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_info_touch on public.student_info;
create trigger student_info_touch
  before update on public.student_info
  for each row execute function public.touch_updated_at();

-- 등원 확인 기록 (자동/수동 확인 때마다 학생별로 1행)
create table if not exists public.attendance_checks (
  id           bigserial primary key,
  checked_at   timestamptz not null default now(),
  check_date   date not null,          -- 한국 날짜
  check_time   text not null,          -- "09:05" 같은 한국 시각
  slot         text not null,          -- morning / lunch / dinner / manual
  user_id      uuid references public.profiles(id) on delete set null,
  student_name text,
  seat_no      integer,
  af_state     text,                   -- Awesome Manager 상태 (입실/퇴실/외출/없음)
  result       text not null           -- 등원 / 미등원 / 외출 / 좌석없음
);

create index if not exists attendance_checks_date_idx on public.attendance_checks (check_date, slot);

alter table public.attendance_checks enable row level security;

drop policy if exists "attendance_checks admin read" on public.attendance_checks;
create policy "attendance_checks admin read" on public.attendance_checks
  for select using (public.is_admin());
