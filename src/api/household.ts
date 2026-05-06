import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/api/auth';

export interface Household {
  id: string;
  name: string;
}

export function useHousehold(): Household | null {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['my-household', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Two-step lookup: get household_id from membership, then load the household
      const { data: member, error: memberErr } = await supabase
        .from('tf_household_members')
        .select('household_id')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();
      if (memberErr) throw memberErr;
      if (!member) return null;

      const { data: hh, error: hhErr } = await supabase
        .from('tf_households')
        .select('id, name')
        .eq('id', member.household_id)
        .single();
      if (hhErr) throw hhErr;
      return hh as Household;
    },
  });

  return data ?? null;
}

export function useUser() {
  const { user } = useAuth();
  return user;
}