'use client';

const SERVICES = [
  { id: 'premium', label: '🚕 Premium', desc: 'Servicio completo' },
  { id: 'privado', label: '🚗 Privado', desc: '10% más barato' },
  { id: 'express', label: '⚡ Express', desc: '25% más barato' },
];

export function ServiceSelector({ value, onChange }: { value: string, onChange: (service: string) => void }) {
  return (
    <div className="m-4 grid gap-2">
      {SERVICES.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`p-3 rounded-xl border text-left transition-colors ${
            value === s.id ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent'
          }`}
        >
          <p className="font-medium">{s.label}</p>
          <p className="text-xs text-muted-foreground">{s.desc}</p>
        </button>
      ))}
    </div>
  );
}
