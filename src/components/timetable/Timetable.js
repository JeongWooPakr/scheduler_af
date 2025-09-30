import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useTimetableData } from '../../hooks/useTimetableData';
import TimetableGrid from "./TimetableGrid";
import ClassBlock from "./ClassBlock";
import AddScheduleForm from "./AddScheduleForm";
import "../Timetable.css";

const periods = [
  { name: "0교시", start: "08:00", end: "08:50" }, { name: "쉬는시간", start: "08:50", end: "09:00" },
  { name: "1교시", start: "09:00", end: "10:10" }, { name: "쉬는시간", start: "10:10", end: "10:20" },
  { name: "2교시", start: "10:20", end: "11:20" }, { name: "쉬는시간", start: "11:20", end: "11:30" },
  { name: "3교시", start: "11:30", end: "12:20" }, { name: "점심", start: "12:20", end: "13:30" },
  { name: "4교시", start: "13:30", end: "14:40" }, { name: "쉬는시간", start: "14:40", end: "14:50" },
  { name: "5교시", start: "14:50", end: "16:00" }, { name: "쉬는시간", start: "16:00", end: "16:10" },
  { name: "6교시", start: "16:10", end: "17:30" }, { name: "저녁", start: "17:30", end: "19:00" },
  { name: "7교시", start: "19:00", end: "20:20" }, { name: "쉬는시간", start: "20:20", end: "20:30" },
  { name: "8교시", start: "20:30", end: "21:50" }, { name: "쉬는시간", start: "21:50", end: "22:00" },
  { name: "9교시", start: "22:00", end: "23:00" },
];
const days = ["월", "화", "수", "목", "금", "토", "일"];

export default function Timetable({ user, isAdminView = false }) {
  const { classes, loading, saving, hasChanges, addClass, deleteClass, handleSaveChanges, studentName } = useTimetableData(user, isAdminView);
  const [adminClasses, setAdminClasses] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminStudentName, setAdminStudentName] = useState('');

  useEffect(() => {
    if (isAdminView) {
      const fetchStudentSchedule = async () => {
        setAdminLoading(true);
        const { data } = await supabase.rpc('get_schedule_for_student', { student_id: user.id });
        const formatted = (data || []).map((item) => ({
          ...item,
          start: item.start_time?.substring(0, 5),
          end: item.end_time?.substring(0, 5),
        }));
        setAdminClasses(formatted);
        setAdminStudentName(user.name || '');
        setAdminLoading(false);
      };
      fetchStudentSchedule();
    }
  }, [user, isAdminView]);

  const [showForm, setShowForm] = useState(false);

  const displayClasses = isAdminView ? adminClasses : classes;
  const isLoading = isAdminView ? adminLoading : loading;
  const displayName = isAdminView ? adminStudentName : studentName;

  if (isLoading) {
    return <div>학생 정보를 불러오는 중입니다...</div>;
  }

  return (
    <div className="timetable-wrapper">
      {/* [수정] 네비게이션 바를 삭제하고, 페이지 제목을 추가합니다. */}
      <h1 className="page-title">🏫 {displayName} 님의 시간표</h1>

      <TimetableGrid 
        periods={periods} 
        days={days} 
        classes={displayClasses} 
        ClassBlockComponent={ClassBlock} 
        // [수정] 관리자 모드에서는 삭제가 안 되도록 빈 함수를 전달합니다.
        deleteClass={isAdminView ? () => {} : deleteClass} 
      />

      {/* [수정] 관리자 모드에서는 추가/저장 버튼이 보이지 않습니다. */}
      {!isAdminView && (
        <>
          <div className="floating-buttons">
            {hasChanges && (
              <button className="save-btn" onClick={handleSaveChanges} disabled={saving}>
                {saving ? '저장 중...' : '변경사항 저장'}
              </button>
            )}
            <button className="toggle-btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "닫기" : "시간표 추가"}
            </button>
          </div>

          {showForm && (
            <AddScheduleForm 
              days={days}
              onAddClass={(newClassInfo) => {
                addClass(newClassInfo);
                setShowForm(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}