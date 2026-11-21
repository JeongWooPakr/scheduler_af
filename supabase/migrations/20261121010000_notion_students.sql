-- 노션 "학생 상담 리스트" 저장본 (notion-students 함수가 채웁니다)
create table if not exists public.notion_students (
  page_id      text primary key,
  name         text not null,
  raw_title    text,
  mentor       text,
  url          text,
  last_edited  timestamptz,
  basic_info   text,
  sessions     jsonb not null default '[]'::jsonb,  -- [{date, note, todoDone, todoTotal}]
  synced_at    timestamptz not null default now()
);

alter table public.notion_students enable row level security;

drop policy if exists "notion_students admin read" on public.notion_students;
create policy "notion_students admin read" on public.notion_students
  for select using (public.is_admin());
