import React from 'react';
import AccessTimelineChart from '../components/AccessTimelineChart';
import DoorUsageHeatmap from '../components/DoorUsageHeatmap';
import AccessAuditPdf from '../components/AccessAuditPdf';
import AccessRulesEditor from '../components/AccessRulesEditor';

export default function CustomViewsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, color: '#1B2838' }}>Access Views</h2>
        <p style={{ margin: '4px 0 0', color: '#5b738b', fontSize: 13 }}>
          Custom access analytics, audit exports, and rule management.
        </p>
      </div>
      <AccessTimelineChart />
      <DoorUsageHeatmap />
      <AccessAuditPdf />
      <AccessRulesEditor />
    </div>
  );
}
