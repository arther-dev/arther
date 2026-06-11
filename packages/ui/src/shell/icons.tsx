import type { SVGProps } from 'react';

/**
 * Placeholder glyphs for the shell skeleton — stroke = currentColor so they
 * theme like text (Handoff 01 §8). To be replaced by the DS 25-icon SVG set
 * (Figma keys in Handoff 01 §12); never emoji or typed glyphs.
 */
function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  } as const;
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 11h9c-.8-.9-1.25-1.6-1.25-3.25V6.5a3.25 3.25 0 0 0-6.5 0v1.25C4.75 9.4 4.3 10.1 3.5 11Z" />
      <path d="M6.75 13a1.4 1.4 0 0 0 2.5 0" />
    </svg>
  );
}

export function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.2a1.9 1.9 0 0 1 3.7.6c0 1.2-1.9 1.4-1.9 2.4" />
      <path d="M8 11.4h.01" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 1.8 14 5v6L8 14.2 2 11V5l6-3.2Z" />
      <path d="M2 5l6 3 6-3M8 8v6" />
    </svg>
  );
}

export function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

export function TagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 7.5v-5h5l6 6L8 14l-5.5-6.5Z" />
      <path d="M5.5 5.5h.01" />
    </svg>
  );
}
