import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const I = {
  overview: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  live: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  ),
  safety: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.1-8 9-4.6-.9-8-4.5-8-9V6l8-3z" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  ),
  progress: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M3 21h18M6 17V10M11 17V6M16 17v-4M20 17V8" />
    </svg>
  ),
  programme: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4M7 13h6M10 17h7" />
    </svg>
  ),
  activity: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M3 12h4l3 7 4-14 3 7h4" />
    </svg>
  ),
  reports: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  ),
  bell: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  ),
  alert: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  check: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.6" />
    </svg>
  ),
  info: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  pin: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  camera: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />
    </svg>
  ),
  drone: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="5" cy="5" r="2.5" />
      <circle cx="19" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
    </svg>
  ),
  sensor: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  ),
  wearable: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <rect x="7" y="6" width="10" height="12" rx="3" />
      <path d="M9 6V3h6v3M9 18v3h6v-3" />
    </svg>
  ),
  user: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  flag: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  ),
  chevron: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  search: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  play: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  ),
  pause: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  ),
  restart: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  fullscreen: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  exitFullscreen: (p: SVGProps<SVGSVGElement> = {}) => (
    <svg {...base(p)}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ),
};

/** SiteMind mark: a node network inside a hex */
export function Logo({ size = '1.4em' }: { size?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 2.5l11.7 6.75v13.5L16 29.5 4.3 22.75V9.25z" fill="#0f2a2c" stroke="#2de2d0" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.2" fill="#2de2d0" />
      <circle cx="16" cy="8.3" r="1.7" fill="#9ffcf2" />
      <circle cx="22.6" cy="20" r="1.7" fill="#9ffcf2" />
      <circle cx="9.4" cy="20" r="1.7" fill="#9ffcf2" />
      <path d="M16 12.8V10M18.8 17.6l2.3 1.4M13.2 17.6l-2.3 1.4" stroke="#2de2d0" strokeWidth="1.4" />
    </svg>
  );
}
