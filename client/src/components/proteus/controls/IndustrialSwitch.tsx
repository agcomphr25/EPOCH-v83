import { useState, useEffect, useCallback } from 'react';

interface IndustrialSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: number;
  disabled?: boolean;
  'data-testid'?: string;
}

export default function IndustrialSwitch({
  checked,
  onCheckedChange,
  size = 1,
  disabled = false,
  ...props
}: IndustrialSwitchProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = useCallback(() => {
    if (disabled || isAnimating) return;
    setIsAnimating(true);
    onCheckedChange(!checked);
  }, [disabled, isAnimating, checked, onCheckedChange]);

  useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  const trackWidth = 56 * size;
  const trackHeight = 28 * size;
  const thumbSize = 22 * size;
  const thumbTravel = trackWidth - thumbSize - 6 * size;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Industrial theme toggle"
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      data-testid={props['data-testid']}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${trackWidth}px`,
        height: `${trackHeight}px`,
        borderRadius: `${trackHeight / 2}px`,
        border: `2px solid ${checked ? '#f59e0b' : '#4b5563'}`,
        background: checked
          ? 'linear-gradient(180deg, #78350f 0%, #451a03 100%)'
          : 'linear-gradient(180deg, #374151 0%, #1f2937 100%)',
        boxShadow: checked
          ? 'inset 0 1px 3px rgba(0,0,0,0.4), 0 0 8px rgba(245,158,11,0.3)'
          : 'inset 0 1px 3px rgba(0,0,0,0.5), 0 0 4px rgba(0,0,0,0.2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease',
        outline: 'none',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {/* Track grooves - industrial texture */}
      <div
        style={{
          position: 'absolute',
          top: `${4 * size}px`,
          left: `${8 * size}px`,
          right: `${8 * size}px`,
          height: `${2 * size}px`,
          background: checked
            ? 'rgba(245,158,11,0.15)'
            : 'rgba(255,255,255,0.05)',
          borderRadius: `${1 * size}px`,
          transition: 'background 0.3s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: `${4 * size}px`,
          left: `${8 * size}px`,
          right: `${8 * size}px`,
          height: `${2 * size}px`,
          background: checked
            ? 'rgba(245,158,11,0.15)'
            : 'rgba(255,255,255,0.05)',
          borderRadius: `${1 * size}px`,
          transition: 'background 0.3s ease',
        }}
      />

      {/* Status indicator LED */}
      <div
        style={{
          position: 'absolute',
          top: `${3 * size}px`,
          left: checked ? 'auto' : `${4 * size}px`,
          right: checked ? `${4 * size}px` : 'auto',
          width: `${4 * size}px`,
          height: `${4 * size}px`,
          borderRadius: '50%',
          background: checked ? '#22c55e' : '#6b7280',
          boxShadow: checked
            ? '0 0 6px rgba(34,197,94,0.8)'
            : '0 0 2px rgba(107,114,128,0.5)',
          transition: 'all 0.3s ease',
        }}
      />

      {/* Thumb / knob */}
      <div
        style={{
          position: 'absolute',
          left: `${3 * size}px`,
          width: `${thumbSize}px`,
          height: `${thumbSize}px`,
          borderRadius: '50%',
          background: checked
            ? 'linear-gradient(145deg, #fbbf24 0%, #d97706 50%, #b45309 100%)'
            : 'linear-gradient(145deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)',
          boxShadow: checked
            ? `0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3), 0 0 12px rgba(251,191,36,0.4)`
            : '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.2)',
          transform: `translateX(${checked ? thumbTravel : 0}px)`,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease, box-shadow 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Knurled grip pattern */}
        <div
          style={{
            display: 'flex',
            gap: `${1.5 * size}px`,
            alignItems: 'center',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: `${1.5 * size}px`,
                height: `${10 * size}px`,
                borderRadius: `${0.75 * size}px`,
                background: checked
                  ? 'rgba(120,53,15,0.4)'
                  : 'rgba(0,0,0,0.25)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>
      </div>
    </button>
  );
}
