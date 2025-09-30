import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
// [수정] 새로 만든 스케줄링 서비스를 import 합니다.
import { generateCounselingSchedule } from '../../services/schedulingService';
import './CounselingScheduler.css';

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

const CounselingScheduler = ({ students }) => {
  const [counselingDays, setCounselingDays] = useState({});
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDayToggle = (day) => {
    const newDays = { ...counselingDays };
    if (newDays[day]) {
      delete newDays[day];
    } else {
      newDays[day] = { start: '14:00', end: '17:00' };
    }
    setCounselingDays(newDays);
  };

  const handleTimeChange = (day, type, value) => {
    setCounselingDays({
      ...counselingDays,
      [day]: { ...counselingDays[day], [type]: value },
    });
  };

  const handleStudentToggle = (studentId) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };
  
  const handleSelectAll = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map(s => s.id));
    }
  };

  const generateSchedule = async () => {
    if (selectedStudentIds.length === 0 || Object.keys(counselingDays).length === 0) {
      setError('상담할 학생과 요일을 선택해주세요.');
      return;
    }
    setIsLoading(true);
    setError('');
    setResults(null);

    // 1. Fetch existing schedules from Supabase
    const { data: existingSchedules, error: fetchError } = await supabase.rpc('get_schedules_for_students', {
      student_ids: selectedStudentIds,
      days_of_week: Object.keys(counselingDays),
    });

    if (fetchError) {
      setError('학생 시간표를 불러오는 데 실패했습니다.');
      setIsLoading(false);
      return;
    }
    
    // 2. [수정] 분리된 서비스 함수를 호출하여 스케줄링 로직을 실행합니다.
    const scheduleResults = generateCounselingSchedule({
      students,
      selectedStudentIds,
      counselingDays,
      existingSchedules
    });

    // 3. Set results to state
    setResults(scheduleResults);
    setIsLoading(false);
  };

  return (
    <div className="scheduler-container">
      <h2>상담 시간표 생성</h2>
      
      <div className="setup-section">
        <div className="config-panel">
          <h3>1. 상담 요일 및 시간 설정</h3>
          <div className="day-selection">
            {WEEK_DAYS.map((day) => (
              <div key={day}>
                <label className="day-toggle">
                  <input
                    type="checkbox"
                    checked={!!counselingDays[day]}
                    onChange={() => handleDayToggle(day)}
                  />
                  {day}
                </label>
                {counselingDays[day] && (
                  <div className="time-inputs">
                    <input type="time" value={counselingDays[day].start} onChange={(e) => handleTimeChange(day, 'start', e.target.value)} />
                    <span>~</span>
                    <input type="time" value={counselingDays[day].end} onChange={(e) => handleTimeChange(day, 'end', e.target.value)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="student-panel">
          <h3>2. 상담 학생 선택</h3>
          <div className="student-list">
          <label className="student-item-header">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={students.length > 0 && selectedStudentIds.length === students.length}
                />
                <strong>전체 선택</strong>
              </label>
            {students.map((student) => (
              <label key={student.id} className="student-item">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(student.id)}
                  onChange={() => handleStudentToggle(student.id)}
                />
                {student.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      
      <button onClick={generateSchedule} disabled={isLoading} className="generate-btn">
        {isLoading ? '생성 중...' : '상담 시간표 생성하기'}
      </button>

      {error && <p className="error-message">{error}</p>}
      
      {results && (
        <div className="results-section">
          <h3>상담 시간표 결과</h3>
          <div className="results-grid">
            <div className="scheduled-list">
              <h4>✅ 배정 완료 ({results.scheduled.length}명)</h4>
              <table>
                <thead>
                  <tr><th>학생명</th><th>요일</th><th>상담 시간</th></tr>
                </thead>
                <tbody>
                {results.scheduled.map((item, index) => (
                  <tr key={index}>
                    <td>{item.studentName}</td>
                    <td>{item.day}</td>
                    <td>{item.time}</td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
            <div className="unscheduled-list">
              <h4>❌ 배정 불가 ({results.unscheduled.length}명)</h4>
              <ul>
                {results.unscheduled.map((student) => (
                  <li key={student.id}>{student.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CounselingScheduler;