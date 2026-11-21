// 노션 "학생 상담 리스트"에서 학생별 기본정보와 최근 상담 내용을 가져오는 함수
//
// 필요한 Secrets: NOTION_TOKEN (노션 내부 통합 시크릿, 읽기 권한만)
// 노션 데이터베이스에 그 통합을 "연결"해 두어야 합니다.
//
// 노션은 초당 요청 수 제한이 있어서, 읽은 내용을 notion_students 표에 저장해 두고
// 수정 시각이 바뀐 페이지만 다시 읽습니다. 시간이 모자라면 pending > 0으로 돌려주고, 화면이 한 번 더 부릅니다.
//
// 반환: { students: [{ name, rawTitle, mentor, url, lastEdited, basicInfo, sessions, latestDate, latestNote,
//                      sessionCount, todoDone, todoTotal }], pending }

import { createClient } from "npm:@supabase/supabase-js@2";

const DATABASE_ID = "2dc887952fc68029b166d901bae031fa";
const NOTION_VERSION = "2022-06-28";
// 읽는 방식이 바뀌면 숫자를 올립니다. 저장본의 버전이 다르면 노션 수정 여부와 상관없이 다시 읽습니다.
const PARSER_VERSION = 2;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notion(path: string, init: RequestInit = {}, attempt = 0): Promise<any> {
  const token = Deno.env.get("NOTION_TOKEN");
  if (!token) throw new Error("NOTION_TOKEN Secret이 설정되지 않았습니다.");
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 429 && attempt < 6) {
    const wait = Number(res.headers.get("Retry-After") || "1");
    await res.body?.cancel();
    await sleep(Math.max(1, wait) * 1000);
    return notion(path, init, attempt + 1);
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("노션 데이터베이스를 찾지 못했습니다. '학생 상담 리스트'에 통합을 연결했는지 확인해 주세요.");
    }
    if (res.status === 401) throw new Error("NOTION_TOKEN이 올바르지 않습니다.");
    throw new Error(`노션 오류: ${data.message || res.status}`);
  }
  return data;
}

type RichText = { plain_text: string };
const plain = (rt: RichText[] | undefined) => (rt || []).map((t) => t.plain_text).join("");

// "(금) 이송헌", "( ) 표정윤", "김정원(중3)" -> "이송헌", "표정윤", "김정원"
function cleanName(title: string) {
  return title.replace(/^\s*\([^)]*\)\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// 8/17, 11.16, 2026-11-16, 11월 16일 같은 날짜 줄
const DATE_LINE = /^\s*(\d{4}[-./]\s*)?\d{1,2}\s*[/.월-]\s*\d{1,2}\s*일?\s*(\([^)]*\))?\s*:?\s*$/;

async function blockLines(blockId: string, depth = 0): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    for (const block of data.results) {
      const body = block[block.type] || {};
      const text = plain(body.rich_text);
      if (block.type === "divider") lines.push("---");
      else if (block.type === "to_do") lines.push(`${body.checked ? "☑" : "☐"} ${text}`);
      else if (block.type === "table_row") {
        lines.push(`§ ${(body.cells || []).map((cell: RichText[]) => plain(cell).trim()).join(" | ")}`);
      }
      else if (text) lines.push(text);
      // 토글·목록 안쪽도 한 단계까지 읽습니다.
      if (block.has_children && depth < 2 && block.type !== "child_page" && block.type !== "child_database") {
        lines.push(...(await blockLines(block.id, depth + 1)));
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return lines;
}

type Session = { date: string; note: string; todoDone: number; todoTotal: number };
type Material = {
  subject: string;
  title: string;
  total: number;
  unit: string; // "p" 또는 "강"
  current: number | null;
  date: string;
  percent: number | null;
};

const norm = (t: string) => t.replace(/\s+/g, "").toLowerCase();

// "240p", "240쪽", "240페이지", "30강" -> { total, unit }
function parseTotal(text: string) {
  const m = text.match(/(\d+)\s*(p|쪽|페이지|강)/i);
  if (!m) return null;
  return { total: Number(m[1]), unit: m[2] === "강" ? "강" : "p" };
}

// 상담 줄에서 진행량 숫자 찾기. "2강 ~ 7강"이면 마지막 7을 씁니다.
function parseProgress(line: string, unit: string) {
  const re = unit === "강" ? /(\d+)\s*강/g : /(?:p\.?\s*(\d+)|(\d+)\s*(?:p|쪽|페이지))/gi;
  let last: number | null = null;
  for (const m of line.matchAll(re)) last = Number(m[1] ?? m[2]);
  return last;
}

function splitSections(lines: string[]) {
  const sections: { date: string; lines: string[] }[] = [];
  const basic: string[] = [];
  const tableRows: string[][] = [];
  for (const line of lines) {
    if (line.startsWith("§ ")) {
      if (!sections.length) tableRows.push(line.slice(2).split(" | "));
      continue;
    }
    if (DATE_LINE.test(line)) {
      sections.push({ date: line.trim(), lines: [] });
    } else if (sections.length) {
      if (line !== "---") sections[sections.length - 1].lines.push(line);
    } else if (line.trim() !== "기본정보" && line !== "---") {
      basic.push(line);
    }
  }
  const sessions: Session[] = sections.map((sec) => ({
    date: sec.date,
    note: sec.lines.join("\n").trim(),
    todoDone: sec.lines.filter((l) => l.startsWith("☑")).length,
    todoTotal: sec.lines.filter((l) => l.startsWith("☑") || l.startsWith("☐")).length,
  }));

  // 교재 표: 과목 | 교재 | 총량
  const materials: Material[] = [];
  for (const cells of tableRows) {
    if (cells.length < 3) continue;
    const [subject, title, totalText] = cells;
    const parsed = parseTotal(totalText);
    if (!title || !parsed) continue; // 머리줄(과목|교재|총량)이나 빈 줄은 건너뜀
    let current: number | null = null;
    let date = "";
    for (const sec of sections) {
      for (const line of sec.lines) {
        if (!norm(line).includes(norm(title))) continue;
        const value = parseProgress(line, parsed.unit);
        if (value != null) {
          current = value;
          date = sec.date;
        }
      }
    }
    materials.push({
      subject,
      title,
      total: parsed.total,
      unit: parsed.unit,
      current,
      date,
      percent: current != null && parsed.total ? Math.min(100, Math.round((current / parsed.total) * 100)) : null,
    });
  }

  return { basicInfo: basic.join("\n").trim(), sessions, materials };
}

function toStudent(row: Record<string, any>) {
  const sessions: Session[] = row.sessions || [];
  const latest = sessions[sessions.length - 1];
  // 달성률은 체크박스가 있는 가장 최근 "지난" 회차(마지막 회차의 바로 전)를 우선 봅니다.
  const withTodos = sessions.filter((x) => x.todoTotal > 0);
  const graded = withTodos.length > 1 ? withTodos[withTodos.length - 2] : withTodos[withTodos.length - 1];
  return {
    pageId: row.page_id,
    name: row.name,
    rawTitle: row.raw_title,
    mentor: row.mentor,
    url: row.url,
    lastEdited: row.last_edited,
    basicInfo: row.basic_info,
    sessions,
    sessionCount: sessions.length,
    latestDate: latest?.date || "",
    latestNote: latest?.note || "",
    gradedDate: graded?.date || "",
    materials: row.materials || [],
    todoDone: graded?.todoDone ?? 0,
    todoTotal: graded?.todoTotal ?? 0,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return json({ error: "로그인이 필요합니다." }, 401);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "관리자만 사용할 수 있습니다." }, 403);

    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));

    // 1) 데이터베이스의 모든 학생 페이지 (제목·멘토·수정 시각만)
    const pages: Record<string, any>[] = [];
    let cursor: string | undefined;
    do {
      const data = await notion(`/databases/${DATABASE_ID}/query`, {
        method: "POST",
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      });
      pages.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    // 2) 저장된 것과 비교해서 바뀐 페이지만 본문을 다시 읽습니다.
    const { data: cached, error: cacheError } = await admin
      .from("notion_students")
      .select("page_id, last_edited, parser_version");
    if (cacheError) throw cacheError;
    const cachedById = new Map((cached || []).map((r) => [r.page_id, r]));
    const stale = pages.filter((p) => {
      const c = cachedById.get(p.id);
      return body.force
        || !c
        || c.parser_version !== PARSER_VERSION
        || new Date(c.last_edited).getTime() !== new Date(p.last_edited_time).getTime();
    });

    let done = 0;
    await mapLimit(stale, 2, async (page) => {
      if (Date.now() - startedAt > 90_000) return; // 남은 건 다음 호출에서
      const props = page.properties || {};
      const titleProp = Object.values(props).find((p: any) => p.type === "title") as any;
      const rawTitle = plain(titleProp?.title);
      const mentorProp = (props["멘토"] || {}) as any;
      const mentor = mentorProp.select?.name
        || (mentorProp.multi_select || []).map((m: any) => m.name).join(", ")
        || (mentorProp.people || []).map((p: any) => p.name).join(", ")
        || plain(mentorProp.rich_text)
        || "";
      const { basicInfo, sessions, materials } = splitSections(await blockLines(page.id));
      const { error } = await admin.from("notion_students").upsert({
        page_id: page.id,
        name: cleanName(rawTitle),
        raw_title: rawTitle,
        mentor,
        url: page.url,
        last_edited: page.last_edited_time,
        basic_info: basicInfo,
        sessions,
        materials,
        parser_version: PARSER_VERSION,
        synced_at: new Date().toISOString(),
      });
      if (error) throw error;
      done += 1;
    });

    // 노션에서 지운 페이지는 저장본에서도 지웁니다.
    const liveIds = new Set(pages.map((p) => p.id));
    const removed = (cached || []).map((r) => r.page_id).filter((id) => !liveIds.has(id));
    if (removed.length) await admin.from("notion_students").delete().in("page_id", removed);

    const { data: rows, error: rowsError } = await admin.from("notion_students").select("*").order("name");
    if (rowsError) throw rowsError;
    const students = (rows || []).map(toStudent);

    return json({ students, pending: stale.length - done, refreshed: done });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
