import { useState, useMemo, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from 'wouter';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Loader2, Monitor, Shield, CalendarDays, RefreshCw } from 'lucide-react';

// Light-mode palette constants
const PAGE_BG = '#f4f5f7';
const CARD_BG = '#ffffff';
const CARD_BORDER = '#d1d5db';
const BRAND = '#1e3a5f';
const FONT_STACK =
  "'Barlow Condensed', 'Arial Narrow', 'Impact', ui-sans-serif, system-ui, sans-serif";

const PRODUCTION_STAGES = ['PREP', 'LAYUP', 'WRAP', 'OVEN', 'QC', 'FINAL'] as const;
type Stage = typeof PRODUCTION_STAGES[number];

// Default cure duration — 8 hours; per-traveler override pending backend support
const DEFAULT_CURE_DURATION_MS = 8 * 60 * 60 * 1000;

function mapDeptToStage(deptName: string): Stage | null {
  const name = deptName.toUpperCase();
  if (name.includes('FINAL')) return 'FINAL';
  if (name.includes('QC') || name.includes('QUALITY') || name.includes('INSPECT')) return 'QC';
  if (name.includes('OVEN') || name.includes('CURE') || name.includes('AUTOCLAVE')) return 'OVEN';
  if (name.includes('WRAP')) return 'WRAP';
  if (name.includes('LAYUP') || name.includes('LAY-UP') || name.includes('LAY UP')) return 'LAYUP';
  if (name.includes('PREP')) return 'PREP';
  return null;
}

interface StepState {
  stage: Stage;
  status: 'complete' | 'active' | 'pending';
}

function computeStepStates(slot: Slot): StepState[] {
  if (slot.isEmpty || slot.status === 'NOT_STARTED') {
    return PRODUCTION_STAGES.map((stage) => ({ stage, status: 'pending' }));
  }

  if (slot.detail.steps.length > 0) {
    const stageMap: Record<string, 'complete' | 'active' | 'pending'> = {};
    for (const step of slot.detail.steps) {
      const stage = mapDeptToStage(step.departmentName);
      if (!stage) continue;
      const isDone =
        !!step.completedAt ||
        step.status === 'COMPLETE' ||
        step.status === 'COMPLETED' ||
        step.status === 'DONE';
      const isStarted =
        !!step.startedAt ||
        step.status === 'IN_PROGRESS' ||
        step.status === 'ACTIVE' ||
        step.status === 'STARTED';

      if (isDone) {
        stageMap[stage] = 'complete';
      } else if (isStarted && !stageMap[stage]) {
        stageMap[stage] = 'active';
      } else if (!stageMap[stage]) {
        stageMap[stage] = 'pending';
      }
    }

    const hasActiveOrComplete = Object.values(stageMap).some((s) => s !== 'pending');
    if (hasActiveOrComplete) {
      return PRODUCTION_STAGES.map((stage) => ({
        stage,
        status: stageMap[stage] ?? 'pending',
      }));
    }
  }

  const currentDept = slot.currentDepartment ?? slot.displayLabel ?? '';
  const currentStage = mapDeptToStage(currentDept);

  if (!currentStage && !slot.isGreen) {
    return PRODUCTION_STAGES.map((stage, i) => ({
      stage,
      status: i === 0 ? 'active' : 'pending',
    }));
  }

  const activeStage = currentStage ?? (slot.isGreen ? 'OVEN' : null);
  if (!activeStage) {
    return PRODUCTION_STAGES.map((stage) => ({ stage, status: 'pending' }));
  }

  const activeIdx = PRODUCTION_STAGES.indexOf(activeStage);
  return PRODUCTION_STAGES.map((stage, i) => ({
    stage,
    status: i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'pending',
  }));
}

// Returns 0–6 cure blocks using floor-based progression.
function computeCureBlocks(slot: Slot): number {
  const ovenStart = slot.detail?.ovenStartedAt ?? slot.greenAt;
  if (!ovenStart) return 0;
  const elapsed = Date.now() - new Date(ovenStart).getTime();
  const ratio = elapsed / DEFAULT_CURE_DURATION_MS;
  if (ratio >= 1) return 6;
  if (ratio <= 0) return 0;
  return Math.floor(ratio * 6);
}

// Light-mode status colors: vivid borders/text, very light tint backgrounds
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  GREEN:       { bg: '#f0fdf4', border: '#16a34a', text: '#15803d', label: 'GREEN' },
  BLOCKED:     { bg: '#fff1f2', border: '#dc2626', text: '#b91c1c', label: 'BLOCKED' },
  CANCELLED:   { bg: '#f9fafb', border: '#9ca3af', text: '#6b7280', label: 'VOID' },
  HOLD:        { bg: '#fff1f2', border: '#dc2626', text: '#b91c1c', label: 'HOLD' },
  IN_PROCESS:  { bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8', label: 'IN PROCESS' },
  NOT_STARTED: { bg: '#f9fafb', border: '#e5e7eb', text: '#d1d5db', label: 'EMPTY' },
  PREP:        { bg: '#fffbeb', border: '#d97706', text: '#b45309', label: 'PREP' },
  LAYUP:       { bg: '#fffbeb', border: '#d97706', text: '#b45309', label: 'LAYUP' },
  WRAP:        { bg: '#fffbeb', border: '#d97706', text: '#b45309', label: 'WRAP' },
  OVEN:        { bg: '#fff7ed', border: '#ea580c', text: '#c2410c', label: 'OVEN' },
  QC:          { bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8', label: 'QC' },
  'FINAL QC':  { bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8', label: 'FINAL QC' },
  FINAL:       { bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8', label: 'FINAL' },
};

function getStatusTheme(status: string, displayLabel: string) {
  if (status === 'GREEN')       return STATUS_COLORS.GREEN;
  if (status === 'BLOCKED')     return STATUS_COLORS.BLOCKED;
  if (status === 'CANCELLED')   return STATUS_COLORS.CANCELLED;
  if (status === 'HOLD')        return STATUS_COLORS.HOLD;
  if (status === 'NOT_STARTED') return STATUS_COLORS.NOT_STARTED;
  const byLabel = STATUS_COLORS[displayLabel];
  if (byLabel) return byLabel;
  return STATUS_COLORS.IN_PROCESS;
}

// Light-mode stage progress block colors
const STAGE_COLORS: Record<Stage, { active: string; complete: string; pending: string; activeBg: string; completeBg: string }> = {
  PREP:  { active: '#d97706', activeBg: '#fffbeb', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
  LAYUP: { active: '#d97706', activeBg: '#fffbeb', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
  WRAP:  { active: '#d97706', activeBg: '#fffbeb', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
  OVEN:  { active: '#ea580c', activeBg: '#fff7ed', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
  QC:    { active: '#2563eb', activeBg: '#eff6ff', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
  FINAL: { active: '#2563eb', activeBg: '#eff6ff', complete: '#16a34a', completeBg: '#f0fdf4', pending: '#d1d5db' },
};

function formatElapsed(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatTime(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

interface Slot {
  slotNumber: number;
  isEmpty: boolean;
  isOverflow: boolean;
  travelerId?: string;
  itemIdentifier?: string;
  travelerNumber?: string;
  partNumber?: string;
  partName?: string;
  serialNumber?: string;
  lotNumber?: string;
  travelerStatus?: string;
  status: string;
  displayLabel: string;
  isGreen: boolean;
  greenAt: string | null;
  blockReason: string | null;
  layupStartedAt: string | null;
  elapsedMs: number | null;
  currentDepartment: string | null;
  currentStepStatus?: string | null;
  currentStepStartedAt?: string | null;
  currentStepCompletedAt?: string | null;
  activeOvenRun?: ActiveOvenRun | null;
  detail: {
    travelerId?: string;
    itemIdentifier?: string;
    travelerNumber?: string;
    partNumber?: string;
    partName?: string;
    serialNumber?: string;
    lotNumber?: string;
    currentDepartment?: string | null;
    layupStartedAt?: string | null;
    ovenStartedAt?: string | null;
    elapsedMs?: number | null;
    isGreen?: boolean;
    blockReason?: string | null;
    activeOvenRun?: ActiveOvenRun | null;
    steps: {
      id: string;
      departmentName: string;
      stepNumber: number;
      status: string;
      startedAt: string | null;
      completedAt: string | null;
      blockedAt: string | null;
      blockedReason: string | null;
    }[];
    recentEvents: {
      id: string;
      action: string;
      actor: string;
      actorName: string | null;
      details: any;
      createdAt: string;
    }[];
  };
}

interface ActiveOvenRun {
  runId: string;
  programName: string | null;
  serialNumber: string | null;
  ovenNumber: number | null;
  ovenSlot: string | null;
  startedAt: string | null;
  status: string;
  currentStepIndex: number;
}

interface BoardData {
  businessDate: string;
  date: string;
  isToday: boolean;
  targetSlots: number;
  summary: {
    target: number;
    started: number;
    green: number;
    inProcess: number;
    blocked: number;
    cancelled: number;
    notStarted: number;
    overflowCount: number;
  };
  slots: Slot[];
}

function StepProgressTracker({
  steps,
  isOvenActive,
  cureBlocks,
  isTvMode,
}: {
  steps: StepState[];
  isOvenActive: boolean;
  cureBlocks: number;
  isTvMode: boolean;
}) {
  const blockH = isTvMode ? 28 : 22;
  const labelSize = isTvMode ? '0.65rem' : '0.52rem';
  const checkSize = isTvMode ? '0.85rem' : '0.7rem';
  const gap = isTvMode ? 4 : 3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
      <div style={{ display: 'flex', gap, alignItems: 'stretch' }}>
        {steps.map(({ stage, status }) => {
          const colors = STAGE_COLORS[stage];
          const bg =
            status === 'complete' ? colors.completeBg :
            status === 'active'   ? colors.activeBg :
            '#f3f4f6';
          const borderColor =
            status === 'complete' ? colors.complete :
            status === 'active'   ? colors.active :
            colors.pending;
          const textColor =
            status === 'complete' ? colors.complete :
            status === 'active'   ? colors.active :
            '#9ca3af';

          return (
            <div
              key={stage}
              style={{
                flex: 1,
                height: blockH,
                background: bg,
                border: `1px solid ${borderColor}`,
                borderBottom: status === 'active' ? `3px solid ${borderColor}` : `1px solid ${borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {status === 'complete' ? (
                <span style={{ fontSize: checkSize, color: colors.complete, lineHeight: 1, fontWeight: 900 }}>✓</span>
              ) : (
                <span
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: labelSize,
                    fontWeight: 900,
                    color: textColor,
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                  }}
                >
                  {stage}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isOvenActive && (
        <div style={{ display: 'flex', gap, alignItems: 'center' }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: isTvMode ? 8 : 5,
                background: i < cureBlocks ? '#fb923c' : '#e5e7eb',
                border: `1px solid ${i < cureBlocks ? '#ea580c' : '#d1d5db'}`,
              }}
            />
          ))}
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.6rem' : '0.5rem',
              color: '#ea580c',
              fontWeight: 700,
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              marginLeft: 2,
            }}
          >
            CURE
          </span>
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  isSupervisor,
  isTvMode,
  onClick,
}: {
  slot: Slot;
  isSupervisor: boolean;
  isTvMode: boolean;
  onClick?: (slot: Slot) => void;
}) {
  const theme = getStatusTheme(slot.status, slot.displayLabel);
  const isEmpty = slot.isEmpty;

  const stepStates = useMemo(() => computeStepStates(slot), [slot]);

  const hasOvenStart = !!(slot.detail?.ovenStartedAt ?? slot.greenAt);
  const isOvenActive = !isEmpty && (
    stepStates.some((s) => s.stage === 'OVEN' && s.status === 'active') ||
    (slot.isGreen && hasOvenStart)
  );
  const cureBlocks = useMemo(() => (isOvenActive ? computeCureBlocks(slot) : 0), [isOvenActive, slot]);

  const deptLabel = slot.currentDepartment ?? (slot.displayLabel !== 'NOT_STARTED' ? slot.displayLabel : null);
  const identifier = slot.itemIdentifier ?? slot.travelerNumber ?? slot.serialNumber ?? slot.lotNumber;
  const activeOvenRun = slot.activeOvenRun ?? slot.detail?.activeOvenRun ?? null;

  return (
    <div
      onClick={isSupervisor && !isEmpty ? () => onClick?.(slot) : undefined}
      style={{
        background: isEmpty ? '#f9fafb' : theme.bg,
        border: `1px solid ${isEmpty ? '#e5e7eb' : theme.border}`,
        borderLeft: `4px solid ${isEmpty ? '#e5e7eb' : theme.border}`,
        borderRadius: 4,
        padding: isTvMode ? '12px 12px 10px' : '10px 12px 8px',
        cursor: isSupervisor && !isEmpty ? 'pointer' : 'default',
        minHeight: isTvMode ? 180 : 155,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        transition: 'box-shadow 0.15s',
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
      }}
      className={isSupervisor && !isEmpty ? 'hover:shadow-md' : ''}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span
          style={{
            color: isEmpty ? '#d1d5db' : theme.border,
            fontFamily: FONT_STACK,
            fontSize: isTvMode ? '1.4rem' : '1.15rem',
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '0.04em',
          }}
        >
          #{slot.slotNumber}
          {slot.isOverflow && (
            <span style={{ fontSize: '0.6rem', marginLeft: 4, color: '#f59e0b', fontWeight: 700 }}>+OVF</span>
          )}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {!isEmpty && slot.elapsedMs !== null && (
            <span
              style={{
                fontFamily: FONT_STACK,
                fontSize: isTvMode ? '0.85rem' : '0.72rem',
                color: theme.text,
                fontWeight: 800,
                letterSpacing: '0.04em',
              }}
            >
              {formatElapsed(slot.elapsedMs)}
            </span>
          )}
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.8rem' : '0.68rem',
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: isEmpty ? '#9ca3af' : theme.text,
              padding: '2px 6px',
              border: `1px solid ${isEmpty ? '#e5e7eb' : theme.border}`,
              background: isEmpty ? '#f3f4f6' : `${theme.border}18`,
              flexShrink: 0,
              borderRadius: 2,
            }}
          >
            {isEmpty ? 'EMPTY' : (slot.displayLabel === 'NOT_STARTED' ? '—' : slot.displayLabel)}
          </span>
        </div>
      </div>

      <StepProgressTracker
        steps={stepStates}
        isOvenActive={isOvenActive}
        cureBlocks={cureBlocks}
        isTvMode={isTvMode}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSize: isTvMode ? '0.88rem' : '0.76rem',
            fontWeight: 700,
            color: isEmpty ? '#d1d5db' : '#374151',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '55%',
          }}
        >
          {isEmpty ? 'EMPTY' : (identifier ?? '—')}
        </span>
        {!isEmpty && slot.partNumber && (
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.75rem' : '0.64rem',
              color: '#6b7280',
              fontWeight: 600,
              flexShrink: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '44%',
            }}
          >
            {slot.partNumber}
          </span>
        )}
      </div>

      {!isEmpty && slot.partName && (
        <div
          style={{
            fontFamily: FONT_STACK,
            fontSize: isTvMode ? '0.78rem' : '0.66rem',
            color: '#4b5563',
            fontWeight: 600,
            marginTop: 2,
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {slot.partName}
        </div>
      )}

      {!isEmpty && activeOvenRun && (
        <div
          style={{
            marginTop: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            background: '#fff7ed',
            border: '1px solid #fb923c',
            borderLeft: '3px solid #ea580c',
            padding: '3px 6px',
            borderRadius: 3,
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.72rem' : '0.6rem',
              color: '#c2410c',
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            In oven
          </span>
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.72rem' : '0.6rem',
              color: '#9a3412',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            Oven {activeOvenRun.ovenNumber ?? '—'} {activeOvenRun.ovenSlot ? (activeOvenRun.ovenSlot === 'A' ? 'R' : activeOvenRun.ovenSlot === 'B' ? 'L' : activeOvenRun.ovenSlot) : ''}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
        {!isEmpty && deptLabel ? (
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.7rem' : '0.6rem',
              color: theme.text,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: `${theme.border}12`,
              padding: '1px 5px',
              borderRadius: 2,
              maxWidth: '60%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deptLabel}
          </span>
        ) : <span />}
        {!isEmpty && slot.layupStartedAt && (
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: isTvMode ? '0.7rem' : '0.6rem',
              color: '#9ca3af',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {formatTime(slot.layupStartedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryBar({ summary }: { summary: BoardData['summary'] }) {
  const remaining = Math.max(0, summary.target - summary.started);
  const progressPct = summary.target > 0 ? Math.min(1, summary.started / summary.target) : 0;
  const greenPct = summary.target > 0 ? Math.min(1, summary.green / summary.target) : 0;

  const items = [
    { label: 'TARGET',     value: summary.target,    color: '#6b7280' },
    { label: 'STARTED',    value: summary.started,   color: BRAND },
    { label: 'GREEN',      value: summary.green,     color: '#16a34a' },
    { label: 'IN PROCESS', value: summary.inProcess, color: '#2563eb' },
    { label: 'BLOCKED',    value: summary.blocked,   color: '#dc2626' },
    { label: 'VOID',       value: summary.cancelled, color: '#9ca3af' },
    { label: 'REMAINING',  value: remaining,         color: '#6b7280' },
  ];

  return (
    <div
      style={{
        marginBottom: 14,
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderLeft: `4px solid ${BRAND}`,
        borderRadius: 4,
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0,
          padding: '8px 14px 6px',
          alignItems: 'flex-end',
        }}
      >
        {items.map((item, idx) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 70,
              padding: '2px 12px',
              borderRight: idx < items.length - 1 ? `1px solid #e5e7eb` : 'none',
            }}
          >
            <span
              style={{
                fontFamily: FONT_STACK,
                fontSize: '2rem',
                fontWeight: 900,
                color: item.color,
                lineHeight: 1,
              }}
            >
              {item.value}
            </span>
            <span
              style={{
                fontFamily: FONT_STACK,
                fontSize: '0.55rem',
                fontWeight: 800,
                letterSpacing: '0.18em',
                color: '#9ca3af',
                textTransform: 'uppercase',
                marginTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}

        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '2px 0',
            gap: 3,
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontSize: '0.6rem',
              color: '#6b7280',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            {Math.round(progressPct * 100)}% STARTED · {Math.round(greenPct * 100)}% GREEN
          </span>
        </div>
      </div>

      {/* Dual-layer progress bar: green (GREEN milestone) over brand (STARTED) */}
      <div style={{ height: 5, background: '#e5e7eb', position: 'relative', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${progressPct * 100}%`,
            background: BRAND,
            opacity: 0.3,
            transition: 'width 0.6s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${greenPct * 100}%`,
            background: '#16a34a',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}

function DetailDrawer({
  slot,
  onClose,
}: {
  slot: Slot | null;
  onClose: () => void;
}) {
  if (!slot) return null;
  const theme = getStatusTheme(slot.status, slot.displayLabel);

  return (
    <Sheet open={!!slot} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        style={{
          background: '#ffffff',
          border: `1px solid ${CARD_BORDER}`,
          borderLeft: `3px solid ${theme.border}`,
          color: '#374151',
          fontFamily: FONT_STACK,
          maxWidth: 480,
          width: '100%',
          overflowY: 'auto',
        }}
      >
        <SheetHeader>
          <SheetTitle
            style={{
              color: theme.text,
              fontFamily: FONT_STACK,
              fontSize: '1.3rem',
              fontWeight: 900,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Slot #{slot.slotNumber} — {slot.displayLabel}
          </SheetTitle>
        </SheetHeader>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#f9fafb', border: `1px solid ${CARD_BORDER}`, padding: '12px 14px', borderRadius: 4 }}>
            <Row label="Traveler #" value={slot.travelerNumber} />
            <Row label="Item ID" value={slot.itemIdentifier} />
            <Row label="Part Number" value={slot.partNumber} />
            <Row label="Part Name" value={slot.partName} />
            <Row label="Serial #" value={slot.serialNumber} />
            <Row label="Lot #" value={slot.lotNumber} />
            <Row label="Status" value={slot.status} valueStyle={{ color: theme.text }} />
            <Row label="Current Dept" value={slot.currentDepartment} />
          </div>

          <div style={{ background: '#f9fafb', border: `1px solid ${CARD_BORDER}`, padding: '12px 14px', borderRadius: 4 }}>
            <SectionTitle>Timing</SectionTitle>
            <Row label="Layup Started" value={formatDateTime(slot.layupStartedAt)} />
            <Row label="Oven/Cure Started" value={slot.greenAt ? formatDateTime(slot.greenAt) : '—'} />
            <Row
              label="Timer Oven Item"
              value={
                slot.activeOvenRun
                  ? `${slot.activeOvenRun.programName ?? 'Timer'} / Oven ${slot.activeOvenRun.ovenNumber ?? '—'} ${slot.activeOvenRun.ovenSlot ? (slot.activeOvenRun.ovenSlot === 'A' ? 'R' : slot.activeOvenRun.ovenSlot === 'B' ? 'L' : slot.activeOvenRun.ovenSlot) : ''}`
                  : '—'
              }
            />
            <Row label="Elapsed" value={formatElapsed(slot.elapsedMs)} />
            <Row label="Green" value={slot.isGreen ? 'Yes' : 'No'} valueStyle={{ color: slot.isGreen ? '#16a34a' : '#9ca3af' }} />
            {slot.blockReason && (
              <Row label="Block Reason" value={slot.blockReason} valueStyle={{ color: '#dc2626' }} />
            )}
          </div>

          {slot.detail.steps.length > 0 && (
            <div style={{ background: '#f9fafb', border: `1px solid ${CARD_BORDER}`, padding: '12px 14px', borderRadius: 4 }}>
              <SectionTitle>Steps</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {slot.detail.steps.map((step) => {
                  const isBlocked = step.status === 'BLOCKED' || !!step.blockedReason;
                  const isDone = !!step.completedAt;
                  const isActive = !!step.startedAt && !step.completedAt;
                  return (
                    <div
                      key={step.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '5px 8px',
                        background: isBlocked ? '#fff1f2' : isDone ? '#f0fdf4' : isActive ? '#eff6ff' : '#ffffff',
                        borderLeft: `3px solid ${isBlocked ? '#dc2626' : isDone ? '#16a34a' : isActive ? '#2563eb' : '#d1d5db'}`,
                        borderRadius: '0 3px 3px 0',
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isBlocked ? '#b91c1c' : isDone ? '#15803d' : isActive ? '#1d4ed8' : '#6b7280' }}>
                        {step.stepNumber}. {step.departmentName}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        {isDone ? '✓' : isBlocked ? '⛔' : isActive ? '▶' : '○'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {slot.detail.recentEvents.length > 0 && (
            <div style={{ background: '#f9fafb', border: `1px solid ${CARD_BORDER}`, padding: '12px 14px', borderRadius: 4 }}>
              <SectionTitle>Recent Events</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {slot.detail.recentEvents.map((evt) => (
                  <div key={evt.id} style={{ borderLeft: `2px solid #d1d5db`, paddingLeft: 10 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {evt.action}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                      {evt.actorName ?? evt.actor} · {formatDateTime(evt.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string | null | undefined;
  valueStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid #e5e7eb` }}>
      <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 700, ...valueStyle }}>{value ?? '—'}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        fontSize: '0.65rem',
        fontWeight: 900,
        color: BRAND,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

export default function DailyThroughputBoard() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const dateParam = params.get('date') ?? undefined;

  const [isSupervisor, setIsSupervisor] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(dateParam ?? '');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const queryDate = selectedDate || undefined;
  const todayStr = useMemo(() => new Date().toLocaleDateString('sv-SE'), []);
  const isKnownHistorical = !!queryDate && queryDate !== todayStr;
  const isTvMode = !isSupervisor;

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<BoardData>({
    queryKey: ['/api/p2/daily-throughput-board', queryDate],
    queryFn: async () => {
      const url = queryDate
        ? `/api/p2/daily-throughput-board?date=${queryDate}`
        : '/api/p2/daily-throughput-board';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load board data');
      return res.json();
    },
    refetchInterval: (query) => {
      if (isKnownHistorical) return false;
      const boardData = query.state.data as BoardData | undefined;
      return boardData?.isToday === false ? false : 45000;
    },
    staleTime: 30000,
  });

  const handleSlotClick = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
  }, []);

  const displaySlots = useMemo(() => {
    if (!data) return [];
    return data.slots.slice(0, 22 + data.slots.filter((s) => s.isOverflow).length);
  }, [data]);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      })
    : null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: PAGE_BG }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 style={{ width: 40, height: 40, color: BRAND, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontFamily: FONT_STACK, fontSize: '1rem', color: BRAND, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            Loading Board...
          </span>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: PAGE_BG }}>
        <div style={{ color: '#dc2626', fontFamily: FONT_STACK, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 900 }}>BOARD ERROR</div>
          <div style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: 8 }}>Failed to load throughput data</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: FONT_STACK, padding: '14px 18px 28px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Monitor style={{ width: 22, height: 22, color: BRAND, flexShrink: 0 }} />
          <div>
            <div
              style={{
                fontFamily: FONT_STACK,
                fontSize: isTvMode ? '1.6rem' : '1.4rem',
                fontWeight: 900,
                color: BRAND,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              Daily Tube Throughput
            </div>
            <div
              style={{
                fontFamily: FONT_STACK,
                fontSize: '0.6rem',
                color: '#9ca3af',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginTop: 3,
              }}
            >
              {data.date}
              {data.isToday ? ' — TODAY' : ' — HISTORICAL'}
              {lastUpdated && ` · Updated ${lastUpdated}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSupervisor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarDays style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: '#ffffff',
                  border: `1px solid ${CARD_BORDER}`,
                  color: '#374151',
                  padding: '4px 8px',
                  fontFamily: FONT_STACK,
                  fontSize: '0.8rem',
                  outline: 'none',
                  borderRadius: 4,
                }}
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  style={{
                    background: '#ffffff',
                    border: `1px solid ${CARD_BORDER}`,
                    color: '#6b7280',
                    padding: '4px 8px',
                    fontFamily: FONT_STACK,
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    borderRadius: 4,
                  }}
                >
                  Today
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setIsSupervisor((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: isSupervisor ? `${BRAND}18` : '#ffffff',
              border: `1px solid ${isSupervisor ? BRAND : CARD_BORDER}`,
              color: isSupervisor ? BRAND : '#6b7280',
              padding: '6px 12px',
              fontFamily: FONT_STACK,
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            <Shield style={{ width: 12, height: 12 }} />
            {isSupervisor ? 'Supervisor' : 'TV Mode'}
          </button>
        </div>
      </div>

      <SummaryBar summary={data.summary} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isTvMode
            ? 'repeat(auto-fill, minmax(320px, 1fr))'
            : 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: isTvMode ? 10 : 8,
        }}
      >
        {displaySlots.map((slot) => (
          <SlotCard
            key={slot.slotNumber}
            slot={slot}
            isSupervisor={isSupervisor}
            isTvMode={isTvMode}
            onClick={handleSlotClick}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 18,
          paddingTop: 14,
          borderTop: `1px solid ${CARD_BORDER}`,
        }}
      >
        {[
          { label: 'GREEN — Oven/Cure started', color: '#16a34a' },
          { label: 'BLOCKED',                   color: '#dc2626' },
          { label: 'IN PROCESS',                color: '#2563eb' },
          { label: 'PREP / LAYUP / WRAP',       color: '#d97706' },
          { label: 'OVEN / CURE',               color: '#ea580c' },
          { label: 'VOID / CANCELLED',          color: '#9ca3af' },
          { label: 'NOT STARTED',               color: '#d1d5db' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, background: item.color, flexShrink: 0, borderRadius: 2 }} />
            <span style={{ fontFamily: FONT_STACK, fontSize: '0.6rem', color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {item.label}
            </span>
          </div>
        ))}
        {!data.isToday && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw style={{ width: 10, height: 10, color: '#9ca3af' }} />
            <span style={{ fontFamily: FONT_STACK, fontSize: '0.6rem', color: '#9ca3af', letterSpacing: '0.06em' }}>
              HISTORICAL — NO AUTO-REFRESH
            </span>
          </div>
        )}
      </div>

      {isSupervisor && (
        <DetailDrawer slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
      )}
    </div>
  );
}
