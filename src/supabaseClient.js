import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL; // .env 파일의 REACT_APP_SUPABASE_URL 값을 찾아옴
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY; // .env 파일의 REACT_APP_SUPABASE_KEY 값을 찾아옴
export const supabase = createClient(supabaseUrl, supabaseKey);