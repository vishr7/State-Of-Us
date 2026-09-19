'use client';

import { useEffect, useState } from 'react';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// Toast — animated notification banner (top-right corner)
// ============================================================

export default function Toast() {
  const toastMessage = useCityPulseStore(s => s.ui.toastMessage);
  const toastType = useCityPulseStore(s => s.ui.toastType);
  const clearToast = useCityPulseStore(s => s.clearToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toastMessage) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [toastMessage]);

  if (!toastMessage) return null;

  const colors = {
    success: { bg: '#16A34A', border: '#22C55E', icon: '✓' },
    warning: { bg: '#B45309', border: '#F59E0B', icon: '⚡' },
    error:   { bg: '#B91C1C', border: '#EF4444', icon: '✕' },
    info:    { bg: '#1D4ED8', border: '#3B82F6', icon: 'ℹ' },
  };
  const { bg, border, icon } = colors[toastType] ?? colors.info;

  return (
    <div
      className="toast-enter fixed z-50 flex items-start gap-2 px-4 py-3 rounded-xl shadow-2xl"
      style={{
        top: 80,
        right: 16,
        maxWidth: 380,
        background: `${bg}EE`,
        border: `1px solid ${border}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <span className="text-sm font-bold flex-shrink-0" style={{ color: 'white' }}>
        {icon}
      </span>
      <span className="text-sm leading-snug" style={{ color: 'white' }}>
        {toastMessage}
      </span>
      <button
        onClick={clearToast}
        className="ml-2 text-xs opacity-60 hover:opacity-100 flex-shrink-0"
        style={{ color: 'white' }}
      >
        ✕
      </button>
    </div>
  );
}
