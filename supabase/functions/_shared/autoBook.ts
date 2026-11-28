/**
 * Core automated booking engine for `gym-auto-book`.
 *
 * Preserves all booking invariants:
 * - Runs after 07:00 in Europe/Rome (unless `forceTime` is explicitly set)
 * - 20-day booking window (`today` .. `today + 19` in Europe/Rome)
 * - Exact normalized course name + HH:MM:SS start-time slot matching
 * - Checks `IsUserPresent` and `UserPositionWaitingList` (with `WaitingListPosition` fallback)
 * - Per-user daily distributed lock (`acquire_booking_lock`) with `failed` status + 5m retry on error
 * - Safe `dryRun` mode that never calls `bookLesson` and never mutates `booking_daily_lock`
 */
import { bookLesson, listWithMine } from './gymClient.ts';
import { type SupabaseAdminLike, withGymSession } from './gymSession.ts';
import { formatApiTime, getBookingWindowStrings, getZonedParts } from './schedule.ts';
import { formatAutoBookErrorAlert, sendTelegramMessage } from './telegram.ts';

const DEFAULT_TIMEZONE = 'Europe/Rome';
const LOCK_TTL_MINUTES = 20;
const LOCK_RETRY_MINUTES = 5;
const DEFAULT_CONCURRENCY = 3;

const encoder = new TextEncoder();

export interface PreferenceRow {
  user_id: string;
  weekday: string;
  course: string;
  lesson_start_time: string;
}

export interface SlotAction {
  course: string;
  lessonStartTime: string;
  lessonId?: number;
  outcome: 'booked' | 'would_book' | 'already_booked' | 'no_seats' | 'no_match' | 'invalid_slot' | 'failed';
  detail?: string;
}

export interface UserRunResult {
  userId: string;
  outcome: 'completed' | 'dry_run' | 'lock_skipped' | 'no_preferences' | 'no_lessons' | 'failed';
  lockStatus?: string;
  slots: SlotAction[];
  error?: string;
}

export interface AutoBookSummary {
  timeZone: string;
  runDate: string;
  targetDate: string;
  targetWeekday: string;
  dryRun: boolean;
  skippedByTimeGate: boolean;
  processedUsers: number;
  bookedCount: number;
  wouldBookCount: number;
  failedUsers: number;
  notifiedUsers: number;
  results: UserRunResult[];
}

export interface AutoBookDeps {
  timeZone?: string;
  dryRun?: boolean;
  forceTime?: boolean;
  concurrency?: number;
  now?: () => Date;
  listLessonsFn?: (
    token: string,
    startDate: string,
    endDate: string,
    timeStart: string,
    timeEnd: string,
  ) => Promise<Record<string, unknown>>;
  bookLessonFn?: (token: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loginFn?: (username: string, password: string) => Promise<string>;
  telegramBotToken?: string;
  sendTelegramFn?: (botToken: string, chatId: string, htmlText: string) => Promise<boolean>;
}

/**
 * Constant-time verification of `Authorization: Bearer <CRON_SECRET>` using SHA-256 digests.
 */
export async function verifyCronSecret(
  authHeader: string,
  expectedSecret: string,
): Promise<boolean> {
  const trimmedExpected = String(expectedSecret || '').trim();
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!trimmedExpected || !token) {
    return false;
  }

  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(trimmedExpected)),
  ]);

  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function parseIntSafe(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Normalize a preference slot into `[lowercaseCourse, "HH:MM:SS"]`. */
export function normalizePreferenceSlot(
  slot: { course?: unknown; lesson_start_time?: unknown } | null | undefined,
): [string, string] | null {
  if (!slot) return null;
  const course = String(slot.course || '').trim().toLowerCase();
  const startTime = formatApiTime(String(slot.lesson_start_time || ''));
  if (!course || !startTime) return null;
  return [course, startTime];
}

/** Check whether the user is already booked or on the waiting list for a lesson. */
export function isLessonAlreadyBooked(lesson: Record<string, unknown>): boolean {
  const isPresent = parseIntSafe(lesson?.IsUserPresent, 0) === 1 || lesson?.IsUserPresent === true;
  const waitingPos = parseIntSafe(
    lesson?.UserPositionWaitingList !== undefined && lesson?.UserPositionWaitingList !== null
      ? lesson.UserPositionWaitingList
      : lesson?.WaitingListPosition,
    0,
  );
  return isPresent || waitingPos > 0;
}

/** Return the lesson matching the exact normalized course name and `HH:MM:SS` start time. */
export function findMatchingLesson(
  targetLessons: Record<string, unknown>[],
  desiredCourse: string,
  desiredStartTime: string,
): Record<string, unknown> | null {
  for (const item of targetLessons) {
    const serviceDesc = String(item?.ServiceDescription || '').trim().toLowerCase();
    const startTime = formatApiTime(String(item?.StartTime || ''));
    if (!startTime) continue;
    if (serviceDesc !== desiredCourse) continue;
    if (startTime !== desiredStartTime) continue;
    return item;
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function completeBookingLock(
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
  runDate: string,
  runId: string,
  status: 'completed' | 'failed',
  nowMs: number,
  error?: string,
): Promise<void> {
  const lockUntilMs = status === 'failed'
    ? nowMs + LOCK_RETRY_MINUTES * 60_000
    : nowMs;

  await supabaseAdmin
    .from('booking_daily_lock')
    .update({
      status,
      error: error || null,
      locked_until: new Date(lockUntilMs).toISOString(),
    })
    .match({
      user_id: userId,
      run_date: runDate,
      run_id: runId,
    });
}

/** Run automated bookings across all registered users. */
export async function runAutoBooking(
  supabaseAdmin: SupabaseAdminLike,
  deps: AutoBookDeps = {},
): Promise<AutoBookSummary> {
  const timeZone = deps.timeZone || Deno.env.get('APP_TIMEZONE') || DEFAULT_TIMEZONE;
  const dryRun = Boolean(deps.dryRun);
  const forceTime = Boolean(deps.forceTime);
  const nowFn = deps.now || (() => new Date());
  const listLessonsFn = deps.listLessonsFn || listWithMine;
  const bookLessonFn = deps.bookLessonFn || bookLesson;

  const nowInstant = nowFn();
  const zoned = getZonedParts(timeZone, nowInstant);
  const windowStrings = getBookingWindowStrings(zoned.isoDate);

  if (!forceTime && zoned.hour < 7) {
    return {
      timeZone,
      runDate: zoned.isoDate,
      targetDate: windowStrings.targetDate,
      targetWeekday: windowStrings.targetWeekday,
      dryRun,
      skippedByTimeGate: true,
      processedUsers: 0,
      bookedCount: 0,
      wouldBookCount: 0,
      failedUsers: 0,
      notifiedUsers: 0,
      results: [],
    };
  }

  const { data: userRows, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, username');

  if (usersError) {
    throw new Error(`Failed to load users: ${usersError.message}`);
  }

  const users: { id: string; username: string }[] = Array.isArray(userRows) ? userRows : [];
  if (users.length === 0) {
    return {
      timeZone,
      runDate: zoned.isoDate,
      targetDate: windowStrings.targetDate,
      targetWeekday: windowStrings.targetWeekday,
      dryRun,
      skippedByTimeGate: false,
      processedUsers: 0,
      bookedCount: 0,
      wouldBookCount: 0,
      failedUsers: 0,
      notifiedUsers: 0,
      results: [],
    };
  }

  const userIds = users.map((u) => String(u.id));
  const { data: prefRows, error: prefsError } = await supabaseAdmin
    .from('preferences')
    .select('user_id, weekday, course, lesson_start_time')
    .in('user_id', userIds);

  if (prefsError) {
    throw new Error(`Failed to load preferences: ${prefsError.message}`);
  }

  const prefsByUser = new Map<string, PreferenceRow[]>();
  for (const row of (prefRows || []) as PreferenceRow[]) {
    const uid = String(row.user_id);
    const weekday = String(row.weekday || '').trim().toLowerCase();
    if (weekday !== windowStrings.targetWeekday) continue;
    const list = prefsByUser.get(uid) || [];
    list.push(row);
    prefsByUser.set(uid, list);
  }

  for (const list of prefsByUser.values()) {
    list.sort((a, b) => {
      const timeCmp = String(a.lesson_start_time).localeCompare(String(b.lesson_start_time));
      return timeCmp !== 0 ? timeCmp : String(a.course).localeCompare(String(b.course));
    });
  }

  const concurrency = deps.concurrency || DEFAULT_CONCURRENCY;
  const results = await mapWithConcurrency(users, concurrency, async (user): Promise<UserRunResult> => {
    const userId = String(user.id);
    let runId = '';

    if (!dryRun) {
      const { data: lockData, error: lockError } = await supabaseAdmin.rpc('acquire_booking_lock', {
        p_user_id: userId,
        p_run_date: zoned.isoDate,
        p_ttl: `${LOCK_TTL_MINUTES} minutes`,
      });

      if (lockError) {
        return {
          userId,
          outcome: 'failed',
          slots: [],
          error: `Lock error: ${lockError.message}`,
        };
      }

      const lockRow = Array.isArray(lockData) ? lockData[0] : lockData;
      if (!lockRow?.acquired) {
        return {
          userId,
          outcome: 'lock_skipped',
          lockStatus: lockRow?.status ? String(lockRow.status) : undefined,
          slots: [],
        };
      }
      runId = String(lockRow.run_id);
    }

    try {
      const desiredSlots = prefsByUser.get(userId) || [];
      if (desiredSlots.length === 0) {
        if (!dryRun) {
          await completeBookingLock(
            supabaseAdmin,
            userId,
            zoned.isoDate,
            runId,
            'completed',
            nowFn().getTime(),
          );
        }
        return {
          userId,
          outcome: dryRun ? 'dry_run' : 'no_preferences',
          slots: [],
        };
      }

      return await withGymSession(
        supabaseAdmin,
        userId,
        async (gymToken) => {
          const listResponse = await listLessonsFn(
            gymToken,
            windowStrings.startDate,
            windowStrings.endDate,
            windowStrings.timeStart,
            windowStrings.timeEnd,
          );

          const rawItems: Record<string, unknown>[] = Array.isArray(listResponse?.Items)
            ? listResponse.Items
            : [];

          const targetLessons = rawItems.filter((item) => {
            const lessonDate = String(item?.DateLesson || '').slice(0, 10);
            const category = String(item?.CategoryDescription || '').trim();
            return lessonDate === windowStrings.targetDate && category === 'CORSI FIT';
          });

          if (targetLessons.length === 0) {
            if (!dryRun) {
              await completeBookingLock(
                supabaseAdmin,
                userId,
                zoned.isoDate,
                runId,
                'completed',
                nowFn().getTime(),
              );
            }
            return {
              userId,
              outcome: dryRun ? 'dry_run' : 'no_lessons',
              slots: [],
            };
          }

          const slotActions: SlotAction[] = [];
          const bookingErrors: string[] = [];

          for (const rawSlot of desiredSlots) {
            const normalized = normalizePreferenceSlot(rawSlot);
            if (!normalized) {
              slotActions.push({
                course: String(rawSlot?.course || ''),
                lessonStartTime: String(rawSlot?.lesson_start_time || ''),
                outcome: 'invalid_slot',
              });
              continue;
            }

            const [desiredCourse, desiredStartTime] = normalized;
            const lesson = findMatchingLesson(targetLessons, desiredCourse, desiredStartTime);

            if (!lesson) {
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                outcome: 'no_match',
              });
              continue;
            }

            const lessonId = parseIntSafe(lesson.IDLesson, 0);

            if (isLessonAlreadyBooked(lesson)) {
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                lessonId,
                outcome: 'already_booked',
              });
              continue;
            }

            const availablePlaces = parseIntSafe(lesson.AvailablePlaces, 0);
            if (availablePlaces <= 0) {
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                lessonId,
                outcome: 'no_seats',
              });
              continue;
            }

            const lessonDateIso = String(lesson.DateLesson || '').slice(0, 10);
            const startTimeStr = formatApiTime(String(lesson.StartTime || ''));
            const endTimeStr = formatApiTime(String(lesson.EndTime || ''));
            if (!lessonDateIso || !startTimeStr || !endTimeStr) {
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                lessonId,
                outcome: 'invalid_slot',
                detail: 'Invalid lesson date/time from portal',
              });
              continue;
            }

            const payload = {
              Note: '',
              BookNr: 0,
              BookingID: parseIntSafe(lesson.IDServizio, 0),
              StartTime: `${lessonDateIso}T${startTimeStr}`,
              EndTime: `${lessonDateIso}T${endTimeStr}`,
              IDLesson: lessonId,
              Type: 0,
              IDDurata: 0,
            };

            if (dryRun) {
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                lessonId,
                outcome: 'would_book',
              });
              continue;
            }

            try {
              const bookRes = await bookLessonFn(gymToken, payload);
              if (bookRes?.Successful === false) {
                const msg = String(bookRes?.ErrorMessage || bookRes?.Comment || 'Booking unsuccessful');
                bookingErrors.push(`lesson ${lessonId}: ${msg}`);
                slotActions.push({
                  course: desiredCourse,
                  lessonStartTime: desiredStartTime,
                  lessonId,
                  outcome: 'failed',
                  detail: msg,
                });
              } else {
                slotActions.push({
                  course: desiredCourse,
                  lessonStartTime: desiredStartTime,
                  lessonId,
                  outcome: 'booked',
                });
              }
            } catch (bookErr) {
              const msg = bookErr instanceof Error ? bookErr.message : String(bookErr);
              bookingErrors.push(`lesson ${lessonId}: ${msg}`);
              slotActions.push({
                course: desiredCourse,
                lessonStartTime: desiredStartTime,
                lessonId,
                outcome: 'failed',
                detail: msg,
              });
            }
          }

          if (!dryRun) {
            if (bookingErrors.length > 0) {
              const combinedError = bookingErrors.join('; ');
              await completeBookingLock(
                supabaseAdmin,
                userId,
                zoned.isoDate,
                runId,
                'failed',
                nowFn().getTime(),
                combinedError,
              );
              return {
                userId,
                outcome: 'failed',
                slots: slotActions,
                error: combinedError,
              };
            }

            await completeBookingLock(
              supabaseAdmin,
              userId,
              zoned.isoDate,
              runId,
              'completed',
              nowFn().getTime(),
            );
          }

          return {
            userId,
            outcome: dryRun ? 'dry_run' : 'completed',
            slots: slotActions,
          };
        },
        {
          idempotent: false,
          now: () => nowFn().getTime(),
          loginFn: deps.loginFn,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      if (!dryRun && runId) {
        await completeBookingLock(
          supabaseAdmin,
          userId,
          zoned.isoDate,
          runId,
          'failed',
          nowFn().getTime(),
          message,
        );
      }
      return {
        userId,
        outcome: 'failed',
        slots: [],
        error: message,
      };
    }
  });

  let bookedCount = 0;
  let wouldBookCount = 0;
  let failedUsers = 0;

  for (const res of results) {
    if (res.outcome === 'failed') {
      failedUsers += 1;
    }
    for (const slot of res.slots) {
      if (slot.outcome === 'booked') bookedCount += 1;
      if (slot.outcome === 'would_book') wouldBookCount += 1;
    }
  }

  // Best-effort Telegram error alerts (never run in dryRun, never block or fail the job).
  let notifiedUsers = 0;
  if (!dryRun && failedUsers > 0) {
    const botToken = String(
      deps.telegramBotToken ?? Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '',
    ).trim();
    const sendFn = deps.sendTelegramFn || sendTelegramMessage;

    if (botToken || deps.sendTelegramFn) {
      try {
        const failedResults = results.filter((res) => res.outcome === 'failed');
        const failedUserIds = failedResults.map((res) => res.userId);
        const usernameById = new Map(users.map((u) => [String(u.id), String(u.username || '')]));

        const { data: tgRows } = await supabaseAdmin
          .from('telegram_connections')
          .select('user_id, chat_id, enabled, last_error_notified_date')
          .in('user_id', failedUserIds);

        const connByUser = new Map<string, Record<string, unknown>>();
        for (const row of (tgRows || []) as Record<string, unknown>[]) {
          if (row?.user_id && row?.chat_id && row?.enabled !== false) {
            connByUser.set(String(row.user_id), row);
          }
        }

        for (const failedRes of failedResults) {
          const conn = connByUser.get(failedRes.userId);
          if (!conn) continue;

          // Send at most one error alert per user per day so backup retries do not spam.
          const alreadyNotifiedToday =
            String(conn.last_error_notified_date || '').slice(0, 10) === zoned.isoDate;
          if (alreadyNotifiedToday) continue;

          const desiredSlots = prefsByUser.get(failedRes.userId) || [];
          const desiredCourses = desiredSlots
            .map((slot) => {
              const normalized = normalizePreferenceSlot(slot);
              if (!normalized) return '';
              return `${normalized[0].toUpperCase()} (${normalized[1].slice(0, 5)})`;
            })
            .filter(Boolean);

          const alertHtml = formatAutoBookErrorAlert({
            username: usernameById.get(failedRes.userId) || '',
            targetDate: windowStrings.targetDate,
            targetWeekday: windowStrings.targetWeekday,
            desiredCourses,
            error: failedRes.error || 'Automated booking failed',
          });

          const sent = await sendFn(botToken, String(conn.chat_id), alertHtml);
          if (sent) {
            notifiedUsers += 1;
            await supabaseAdmin
              .from('telegram_connections')
              .update({
                last_error_notified_date: zoned.isoDate,
                updated_at: nowFn().toISOString(),
              })
              .eq('user_id', failedRes.userId);
          }
        }
      } catch (_notifyErr) {
        // Swallow notification errors so booking summary still returns cleanly.
      }
    }
  }

  return {
    timeZone,
    runDate: zoned.isoDate,
    targetDate: windowStrings.targetDate,
    targetWeekday: windowStrings.targetWeekday,
    dryRun,
    skippedByTimeGate: false,
    processedUsers: users.length,
    bookedCount,
    wouldBookCount,
    failedUsers,
    notifiedUsers,
    results,
  };
}
