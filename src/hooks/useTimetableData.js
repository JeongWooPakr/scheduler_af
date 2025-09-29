import { useState, useEffect, useCallback } from 'react';
// supabaseService에서 saveSchedules만 가져오고, 나머지는 supabaseClient를 직접 사용합니다.
import { supabase } from '../supabaseClient'; 
import { saveSchedules } from '../services/supabaseService';

// "HH:mm" 형식의 시간을 분으로 변환하는 함수
const t2m = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const useTimetableData = (user) => {
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  // 데이터 로딩 로직 최적화
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);

      // Supabase 함수를 단 한 번만 호출하여 이름과 시간표를 동시에 가져옵니다.
      const { data, error } = await supabase.rpc('get_user_timetable_data', {
        p_user_id: user.id
      });
      
      if (error) {
        console.error("Error fetching timetable data:", error);
      } else if (data) {
        // 한 번의 응답으로 이름과 시간표를 모두 설정합니다.
        setStudentName(data.student_name || user.email.split('@')[0]);
        
        const formatted = (data.schedules || []).map((item) => ({
          ...item,
          start: item.start_time?.substring(0, 5),
          end: item.end_time?.substring(0, 5),
        }));
        setClasses(formatted);
      }

      setLoading(false);
      setHasChanges(false);
    };

    fetchData();
  }, [user]);

  // 일정 추가 함수
  const addClass = useCallback((newClassInfo) => {
    const { title, checkedDays, start, end } = newClassInfo;

    if (!checkedDays.length || t2m(start) >= t2m(end)) {
      alert('입력값을 확인해주세요.');
      return;
    }

    const palette = [
      '#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', 
      '#A0C4FF', '#BDB2FF', '#FFC6FF', '#E4F1EE', '#F8C8DC',
    ];
    let color = palette[Math.floor(Math.random() * palette.length)];
    const found = classes.find((c) => c.title === title);
    if (found) color = found.color;

    const items = checkedDays.map((day) => ({
      id: `temp_${Date.now()}_${Math.random()}`,
      day, title, start, end, color,
    }));
    
    // 일정 중복 확인 로직
    const newStartTime = t2m(start);
    const newEndTime = t2m(end);
    const conflictingClasses = [];

    const nonConflictingClasses = classes.filter(existingClass => {
      if (!checkedDays.includes(existingClass.day)) return true;
      const existingStartTime = t2m(existingClass.start);
      const existingEndTime = t2m(existingClass.end);
      const isOverlapping = Math.max(newStartTime, existingStartTime) < Math.min(newEndTime, existingEndTime);
      
      if (isOverlapping) {
        conflictingClasses.push(existingClass);
        return false;
      }
      return true;
    });

    if (conflictingClasses.length > 0) {
      const confirmed = window.confirm(
        "추가하려는 일정이 다른 일정과 겹칩니다.\n기존 일정을 삭제하고 새로운 일정을 추가하시겠습니까?"
      );
      if (!confirmed) return;
    }
    
    setClasses([...nonConflictingClasses, ...items]);
    setHasChanges(true);
    
  }, [classes]);

  // 일정 삭제 함수
  const deleteClass = useCallback((id) => {
    if (window.confirm('삭제하시겠습니까?')) {
      setClasses((prev) => prev.filter((c) => c.id !== id));
      setHasChanges(true);
    }
  }, []);

  // 변경사항 저장 함수
  const handleSaveChanges = useCallback(async () => {
    setSaving(true);
    const { data, error } = await saveSchedules(user, classes);
    setSaving(false);

    if (error) {
      alert('저장에 실패했습니다. 다시 시도해주세요.');
      console.error('Save Error:', error);
    } else {
      alert('변경사항이 성공적으로 저장되었습니다!');
      setHasChanges(false);
      if (data) {
        const formatted = data.map((item) => ({
          ...item,
          start: item.start_time?.substring(0, 5),
          end: item.end_time?.substring(0, 5),
        }));
        setClasses(formatted);
      }
    }
  }, [user, classes]);

  // 이 훅이 관리하는 모든 상태와 함수들을 반환합니다.
  return {
    studentName,
    loading,
    saving,
    classes,
    hasChanges,
    addClass,
    deleteClass,
    handleSaveChanges,
  };
};
