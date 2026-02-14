import { supabaseAdmin } from '@/lib/supabase/admin';
import { getBestTimes, filterBlackoutHours } from './best-times';
import { addHours, setHours, setMinutes, startOfDay, addDays, isBefore } from 'date-fns';
import type { ScheduleSettings } from '@/types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export async function assignSchedule(
  postId: string,
  userId: string
): Promise<string | null> {
  const { data: settings } = await supabaseAdmin
    .from('schedule_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!settings) return null;
  const s = settings as ScheduleSettings;

  if (s.scheduling_mode === 'manual') return null;

  const now = new Date();

  if (s.scheduling_mode === 'fixed' && s.fixed_times) {
    const fixedTimes = s.fixed_times as string[];
    const scheduledAt = await findNextFixedSlot(userId, fixedTimes, now, s);
    if (scheduledAt) {
      await supabaseAdmin
        .from('posts')
        .update({ status: 'scheduled', scheduled_at: scheduledAt })
        .eq('id', postId);
      return scheduledAt;
    }
  }

  if (s.scheduling_mode === 'best_time' || s.scheduling_mode === 'hybrid') {
    const bestTimes = await getBestTimes(userId, s);
    const filtered = filterBlackoutHours(bestTimes, s.blackout_hours || []);
    const scheduledAt = await findNextBestSlot(userId, filtered, now, s);
    if (scheduledAt) {
      await supabaseAdmin
        .from('posts')
        .update({ status: 'scheduled', scheduled_at: scheduledAt })
        .eq('id', postId);
      return scheduledAt;
    }
  }

  return null;
}

async function findNextFixedSlot(
  userId: string,
  fixedTimes: string[],
  now: Date,
  settings: ScheduleSettings
): Promise<string | null> {
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = addDays(now, dayOffset);
    const dayOfWeek = day.getDay();
    const dayKey = DAY_KEYS[dayOfWeek];
    const maxPosts = (settings.day_posts as Record<string, number>)?.[dayKey] || 0;

    if (maxPosts === 0) continue;

    const { count } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('scheduled_at', startOfDay(day).toISOString())
      .lt('scheduled_at', startOfDay(addDays(day, 1)).toISOString())
      .in('status', ['scheduled', 'posting', 'posted']);

    if ((count || 0) >= maxPosts) continue;

    for (const time of fixedTimes) {
      const [h, m] = time.split(':').map(Number);
      const slot = setMinutes(setHours(day, h), m || 0);
      if (isBefore(slot, now)) continue;
      if (settings.blackout_hours?.includes(h)) continue;

      const isAvailable = await checkMinInterval(userId, slot, settings.min_interval_hours);
      if (isAvailable) return slot.toISOString();
    }
  }

  return null;
}

async function findNextBestSlot(
  userId: string,
  bestTimes: { day_of_week: number; hour: number; score: number }[],
  now: Date,
  settings: ScheduleSettings
): Promise<string | null> {
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = addDays(now, dayOffset);
    const dayOfWeek = day.getDay();
    const dayKey = DAY_KEYS[dayOfWeek];
    const maxPosts = (settings.day_posts as Record<string, number>)?.[dayKey] || 0;

    if (maxPosts === 0) continue;

    const { count } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('scheduled_at', startOfDay(day).toISOString())
      .lt('scheduled_at', startOfDay(addDays(day, 1)).toISOString())
      .in('status', ['scheduled', 'posting', 'posted']);

    if ((count || 0) >= maxPosts) continue;

    const dayTimes = bestTimes
      .filter(t => t.day_of_week === dayOfWeek)
      .sort((a, b) => b.score - a.score);

    for (const bt of dayTimes) {
      const slot = setMinutes(setHours(day, bt.hour), 0);
      if (isBefore(slot, now)) continue;

      const isAvailable = await checkMinInterval(userId, slot, settings.min_interval_hours);
      if (isAvailable) return slot.toISOString();
    }
  }

  return null;
}

async function checkMinInterval(
  userId: string,
  slot: Date,
  minIntervalHours: number
): Promise<boolean> {
  const before = addHours(slot, -minIntervalHours);
  const after = addHours(slot, minIntervalHours);

  const { count } = await supabaseAdmin
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_at', before.toISOString())
    .lte('scheduled_at', after.toISOString())
    .in('status', ['scheduled', 'posting', 'posted']);

  return (count || 0) === 0;
}
