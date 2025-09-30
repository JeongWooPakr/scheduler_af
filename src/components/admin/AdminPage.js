import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import Timetable from '../timetable/Timetable';
import CounselingScheduler from './CounselingScheduler'; // 새로 만든 컴포넌트
import './AdminPage.css';

const AdminPage = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // [추가] 현재 활성화된 뷰를 관리하는 상태 ('timetable' 또는 'counseling')
  const [activeView, setActiveView] = useState('timetable');

  useEffect(() => {
    const fetchStudents = async () => {
      const { data, error } = await supabase.rpc('get_all_students');
      if (error) {
        setError('학생 목록을 불러오는데 실패했습니다.');
        console.error(error);
      } else {
        setStudents(data);
      }
      setLoading(false);
    };
    fetchStudents();
  }, []);

  const handleStudentSelect = (student) => {
    const mockUser = { id: student.id, name: student.name };
    setSelectedStudent(mockUser);
  };

  if (loading) return <div>로딩 중...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="admin-container">
      <aside className="student-sidebar">
        {/* [추가] 뷰 전환 탭 */}
        <div className="view-switcher">
          <button 
            onClick={() => setActiveView('timetable')}
            className={activeView === 'timetable' ? 'active' : ''}
          >
            학생 시간표 조회
          </button>
          <button 
            onClick={() => setActiveView('counseling')}
            className={activeView === 'counseling' ? 'active' : ''}
          >
            상담 시간표 생성
          </button>
        </div>

        {/* 학생 시간표 조회 뷰일 때만 학생 목록을 보여줍니다. */}
        {activeView === 'timetable' && (
          <>
            <h2>학생 목록</h2>
            <ul>
              {students.map((student) => (
                <li
                  key={student.id}
                  onClick={() => handleStudentSelect(student)}
                  className={selectedStudent?.id === student.id ? 'active' : ''}
                >
                  {student.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <main className="timetable-view">
        {activeView === 'timetable' ? (
          selectedStudent ? (
            <Timetable key={selectedStudent.id} user={selectedStudent} isAdminView={true} />
          ) : (
            <div className="placeholder">학생을 선택하면 시간표가 표시됩니다.</div>
          )
        ) : (
          // 상담 시간표 생성 뷰
          <CounselingScheduler students={students} />
        )}
      </main>
    </div>
  );
};

export default AdminPage;