// ==========================================
// 1. 기본 설정 (시트 구조 상수는 여기에)
// ==========================================
const STUDENT_NAME_COLUMN = 2; // 학생 이름이 있는 열 (B열 = 2)
const PERIOD_TIME_ROW = 6;     // 교시별 시간이 적힌 행 (6행)
const DATA_START_COLUMN = 3;   // 데이터가 시작되는 열 (C열 = 3)
const DATA_START_ROW = 7;      // 학생 이름 데이터가 시작되는 행 (7행)
const ALL_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const PERIODS = ["0교시", "1교시", "2교시", "3교시", "점심", "4교시", "5교시", "6교시", "저녁", "7교시", "8교시", "9교시"];

/**
 * [핵심 함수] Supabase로부터 데이터를 받아 시트를 업데이트합니다.
 * 학생이 자리를 옮겼더라도 이름을 검색해서 정확한 위치에 시간표를 기록합니다.
 *
 * 속도 개선: 칸마다 setValue 하던 것을 요일 시트마다 한 줄을 한 번에 씁니다.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput("Error: Server busy");
  }

  try {
    if (!e || !e.postData) return ContentService.createTextOutput("No Data");
    const eventData = JSON.parse(e.postData.contents);
    const studentName = eventData.student_name;
    const newSchedules = Array.isArray(eventData.schedules) ? eventData.schedules : [];

    if (!studentName) return ContentService.createTextOutput("No Student Name");

    const schedulesByDay = {};
    newSchedules.forEach((sch) => {
      if (!sch || !sch.day) return;
      if (!schedulesByDay[sch.day]) schedulesByDay[sch.day] = [];
      schedulesByDay[sch.day].push(sch);
    });

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    ALL_DAYS.forEach((day) => {
      const sheet = spreadsheet.getSheetByName(day);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < DATA_START_ROW || lastCol < DATA_START_COLUMN) return;

      const nameValues = sheet
        .getRange(DATA_START_ROW, STUDENT_NAME_COLUMN, lastRow - DATA_START_ROW + 1, 1)
        .getValues()
        .flat();
      const rowIndex = nameValues.indexOf(studentName);
      if (rowIndex === -1) return;

      const targetRow = rowIndex + DATA_START_ROW;
      const colCount = lastCol - DATA_START_COLUMN + 1;
      const periodTimes = sheet.getRange(PERIOD_TIME_ROW, DATA_START_COLUMN, 1, colCount).getValues()[0];
      const rowValues = new Array(colCount).fill("");

      (schedulesByDay[day] || []).forEach((sch) => {
        const schStart = timeToMinutes(sch.start_time);
        const schEnd = timeToMinutes(sch.end_time);

        periodTimes.forEach((timeRange, colIndex) => {
          const period = parseTimeRange(timeRange);
          if (!period) return;
          if (Math.max(schStart, period.start) < Math.min(schEnd, period.end)) {
            rowValues[colIndex] = sch.title;
          }
        });
      });

      // 기존 행 지우기 + 새 값 쓰기를 한 번에 처리
      sheet.getRange(targetRow, DATA_START_COLUMN, 1, colCount).setValues([rowValues]);
    });

    return ContentService.createTextOutput("Success");
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString());
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 2. 등원 현황판 (결과는 기존과 같고, 속도만 개선)
// ==========================================
//
// 기존 코드는 칸 하나를 채울 때마다 요일 시트 전체를 다시 읽고(수백 번),
// 칸마다 따로 썼습니다(수백 번). 이 버전은 요일 시트를 한 번씩만 읽고
// 결과 시트마다 한 번에 씁니다.

function updateAttendanceByRoom() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const room1Seats = new Set(Array.from({ length: 31 }, (_, i) => i + 1));  // 1~31번
  const room2Seats = new Set(Array.from({ length: 64 }, (_, i) => i + 37)); // 37~100번

  // 요일 시트를 한 번씩만 읽습니다.
  const dayData = {};
  ALL_DAYS.forEach((day) => {
    const daySheet = spreadsheet.getSheetByName(day);
    if (!daySheet) throw new Error(`시트 "${day}"이(가) 존재하지 않습니다.`);
    dayData[day] = daySheet.getLastRow() < DATA_START_ROW ? null : daySheet.getDataRange().getValues();
  });

  const room1 = buildRoomBlock_("교실1 등원", room1Seats, dayData);
  const room2 = buildRoomBlock_("교실2 등원", room2Seats, dayData);

  writeBlocks_(initializeSheet(spreadsheet, "시트1"), [room1, room2]);
  writeBlocks_(initializeSheet(spreadsheet, "교실1_등원"), [room1]);
  writeBlocks_(initializeSheet(spreadsheet, "교실2_등원"), [room2]);
}

/** 교실 하나의 표(헤더 1행 + 교시 12행)를 메모리에서 만듭니다. */
function buildRoomBlock_(roomName, seats, dayData) {
  const width = ALL_DAYS.length + 2;
  const rows = [[roomName, "", ...ALL_DAYS]];

  // 시간 열: 기존 코드처럼 데이터가 있는 마지막 요일 시트의 6행 시간을 씁니다.
  let times = [];
  ALL_DAYS.forEach((day) => {
    if (dayData[day]) times = dayData[day][PERIOD_TIME_ROW - 1].slice(DATA_START_COLUMN - 1);
  });

  PERIODS.forEach((period, periodIdx) => {
    const row = new Array(width).fill("");
    row[0] = period;
    row[1] = times[periodIdx] || "";

    if (period !== "점심" && period !== "저녁") {
      ALL_DAYS.forEach((day, dayIdx) => {
        const data = dayData[day];
        if (!data) return;

        const present = [];
        for (let r = DATA_START_ROW - 1; r < data.length; r += 1) {
          const seatNumber = data[r][0];
          const student = data[r][STUDENT_NAME_COLUMN - 1];
          if (!seats.has(seatNumber) || student === "") continue;
          // 해당 교시에 스케줄이 비어있으면("") 출석(자습)으로 간주
          if (data[r][DATA_START_COLUMN - 1 + periodIdx] === "") {
            present.push(`${seatNumber}(${student})`);
          }
        }
        row[dayIdx + 2] = formatStudentNames(present);
      });
    }

    rows.push(row);
  });

  return rows;
}

/** 표 여러 개를 한 번에 씁니다. 표 사이에는 기존처럼 빈 줄 + 테두리 줄을 둡니다. */
function writeBlocks_(sheet, blocks) {
  const width = ALL_DAYS.length + 2;
  const output = [];
  const borderRows = [];

  blocks.forEach((block, idx) => {
    if (idx > 0) {
      output.push(new Array(width).fill(""));
      output.push(new Array(width).fill(""));
      borderRows.push(output.length); // 1부터 세는 행 번호
    }
    block.forEach((row) => output.push(row));
  });

  if (!output.length) return;
  sheet.getRange(1, 1, output.length, width).setValues(output);
  borderRows.forEach((rowNo) => {
    sheet.getRange(rowNo, 1, 1, width).setBorder(true, true, true, true, true, true);
  });
}

function initializeSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  sheet.clear();
  return sheet;
}

function formatStudentNames(names) {
  if (names.length === 0) return "";
  return names
    .map((name, idx) => {
      const seatNumber = parseInt(name.match(/\d+/)[0], 10);
      const roomPrefix = seatNumber <= 31 ? "1_" : "2_";
      return `${roomPrefix}${name}${idx % 5 === 4 || idx === names.length - 1 ? "" : ","}`;
    })
    .reduce((result, name, idx) => {
      result += name + ((idx + 1) % 5 === 0 || idx === names.length - 1 ? "\n" : " ");
      return result;
    }, "")
    .trim();
}

// ==========================================
// 3. 시간 유틸
// ==========================================

function parseTimeRange(timeRange) {
  if (!timeRange || typeof timeRange !== "string" || !timeRange.includes("~")) return null;
  const [start, end] = timeRange.split("~").map((value) => value.trim());
  return { start: timeToMinutes(start), end: timeToMinutes(end) };
}

function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  if (timeStr.length > 5) timeStr = timeStr.substring(0, 5); // HH:mm:ss 대응
  if (!timeStr.includes(":")) return 0;
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * 메뉴 생성 (스크립트 열 때 자동 실행)
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🌟 관리자 메뉴")
    .addItem("등원 현황판 업데이트", "updateAttendanceByRoom")
    .addToUi();
}
