'use client';

import { useState, useEffect, useCallback, useActionState } from 'react';
import { Card } from '@/components/ui/Card';
import { Btn } from '@/components/ui/Btn';
import { Pill } from '@/components/ui/Pill';
import { Label } from '@/components/ui/Label';
import {
  updateProfile,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  type ActionResult,
} from '@/app/actions/settings';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface FitbitStatus {
  connected: boolean;
  userId: string | null;
  tokenExpired: boolean | null;
  lastSync: {
    startedAt: string;
    completedAt: string | null;
    recordsSynced: number;
    error: string | null;
  } | null;
}

interface SyncResult {
  ok: boolean;
  stats?: Record<string, number>;
  error?: string;
  reauth?: boolean;
}

interface ProfileData {
  name: string | null;
  age: number | null;
  heightInches: number | null;
  activityLevel: string | null;
  timezone: string | null;
  weeklyPaceLbs: number | null;
}

interface MilestoneData {
  id: number;
  label: string;
  type: string;
  targetDate: string | null;
  targetWeight: number | null;
  targetBodyFat: number | null;
  isPrimary: boolean | null;
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const inputClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-[var(--t1)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--amber)]/50 focus:ring-1 focus:ring-[var(--amber)]/30';

const selectClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:border-[var(--amber)]/50 focus:ring-1 focus:ring-[var(--amber)]/30';

const labelClass = 'block text-xs font-medium mb-1';

/* ─── Profile Editor ──────────────────────────────────────────────────────── */

function ProfileEditor({ initial }: { initial: ProfileData | null }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <Card className="mb-4">
      <Label>Profile</Label>
      <form action={action} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Name</label>
            <input
              name="name"
              type="text"
              defaultValue={initial?.name ?? ''}
              className={inputClass}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Age</label>
            <input
              name="age"
              type="number"
              defaultValue={initial?.age ?? ''}
              className={inputClass}
              min={1}
              max={120}
            />
            {state?.fieldErrors?.age && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--rose)' }}>{state.fieldErrors.age}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Height (inches)</label>
            <input
              name="heightInches"
              type="number"
              step="0.5"
              defaultValue={initial?.heightInches ?? ''}
              className={inputClass}
            />
            {state?.fieldErrors?.heightInches && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--rose)' }}>{state.fieldErrors.heightInches}</p>
            )}
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Activity Level</label>
            <select
              name="activityLevel"
              defaultValue={initial?.activityLevel ?? 'moderate'}
              className={selectClass}
            >
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Timezone</label>
            <input
              name="timezone"
              type="text"
              defaultValue={initial?.timezone ?? 'America/Los_Angeles'}
              className={inputClass}
              placeholder="America/Los_Angeles"
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: 'var(--t2)' }}>Weekly Pace (lbs)</label>
            <input
              name="weeklyPaceLbs"
              type="number"
              step="0.1"
              defaultValue={initial?.weeklyPaceLbs ?? ''}
              className={inputClass}
              min={0}
              max={5}
            />
            {state?.fieldErrors?.weeklyPaceLbs && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--rose)' }}>{state.fieldErrors.weeklyPaceLbs}</p>
            )}
          </div>
        </div>

        <Btn type="submit" full color="var(--teal)" disabled={pending}>
          {pending ? 'Saving…' : 'Save Profile'}
        </Btn>

        {state?.ok && (
          <p className="text-sm font-medium" style={{ color: 'var(--teal)' }}>✓ Profile updated</p>
        )}
        {state?.error && !state.fieldErrors && (
          <p className="text-sm font-medium" style={{ color: 'var(--rose)' }}>{state.error}</p>
        )}
      </form>
    </Card>
  );
}

/* ─── Milestone Form (add/edit) ───────────────────────────────────────────── */

function MilestoneForm({
  milestone,
  onDone,
}: {
  milestone?: MilestoneData;
  onDone: () => void;
}) {
  const serverAction = milestone ? updateMilestone : createMilestone;
  const [state, action, pending] = useActionState(serverAction, undefined);

  // Close form on success
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={action} className="space-y-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      {milestone && <input type="hidden" name="id" value={milestone.id} />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--t2)' }}>Label</label>
          <input
            name="label"
            type="text"
            defaultValue={milestone?.label ?? ''}
            className={inputClass}
            placeholder="e.g. Summer Goal"
            required
          />
          {state?.fieldErrors?.label && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--rose)' }}>{state.fieldErrors.label}</p>
          )}
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--t2)' }}>Type</label>
          <select
            name="type"
            defaultValue={milestone?.type ?? 'weight'}
            className={selectClass}
          >
            <option value="weight">Weight</option>
            <option value="bf">Body Fat</option>
            <option value="event">Event</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--t2)' }}>Target Date</label>
          <input
            name="targetDate"
            type="date"
            defaultValue={milestone?.targetDate ?? ''}
            className={inputClass}
            required
          />
          {state?.fieldErrors?.targetDate && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--rose)' }}>{state.fieldErrors.targetDate}</p>
          )}
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--t2)' }}>Target Weight (lbs)</label>
          <input
            name="targetWeight"
            type="number"
            step="0.1"
            defaultValue={milestone?.targetWeight ?? ''}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--t2)' }}>Target Body Fat %</label>
          <input
            name="targetBodyFat"
            type="number"
            step="0.1"
            defaultValue={milestone?.targetBodyFat ?? ''}
            className={inputClass}
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              name="isPrimary"
              type="checkbox"
              defaultChecked={milestone?.isPrimary ?? false}
              className="w-4 h-4 rounded accent-[var(--amber)]"
            />
            <span className="text-sm" style={{ color: 'var(--t2)' }}>Primary milestone</span>
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <Btn type="submit" color="var(--teal)" disabled={pending}>
          {pending ? 'Saving…' : milestone ? 'Update' : 'Add Milestone'}
        </Btn>
        <Btn type="button" color="var(--t3)" onClick={onDone}>
          Cancel
        </Btn>
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm font-medium" style={{ color: 'var(--rose)' }}>{state.error}</p>
      )}
    </form>
  );
}

/* ─── Milestone Card ──────────────────────────────────────────────────────── */

function MilestoneCard({
  m,
  onEdit,
  onRefresh,
}: {
  m: MilestoneData;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [delState, delAction, delPending] = useActionState(deleteMilestone, undefined);

  useEffect(() => {
    if (delState?.ok) onRefresh();
  }, [delState?.ok, onRefresh]);

  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--t1)' }}>
            {m.label}
          </span>
          <Pill
            color={m.type === 'weight' ? 'var(--teal)' : m.type === 'bf' ? 'var(--amber)' : 'var(--purple)'}
            active
          >
            {m.type}
          </Pill>
          {m.isPrimary && (
            <Pill color="var(--amber)" active>
              primary
            </Pill>
          )}
        </div>
        <div className="flex gap-4 mt-1">
          <span className="text-xs" style={{ color: 'var(--t3)' }}>
            {formatDate(m.targetDate)}
          </span>
          {m.targetWeight && (
            <span className="text-xs" style={{ color: 'var(--t3)' }}>
              {m.targetWeight} lbs
            </span>
          )}
          {m.targetBodyFat && (
            <span className="text-xs" style={{ color: 'var(--t3)' }}>
              {m.targetBodyFat}% bf
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 ml-3 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="px-2.5 py-1 rounded-lg text-xs font-medium border border-white/[0.08] hover:bg-white/[0.04] transition-colors"
          style={{ color: 'var(--t2)' }}
        >
          Edit
        </button>
        <form action={delAction}>
          <input type="hidden" name="id" value={m.id} />
          <button
            type="submit"
            disabled={delPending}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-white/[0.08] hover:bg-[var(--rose)]/10 transition-colors"
            style={{ color: 'var(--rose)' }}
          >
            {delPending ? '…' : 'Delete'}
          </button>
        </form>
      </div>
      {delState?.error && (
        <p className="text-xs mt-1" style={{ color: 'var(--rose)' }}>{delState.error}</p>
      )}
    </div>
  );
}

/* ─── Milestones Manager ──────────────────────────────────────────────────── */

function MilestonesManager({
  milestones: initialMilestones,
  onRefresh,
}: {
  milestones: MilestoneData[];
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleDone = useCallback(() => {
    setShowAdd(false);
    setEditingId(null);
    onRefresh();
  }, [onRefresh]);

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between">
        <Label>Milestones</Label>
        {!showAdd && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="text-xs font-medium px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] transition-colors"
            style={{ color: 'var(--teal)' }}
          >
            + Add
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {initialMilestones.length === 0 && !showAdd && (
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            No milestones yet. Add one to track your goals.
          </p>
        )}

        {initialMilestones.map((m) =>
          editingId === m.id ? (
            <MilestoneForm key={m.id} milestone={m} onDone={handleDone} />
          ) : (
            <MilestoneCard
              key={m.id}
              m={m}
              onEdit={() => { setEditingId(m.id); setShowAdd(false); }}
              onRefresh={handleDone}
            />
          )
        )}

        {showAdd && <MilestoneForm onDone={handleDone} />}
      </div>
    </Card>
  );
}

/* ─── Settings Page ────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  // Profile + milestones data
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [milestonesList, setMilestonesList] = useState<MilestoneData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Fitbit status
  const [fitbitStatus, setFitbitStatus] = useState<FitbitStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  /* ── Fetch Profile + Milestones ────────────────────────────────────────── */

  const fetchProfileData = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/profile');
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.profile);
      setMilestonesList(data.milestones ?? []);
    } catch {
      // Silently fail — profile editor still works with empty defaults
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  /* ── Fetch Fitbit Status ──────────────────────────────────────────────── */

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await fetch('/api/fitbit/status');
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const data: FitbitStatus = await res.json();
      setFitbitStatus(data);
    } catch (err) {
      setStatusError((err as Error).message);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  /* ── Manual Sync ──────────────────────────────────────────────────────── */

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/fitbit/sync', { method: 'POST' });
      const data: SyncResult = await res.json();
      if (!res.ok || !data.ok) {
        if (data.reauth) {
          setSyncError('Authorization expired — please reconnect Fitbit.');
        } else {
          setSyncError(data.error ?? 'Sync failed');
        }
        return;
      }
      const total = data.stats
        ? Object.values(data.stats).reduce((a, b) => a + b, 0)
        : 0;
      setSyncMsg(`✓ Synced ${total} records`);
      fetchStatus();
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  /* ── Data Export ──────────────────────────────────────────────────────── */

  const handleExport = () => {
    setExporting(true);
    const a = document.createElement('a');
    a.href = '/api/export';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setExporting(false), 2000);
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="pb-[100px]">
      <h1
        className="text-2xl font-bold mb-6"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Settings
      </h1>

      {/* ── Section 1: Profile Editor ────────────────────────────────── */}
      {dataLoading ? (
        <Card className="mb-4">
          <Label>Profile</Label>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-block w-4 h-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: 'var(--t3)',
                borderTopColor: 'var(--amber)',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--t2)' }}>
              Loading profile…
            </span>
          </div>
        </Card>
      ) : (
        <ProfileEditor initial={profile} />
      )}

      {/* ── Section 2: Milestones Manager ────────────────────────────── */}
      {!dataLoading && (
        <MilestonesManager
          milestones={milestonesList}
          onRefresh={fetchProfileData}
        />
      )}

      {/* ── Section 3: Fitbit Connection ─────────────────────────────── */}
      <Card className="mb-4">
        <Label>Fitbit Connection</Label>

        <div className="mt-3 flex items-center gap-3">
          {statusLoading ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-4 h-4 border-2 rounded-full animate-spin"
                style={{
                  borderColor: 'var(--t3)',
                  borderTopColor: 'var(--amber)',
                }}
              />
              <span className="text-sm" style={{ color: 'var(--t2)' }}>
                Checking connection…
              </span>
            </div>
          ) : statusError ? (
            <span className="text-sm" style={{ color: 'var(--rose)' }}>
              Error: {statusError}
            </span>
          ) : fitbitStatus?.connected ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Pill color="var(--teal)" active>
                  Connected
                </Pill>
                {fitbitStatus.tokenExpired && (
                  <Pill color="var(--rose)" active>
                    Token Expired
                  </Pill>
                )}
              </div>
              {fitbitStatus.userId && (
                <span className="text-xs" style={{ color: 'var(--t3)' }}>
                  User: {fitbitStatus.userId}
                </span>
              )}
              {fitbitStatus.lastSync && (
                <span className="text-xs" style={{ color: 'var(--t3)' }}>
                  Last sync:{' '}
                  {formatRelativeTime(fitbitStatus.lastSync.startedAt)}
                  {fitbitStatus.lastSync.recordsSynced
                    ? ` · ${fitbitStatus.lastSync.recordsSynced} records`
                    : ''}
                </span>
              )}
            </div>
          ) : (
            <Pill color="var(--rose)">Not Connected</Pill>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <Btn
            color="var(--teal)"
            onClick={() => {
              window.location.href = '/api/fitbit/authorize';
            }}
          >
            {fitbitStatus?.connected ? 'Reconnect' : 'Connect Fitbit'}
          </Btn>
          <Btn
            color="var(--amber)"
            disabled={!fitbitStatus?.connected || syncing}
            onClick={handleSync}
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Btn>
        </div>

        {syncMsg && (
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--teal)' }}>
            {syncMsg}
          </p>
        )}
        {syncError && (
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--rose)' }}>
            {syncError}
          </p>
        )}
      </Card>

      {/* ── Section 4: Data Export ────────────────────────────────────── */}
      <Card className="mb-4">
        <Label>Data Export</Label>
        <p className="mt-2 text-sm" style={{ color: 'var(--t2)' }}>
          Download all your tracked data as a JSON file. Includes weight, sleep,
          activity, heart rate, diet, and alcohol logs.
        </p>
        <div className="mt-4">
          <Btn
            full
            color="var(--amber)"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? 'Downloading…' : 'Export All Data'}
          </Btn>
        </div>
      </Card>

      {/* ── Section 5: App Info ───────────────────────────────────────── */}
      <Card className="mb-4">
        <Label>App Info</Label>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: 'var(--t1)' }}>
              Momentum
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--amber)',
              }}
            >
              v1.0.0
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--t2)' }}>
            Track how daily choices cascade into body composition changes. Context
            over judgment — every decision has a cost, and recovery is always an
            option.
          </p>
        </div>
      </Card>

      {/* ── Section 6: About ─────────────────────────────────────────── */}
      <Card className="mb-4">
        <Label>About</Label>
        <p className="mt-3 text-sm" style={{ color: 'var(--t3)' }}>
          Momentum · Body composition tracker
        </p>
      </Card>
    </div>
  );
}
