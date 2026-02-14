import { supabaseAdmin } from '@/lib/supabase/admin';
import type { BestTime, ScheduleSettings } from '@/types';

export async function getBestTimes(
  userId: string,
  settings: ScheduleSettings
): Promise<BestTime[]> {
  let query = supabaseAdmin
    .from('best_times')
    .select('*')
    .eq('user_id', userId);

  if (settings.best_time_source !== 'both') {
    query = query.eq('source', settings.best_time_source);
  }

  const { data } = await query.order('score', { ascending: false });
  return (data || []) as BestTime[];
}

export function filterBlackoutHours(
  times: BestTime[],
  blackoutHours: number[]
): BestTime[] {
  return times.filter(t => !blackoutHours.includes(t.hour));
}
