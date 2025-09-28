import { supabase } from '../supabaseClient';

/**
 * 사용자의 프로필(이름) 정보를 가져옵니다.
 * @param {object} user - Supabase user 객체
 * @returns {object|null} 프로필 데이터 또는 null
 */
export const getProfile = async (user) => {
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();
  return data;
};

/**
 * 사용자의 모든 시간표를 가져옵니다.
 * @param {object} user - Supabase user 객체
 * @returns {Array} 시간표 배열
 */
export const getSchedules = async (user) => {
  if (!user) return [];
  const { data } = await supabase
    .from('schedules')
    .select('*')
    .eq('user_id', user.id);
  return data || [];
};

/**
 * 사용자의 시간표 전체를 덮어씁니다.
 * @param {object} user - Supabase user 객체
 * @param {Array} schedules - 저장할 시간표 데이터 배열
 * @returns {object} { data, error }
 */
export const saveSchedules = async (user, schedules) => {
  const newSchedulesForDB = schedules.map(({ day, title, start, end, color }) => ({
    day,
    title,
    start_time: start,
    end_time: end,
    color,
  }));

  const { data, error } = await supabase.rpc('overwrite_user_schedule', {
    p_user_id: user.id,
    p_schedules: newSchedulesForDB,
  });

  return { data, error };
};
