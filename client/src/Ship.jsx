import React from 'react';

const Ship = ({ size, color = "#10b981", isHorizontal = true, inGrid = false, className = "" }) => {
  
  const Ship1 = () => (
    <svg viewBox="0 0 42 42" className="w-full h-full drop-shadow-lg">
      <rect x="7" y="9" width="28" height="24" rx="7" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="15" y="15" width="12" height="10" rx="2" fill="#CFEFFF" />
    </svg>
  );

  const Ship2 = () => (
    <svg viewBox="0 0 90 42" className="w-full h-full drop-shadow-lg">
      <polygon points="0,21 18,6 18,36" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="16" y="6" width="64" height="30" rx="7" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="28" y="12" width="16" height="10" rx="2" fill="#CFEFFF" />
      <circle cx="58" cy="21" r="3" fill="#1e293b" />
    </svg>
  );

  const Ship3 = () => (
    <svg viewBox="0 0 125 44" className="w-full h-full drop-shadow-lg">
      <polygon points="0,22 22,5 22,39" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="20" y="5" width="92" height="34" rx="8" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="35" y="10" width="18" height="12" rx="2" fill="#CFEFFF" />
      <rect x="60" y="8" width="8" height="16" rx="2" fill="#1e293b" />
      <line x1="86" y1="22" x2="104" y2="22" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );

  const Ship4 = () => (
    <svg viewBox="0 0 170 46" className="w-full h-full drop-shadow-lg">
      <polygon points="0,23 24,4 24,42" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="22" y="4" width="132" height="38" rx="9" fill={color} stroke="#1e293b" strokeWidth="2" />
      <rect x="38" y="10" width="20" height="13" rx="2" fill="#CFEFFF" />
      <rect x="68" y="8" width="9" height="18" rx="2" fill="#1e293b" />
      <line x1="100" y1="23" x2="120" y2="23" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
      <line x1="130" y1="23" x2="148" y2="23" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );

  const renderShip = () => {
    switch (size) {
      case 1: return <Ship1 />;
      case 2: return <Ship2 />;
      case 3: return <Ship3 />;
      case 4: return <Ship4 />;
      default: return null;
    }
  };

  const gridStyle = {
    width: `${size * 100}%`,
    height: '100%',
    transformOrigin: `calc(50% / ${size}) 50%`,
    transform: isHorizontal ? 'rotate(0deg)' : 'rotate(90deg)'
  };

  const menuStyle = {
    width: '100%',
    height: '100%',
  };

  return (
    <div 
      className={`transition-all duration-200 pointer-events-none flex items-center justify-center ${className}`}
      style={inGrid ? gridStyle : menuStyle}
    >
      {renderShip()}
    </div>
  );
};

export default Ship;