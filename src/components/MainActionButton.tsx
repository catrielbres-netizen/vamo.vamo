'use client';

import { Button } from './ui/button';

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

export function MainActionButton({
  status,
  onClick,
  label,
  variant,
  disabled
}: {
  status: string;
  onClick: () => void;
  label: string;
  variant: ButtonVariant;
  disabled?: boolean;
}) {
  return (
    <div className="m-4">
      <Button
        onClick={onClick}
        className="w-full"
        size="lg"
        variant={variant}
        disabled={disabled}
      >
        {label}
      </Button>
    </div>
  );
}
