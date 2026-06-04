import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  color?: string;
}

export function SketchUnderline({ children, color = '#22C55E' }: Props) {
  return (
    <span className="relative inline whitespace-nowrap">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute left-0 w-full pointer-events-none"
        style={{ bottom: '-8px', height: '9px' }}
      >
        <path
          d="M1 6C18 2.5 38 7.5 65 4.5C92 1.5 115 7 145 4C165 2 182 6.5 199 4.5"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 7.5C25 5 50 8 80 6C110 4 140 7.5 197 6"
          stroke={color}
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
    </span>
  );
}
