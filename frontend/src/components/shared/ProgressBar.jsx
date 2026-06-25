import React from 'react';

const ProgressBar = ({ value, max, label }) => {
  const percentage = Math.min(Math.round((value / max) * 100), 100);
  
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)' }}>{percentage}%</span>
      </div>
      <div style={{ 
        height: '8px', 
        width: '100%', 
        background: 'var(--color-border)', 
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          height: '100%', 
          width: `${percentage}%`, 
          background: 'var(--color-accent)',
          borderRadius: '4px',
          transition: 'width 0.8s cubic-bezier(0.65, 0, 0.35, 1)'
        }} />
      </div>
    </div>
  );
};

export default ProgressBar;
