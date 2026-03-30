'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Btn } from '@/components/ui/Btn';
import { Pill } from '@/components/ui/Pill';
import { Label } from '@/components/ui/Label';

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

/* ─── Settings Page ────────────────────────────────────────────────────────── */

export default function SettingsPage() {
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
      // Sum up all synced records from stats
      const total = data.stats
        ? Object.values(data.stats).reduce((a, b) => a + b, 0)
        : 0;
      setSyncMsg(`✓ Synced ${total} records`);
      // Refresh status after sync
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
    // Create temporary anchor to trigger download
    const a = document.createElement('a');
    a.href = '/api/export';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Reset after a moment (download is async)
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

      {/* ── Section 1: Fitbit Connection ──────────────────────────────── */}
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

      {/* ── Section 2: Data Export ────────────────────────────────────── */}
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

      {/* ── Section 3: App Info ───────────────────────────────────────── */}
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

      {/* ── Section 4: About ─────────────────────────────────────────── */}
      <Card className="mb-4">
        <Label>About</Label>
        <p className="mt-3 text-sm" style={{ color: 'var(--t3)' }}>
          Momentum · Body composition tracker
        </p>
      </Card>
    </div>
  );
}
