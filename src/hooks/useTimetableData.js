import { useState, useEffect, useCallback } from 'react';
import { getProfile, getSchedules, saveSchedules } from '../services/supabaseService';

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

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);

      const profileData = await getProfile(user);
      if (profileData && profileData.name) {
        setStudentName(profileData.name);
      } else {
        setStudentName(user.email.split('@')[0]);
      }

      const scheduleData = await getSchedules(user);
      const formatted = scheduleData.map((item) => ({
        ...item,
        start: item.start_time?.substring(0, 5),
        end: item.end_time?.substring(0, 5),
      }));
      setClasses(formatted);

      setLoading(false);
      setHasChanges(false);
    };

    fetchData();
  }, [user]);

  // [핵심 수정] 일정 중복 확인 및 처리 로직 추가
  const addClass = useCallback((newClassInfo) => {
    const { title, checkedDays, start, end } = newClassInfo;

    if (!checkedDays.length || t2m(start) >= t2m(end)) {
      alert('입력값을 확인해주세요.');
      return;
    }

    const newStartTime = t2m(start);
    const newEndTime = t2m(end);
    const conflictingClasses = [];

    // 1. 겹치는 일정이 있는지 확인
    const newSchedules = classes.filter(existingClass => {
      const isDifferentDay = !checkedDays.includes(existingClass.day);
      if (isDifferentDay) {
        return true; // 다른 요일이면 충돌 대상이 아님
      }

      const existingStartTime = t2m(existingClass.start);
      const existingEndTime = t2m(existingClass.end);
      
      // 시간 겹침 확인: Math.max(시작1, 시작2) < Math.min(종료1, 종료2)
      const isOverlapping = Math.max(newStartTime, existingStartTime) < Math.min(newEndTime, existingEndTime);
      
      if (isOverlapping) {
        conflictingClasses.push(existingClass);
        return false; // 겹치므로 일단 기존 목록에서 제외
      }
      return true; // 겹치지 않으므로 유지
    });

    // 2. 겹치는 일정이 있을 경우 사용자에게 확인
    if (conflictingClasses.length > 0) {
      const confirmed = window.confirm(
        "추가하려는 일정이 다른 일정과 겹칩니다. 기존 일정을 삭제하고 새로운 일정을 추가하시겠습니까?"
      );
      if (!confirmed) {
        return; // 사용자가 '아니오'를 선택하면 아무것도 하지 않음
      }
    }

    // 3. 새로운 일정 추가
    const palette = ["#FFD1DC", "#B5EAD7", "#C7CEEA", "#FFDAC1", "#E2F0CB", "#FFB7B2"];
    let color = palette[Math.floor(Math.random() * palette.length)];
    const found = classes.find((c) => c.title === title);
    if (found) color = found.color;

    const items = checkedDays.map((day) => ({
      id: `temp_${Date.now()}_${Math.random()}`,
      day, title, start, end, color,
    }));

    setClasses([...newSchedules, ...items]);
    setHasChanges(true);

  }, [classes]);

  const deleteClass = useCallback((id) => {
    if (window.confirm('삭제하시겠습니까?')) {
      setClasses((prev) => prev.filter((c) => c.id !== id));
      setHasChanges(true);
    }
  }, []);

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
