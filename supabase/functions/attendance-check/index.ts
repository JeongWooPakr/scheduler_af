// 등원 확인 서버 함수 (Supabase Edge Function)
//
// 하는 일
// 1. Awesome Manager에 로그인해서 좌석 상태(입실/퇴실/외출)를 가져옵니다.
// 2. Supabase 시간표로 "지금 학원에 있어야 하는 관리형 학생"을 분 단위로 계산합니다.
// 3. 둘을 비교해서 미등원 / 외출 / 등원 명단을 돌려줍니다. (record: true면 기록도 남깁니다)
//
// 필요한 Secrets (대시보드 > Edge Functions > Secrets)
//   AF_LOGIN_ID, AF_LOGIN_PASS  : Awesome Manager 계정
//   CRON_SECRET                 : 자동 실행(cron)용 임의 문자열
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줍니다.
//
// 호출 예시 (body, 모두 선택)
//   { "action": "check", "time": "09:05", "slot": "morning", "record": true }
//   { "action": "seats" }   // 좌석 원본 (학생 정보 가져오기용)

import { createClient } from "npm:@supabase/supabase-js@2";

const AF_BASE = "https://awesomefactory.kr";
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Seat = {
  seatNo: number;
  name: string;
  school: string;
  grade: string;
  state: string; // 입실 / 퇴실 / 외출 / ""
  room: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Awesome Manager ----------

class CookieJar {
  private cookies = new Map<string, string>();
  store(res: Response) {
    const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function afFetch(jar: CookieJar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${AF_BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers || {}), Cookie: jar.header(), "User-Agent": "Mozilla/5.0" },
  });
  jar.store(res);
  return res;
}

async function fetchSeats(): Promise<Seat[]> {
  const id = Deno.env.get("AF_LOGIN_ID");
  const pass = Deno.env.get("AF_LOGIN_PASS");
  if (!id || !pass) throw new Error("AF_LOGIN_ID / AF_LOGIN_PASS Secrets가 설정되지 않았습니다.");

  const jar = new CookieJar();

  // 1) 로그인 페이지에서 세션 쿠키와 숨은 값(act, 자동로그인 옵션)을 받습니다.
  const loginPage = await (await afFetch(jar, "/bbs3/login/login.php")).text();
  // 예: <input type=hidden name=act value=ok>  (따옴표 없는 값도 처리)
  const act = loginPage.match(/<input[^>]*name=["']?act["']?[^>]*value=["']?([^"'\s>]+)/i)?.[1] ?? "ok";
  const autoOption = loginPage.match(/<select[^>]*name=["']?login_auto["']?[\s\S]*?<option[^>]*value=["']([^"']*)["']/i)?.[1] ?? "";

  // 2) 로그인
  const form = new URLSearchParams({ act, login_auto: autoOption, login_id: id, login_pass: pass });
  const loginRes = await afFetch(jar, "/bbs3/login/login.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  await loginRes.text();

  // 3) 좌석 정보
  const seatRes = await afFetch(jar, "/manager/json_seat.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: "mode=load",
  });
  const text = await seatRes.text();
  let data: { seat_info?: Record<string, string | null>[] };
  try {
    data = JSON.parse(text);
  } catch {
    console.log("AF seat response", seatRes.status, "login status", loginRes.status, "len", text.length);
    throw new Error("Awesome Manager 로그인 또는 좌석 조회에 실패했습니다. 아이디/비밀번호를 확인해 주세요.");
  }

  return (data.seat_info || []).map((s) => ({
    seatNo: Number(s.seat_no),
    name: (s.s_name || s.fs_name || "").trim(),
    school: (s.s_school || s.fs_school || "").trim(),
    grade: (s.s_grade || s.fs_grade || "").trim(),
    state: (s.seat_state || s.fstate || "").trim(),
    room: s.seat_room || "",
  }));
}

// ---------- 시간 ----------

function nowKst() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    day: DAYS[d.getUTCDay()],
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function toMinutes(t: string | null | undefined) {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// ---------- 메인 ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 권한: cron 비밀값이 맞거나, 로그인한 관리자여야 합니다.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!isCron) {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ error: "로그인이 필요합니다." }, 401);
      const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
      if (profile?.role !== "admin") return json({ error: "관리자만 사용할 수 있습니다." }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "check";

    const seats = await fetchSeats();
    if (action === "seats") return json({ seats: seats.filter((s) => s.name) });

    const kst = nowKst();
    const checkMinutes = body.time ? toMinutes(body.time) : kst.minutes;
    const day = body.day && DAYS.includes(body.day) ? body.day : kst.day;
    const slot = body.slot || "manual";

    // 관리형 학생 + 이름
    const { data: infos, error: infoError } = await admin
      .from("student_info")
      .select("user_id, seat_no, student_phone, parent_phone, is_managed")
      .eq("is_managed", true);
    if (infoError) throw infoError;

    const ids = (infos || []).map((i) => i.user_id);
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((profiles || []).map((p) => [p.id, p.name || ""]));

    // 오늘 요일 시간표 (외부 일정)
    const { data: schedules } = ids.length
      ? await admin.from("schedules").select("user_id, title, start_time, end_time").eq("day", day).in("user_id", ids)
      : { data: [] as { user_id: string; title: string; start_time: string; end_time: string }[] };

    const busyById = new Map<string, { title: string; start: number; end: number }[]>();
    for (const s of schedules || []) {
      const list = busyById.get(s.user_id) || [];
      list.push({ title: s.title, start: toMinutes(s.start_time), end: toMinutes(s.end_time) });
      busyById.set(s.user_id, list);
    }

    // 오늘 등록된 예외 (학부모가 미리 알려 준 결석·지각). 시간이 비어 있으면 하루 종일.
    const { data: exceptions } = ids.length
      ? await admin
        .from("attendance_exceptions")
        .select("user_id, start_time, end_time, reason")
        .eq("on_date", kst.date)
        .in("user_id", ids)
      : { data: [] as { user_id: string; start_time: string | null; end_time: string | null; reason: string | null }[] };
    const exceptionsById = new Map<string, { start: number; end: number; reason: string }[]>();
    for (const e of exceptions || []) {
      const list = exceptionsById.get(e.user_id) || [];
      list.push({
        start: e.start_time ? toMinutes(e.start_time) : 0,
        end: e.end_time ? toMinutes(e.end_time) : 24 * 60,
        reason: e.reason || "",
      });
      exceptionsById.set(e.user_id, list);
    }

    const seatByNo = new Map(seats.map((s) => [s.seatNo, s]));
    const seatByName = new Map(seats.filter((s) => s.name).map((s) => [s.name, s]));

    const rows = (infos || []).map((info) => {
      const name = nameById.get(info.user_id) || "";
      const busy = (busyById.get(info.user_id) || []).find((b) => b.start <= checkMinutes && checkMinutes < b.end);
      const excused = (exceptionsById.get(info.user_id) || []).find(
        (e) => e.start <= checkMinutes && checkMinutes < e.end,
      );

      // 좌석 번호 우선, 안 맞으면 이름으로 찾기
      let seat = info.seat_no ? seatByNo.get(info.seat_no) : undefined;
      if (!seat || !seat.name || (name && seat.name !== name)) seat = seatByName.get(name);

      let result: string;
      if (busy) result = "외부일정";
      else if (excused) result = "예외";
      else if (!seat || !seat.name) result = "좌석없음";
      else if (seat.state === "입실") result = "등원";
      else if (seat.state === "외출") result = "외출";
      else result = "미등원";

      return {
        user_id: info.user_id,
        name,
        seat_no: seat?.seatNo ?? info.seat_no ?? null,
        af_name: seat?.name || "",
        af_state: seat?.state || "",
        busy_title: busy?.title || "",
        exception_reason: excused ? excused.reason || "예외" : "",
        student_phone: info.student_phone || "",
        parent_phone: info.parent_phone || "",
        result,
      };
    });

    rows.sort((a, b) => (a.seat_no ?? 999) - (b.seat_no ?? 999));

    if (body.record || isCron) {
      const expected = rows.filter((r) => r.result !== "외부일정" && r.result !== "예외");
      if (expected.length) {
        const { error } = await admin.from("attendance_checks").insert(
          expected.map((r) => ({
            check_date: kst.date,
            check_time: toHHMM(checkMinutes),
            slot,
            user_id: r.user_id,
            student_name: r.name,
            seat_no: r.seat_no,
            af_state: r.af_state || "없음",
            result: r.result,
          })),
        );
        if (error) throw error;
      }
    }

    return json({ date: kst.date, day, time: toHHMM(checkMinutes), slot, rows });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
