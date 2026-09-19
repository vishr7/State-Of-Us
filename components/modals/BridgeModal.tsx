'use client';

import { useCityPulseStore, selectActiveBridge } from '@/lib/store';

// ============================================================
// BridgeModal — shows bridge condition + repair cost
// ============================================================

export default function BridgeModal() {
  const bridge = useCityPulseStore(selectActiveBridge);
  const selectBridge = useCityPulseStore(s => s.selectBridge);
  const enactPolicyById = useCityPulseStore(s => s.enactPolicyById);

  if (!bridge) return null;

  const condColor = bridge.condition >= 70 ? '#22C55E' : bridge.condition >= 50 ? '#EAB308' : '#EF4444';
  const condLabel = bridge.condition >= 70 ? 'Good' : bridge.condition >= 50 ? 'Fair' : 'Poor — Needs Immediate Repair';

  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div
          className="rounded-2xl p-5 w-full max-w-md"
          style={{ background: '#0F1B2D', border: '1px solid #1E3050' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: '#64748B' }}>
                {bridge.isThreeSisters ? '🏆 THREE SISTERS BRIDGE' : '🌉 BRIDGE'}
              </div>
              <h2 className="text-xl font-black" style={{ color: '#F0F4FA' }}>{bridge.name}</h2>
              <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                Type: {bridge.type.replace('_', '-')}
              </div>
            </div>
            <button
              onClick={() => selectBridge(null)}
              className="px-2 py-1 rounded-lg text-sm"
              style={{ color: '#64748B', background: '#162236' }}
            >✕</button>
          </div>

          {/* Condition gauge */}
          <div className="rounded-xl p-4 mb-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold" style={{ color: '#94A3B8' }}>Structural Condition</span>
              <span className="text-xl font-black" style={{ color: condColor }}>{bridge.condition}/100</span>
            </div>
            <div className="rounded-full overflow-hidden mb-2" style={{ height: 12, background: '#0A1628' }}>
              <div
                style={{
                  width: `${bridge.condition}%`,
                  height: '100%',
                  background: condColor,
                  borderRadius: 6,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
            <div className="text-sm font-bold" style={{ color: condColor }}>{condLabel}</div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
              <div className="text-xs" style={{ color: '#64748B' }}>Repair Cost</div>
              <div className="text-lg font-black" style={{ color: '#EF4444' }}>{fmt(bridge.repairCost)}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
              <div className="text-xs" style={{ color: '#64748B' }}>Last Inspection</div>
              <div className="text-sm font-bold" style={{ color: '#F0F4FA' }}>Turn {bridge.lastInspectionTurn}</div>
            </div>
          </div>

          {/* Affected neighborhoods */}
          {bridge.affectedNeighborhoods.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold mb-1.5" style={{ color: '#64748B' }}>CONNECTS NEIGHBORHOODS</div>
              <div className="flex gap-2 flex-wrap">
                {bridge.affectedNeighborhoods.map(id => (
                  <span key={id} className="badge" style={{ background: '#1E3050', color: '#94A3B8' }}>
                    {id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Warning for poor condition */}
          {bridge.condition < 50 && (
            <div className="rounded-xl p-3 mb-4" style={{ background: '#7F1D1D33', border: '1px solid #EF444444' }}>
              <div className="text-sm font-bold mb-1" style={{ color: '#EF4444' }}>⚠ Structural Warning</div>
              <div className="text-xs" style={{ color: '#94A3B8' }}>
                This bridge is rated in poor condition. Failure to repair increases the risk of closure and disconnects communities that depend on it for commutes.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => { enactPolicyById('pol-bridge-inspection'); selectBridge(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: '#3B82F6', color: 'white' }}
            >
              Fund Bridge Inspection Program
            </button>
            <button
              onClick={() => selectBridge(null)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: '#162236', color: '#94A3B8', border: '1px solid #1E3050' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
