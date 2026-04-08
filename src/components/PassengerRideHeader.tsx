"use client";
import React from 'react';

interface PassengerRideHeaderProps {
  title: string;
  subtitle: string;
}

export const PassengerRideHeader: React.FC<PassengerRideHeaderProps> = ({ title, subtitle }) => {
  return (
    <div className="flex flex-col px-6 pt-2 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{title}</h2>
      <p className="text-xs font-medium opacity-50 mt-1" style={{ color: '#888' }}>{subtitle}</p>
    </div>
  );
};
