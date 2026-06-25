import React from 'react';

const StatCard = ({ label, value, subtext, color = 'var(--color-accent)', delay = '0s' }) => {
  return (
    <div 
      className="glass-card animate-fade-in" 
      style={{ animationDelay: delay }}
    >
      <header style={{ marginBottom: '16px' }}>
        <span className="stat-label">{label}</span>
      </header>
      <div 
        className="stat-value" 
        style={{ color: value === 'ONLINE' ? 'var(--color-success)' : color }}
      >
        {value}
      </div>
      <footer style={{ marginTop: 'auto' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          {subtext}
        </p>
      </footer>
    </div>
  );
};

export default StatCard;
