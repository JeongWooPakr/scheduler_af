import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // supabaseClient.js 경로에 맞게 조정하세요.

export const useAdmin = (user) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const checkAdminStatus = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching role:', error);
      } else if (data) {
        setIsAdmin(data.role === 'admin');
      }
      setLoading(false);
    };

    checkAdminStatus();
  }, [user]);

  return { isAdmin, loading };
};