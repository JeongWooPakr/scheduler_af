import { useState, useEffect, useCallback } from 'react';
import { getProfile, getSchedules, saveSchedules } from '../services/supabaseService';

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

  const addClass = useCallback((newClassInfo) => {
    const { title, checkedDays, start, end } = newClassInfo;

    if (!checkedDays.length || t2m(start) >= t2m(end)) {
      alert('입력값을 확인해주세요.');
      return;
    }

    const palette = ["#FFD1DC", "#B5EAD7", "#C7CEEA", "#FFDAC1", "#E2F0CB", "#FFB7B2"];
    let color = palette[Math.floor(Math.random() * palette.length)];
    const found = classes.find((c) => c.title === title);
    if (found) color = found.color;

    const items = checkedDays.map((day) => ({
      id: `temp_${Date.now()}_${Math.random()}`,
      day, title, start, end, color,
    }));

    setClasses((prev) => [...prev, ...items]);
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
