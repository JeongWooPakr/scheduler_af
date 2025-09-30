// Helper function to convert "HH:mm" to minutes from midnight
const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper function to convert minutes to "HH:mm" format
const minutesToTime = (minutes) => {
  if (minutes === null || isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 상담 시간표를 생성하는 핵심 알고리즘
 * @param {object} params - 스케줄링에 필요한 파라미터
 * @param {Array} params.students - 전체 학생 목록
 * @param {Array} params.selectedStudentIds - 선택된 학생 ID 목록
 * @param {object} params.counselingDays - 선택된 상담 요일 및 시간 정보
 * @param {Array} params.existingSchedules - 학생들의 기존 시간표
 * @returns {object} - { scheduled: Array, unscheduled: Array }
 */
export const generateCounselingSchedule = ({ students, selectedStudentIds, counselingDays, existingSchedules }) => {
  // 1. Group schedules by student ID for easy lookup
  const schedulesByStudent = (existingSchedules || []).reduce((acc, schedule) => {
    const id = schedule.user_id;
    if (!acc[id]) acc[id] = [];
    acc[id].push(schedule);
    return acc;
  }, {});

  // 2. Generate all possible 15-min slots
  let allAvailableSlots = [];
  Object.entries(counselingDays).forEach(([day, { start, end }]) => {
    let currentTime = timeToMinutes(start);
    const endTime = timeToMinutes(end);
    while (currentTime < endTime) {
      allAvailableSlots.push({ day, start: currentTime });
      currentTime += 15;
    }
  });
  // Sort slots by day and time to ensure chronological processing
  allAvailableSlots.sort((a, b) => {
    const dayCompare = WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day);
    if (dayCompare !== 0) return dayCompare;
    return a.start - b.start;
  });

  // 3. Prepare students list, sorted by name for consistency
  let studentsToSchedule = students
    .filter(s => selectedStudentIds.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const finalSchedule = [];

  // 4. Iterate through each slot to find a suitable student
  for (const slot of allAvailableSlots) {
    let studentFoundForSlot = false;

    // 5. Find an available student for the current slot
    for (let i = 0; i < studentsToSchedule.length; i++) {
      const student = studentsToSchedule[i];
      const studentSchedules = schedulesByStudent[student.id] || [];
      const slotStart = slot.start;
      const slotEnd = slot.start + 15;

      const hasConflict = studentSchedules.some(schedule => {
        if (schedule.day !== slot.day) return false;
        const classStart = timeToMinutes(schedule.start_time);
        const classEnd = timeToMinutes(schedule.end_time);
        return Math.max(slotStart, classStart) < Math.min(slotEnd, classEnd);
      });

      if (!hasConflict) {
        finalSchedule.push({
          studentName: student.name,
          day: slot.day,
          time: minutesToTime(slot.start),
        });
        
        studentsToSchedule.splice(i, 1); // Remove scheduled student
        studentFoundForSlot = true;
        break; // Move to the next slot
      }
    }

    // 6. If no student can be scheduled in the current slot, stop scheduling
    if (!studentFoundForSlot) {
      break;
    }
  }
  
  // 7. Return the results
  return {
    scheduled: finalSchedule,
    unscheduled: studentsToSchedule,
  };
};
