'use client';

import React, { useEffect, useState } from 'react';

/**
 * /demo/split-screen
 *
 * Contenedor premium de la demo en pantalla dividida.
 * Los iframes se montan SÓLO después de que el script Playwright
 * ya hizo login de cada usuario en páginas separadas. Esta página
 * simplemente presenta ambas vistas en paralelo de forma elegante.
 *
 * Estructura:
 *   ┌──────────────────────┬──────────────────────┐
 *   │   VISTA PASAJERO     │   VISTA CONDUCTOR    │
 *   │  /dashboard/ride     │  /driver/rides       │
 *   └──────────────────────┴──────────────────────┘
 */

export default function SplitScreenDemo() {
  const [tick, setTick] = useState(0);

  // Pulso leve en el indicador de "EN VIVO"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0a0a0a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── BARRA SUPERIOR ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: '48px',
          background: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
          gap: '12px',
        }}
      >
        {/* Logo / branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ color: '#6366f1' }}>▶</span> VamO
            <span style={{ color: '#333', fontWeight: 400, fontSize: '11px', marginLeft: '4px' }}>
              Demo Comercial
            </span>
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: tick % 2 === 0 ? '#22c55e' : '#16a34a',
              transition: 'background 0.4s',
              boxShadow: '0 0 6px rgba(34,197,94,0.5)',
            }}
          />
          <span style={{ fontSize: '10px', color: '#555', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            En vivo
          </span>
        </div>
      </div>

      {/* ── CUERPO SPLIT ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LADO PASAJERO ─────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            borderRight: '1px solid #1a1a1a',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Cabecera pasajero */}
          <div
            style={{
              padding: '10px 20px',
              background: '#0f0f0f',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                }}
              >
                🧍
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#e5e5e7', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Vista Pasajero
                </div>
                <div style={{ fontSize: '9px', color: '#444', marginTop: '1px' }}>
                  Pasajero Demo · demo_passenger@vamo.com
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: '9px',
                color: '#6366f1',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                padding: '3px 8px',
                borderRadius: '999px',
              }}
            >
              Pasajero
            </div>
          </div>

          {/* Iframe pasajero */}
          <iframe
            id="passenger-frame"
            name="passenger-frame"
            src="/dashboard/ride"
            style={{ width: '100%', flex: 1, border: 'none', display: 'block' }}
            title="Vista Pasajero – VamO Demo"
            allow="geolocation"
          />
        </div>

        {/* ── LADO CONDUCTOR ────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* Cabecera conductor */}
          <div
            style={{
              padding: '10px 20px',
              background: '#0f0f0f',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                }}
              >
                🚗
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#e5e5e7', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Vista Conductor
                </div>
                <div style={{ fontSize: '9px', color: '#444', marginTop: '1px' }}>
                  Chofer Demo · demo_driver@vamo.com
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: '9px',
                color: '#10b981',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                padding: '3px 8px',
                borderRadius: '999px',
              }}
            >
              Conductor
            </div>
          </div>

          {/* Iframe conductor */}
          <iframe
            id="driver-frame"
            name="driver-frame"
            src="/driver/rides"
            style={{ width: '100%', flex: 1, border: 'none', display: 'block' }}
            title="Vista Conductor – VamO Demo"
            allow="geolocation"
          />
        </div>
      </div>
    </div>
  );
}
