import { supabase } from '@/api/supabase';
import type { Database } from '@/types/database';

export type Trip = Database['public']['Tables']['tf_trips']['Row'];

export async function fetchTrips(householdId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('tf_trips')
    .select('*')
    .eq('household_id', householdId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTrip(
  householdId: string,
  input: { name: string; start_date: string; end_date: string },
): Promise<Trip> {
  const { data, error } = await supabase
    .from('tf_trips')
    .insert({
      household_id: householdId,
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      is_work: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrip(tripId: string): Promise<void> {
  const { error } = await supabase.from('tf_trips').delete().eq('id', tripId);
  if (error) throw error;
}
