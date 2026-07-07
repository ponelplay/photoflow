interface IconProps {
  size?: number;
}

const S = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const SearchIcon = ({ size }: IconProps) => (
  <svg {...S(size ?? 14)}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 L14 14" />
  </svg>
);

export const FolderIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
  </svg>
);

export const ImageIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <circle cx="5.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <path d="M2 11l3.5-3 3 2.5L11 8l3 3" />
  </svg>
);

export const StarIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z" />
  </svg>
);

export const ClockIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.2l2.2 1.3" />
  </svg>
);

export const ChevronIcon = ({ size }: IconProps) => (
  <svg {...S(size ?? 12)}>
    <path d="M6 3.5 L10.5 8 L6 12.5" />
  </svg>
);

export const InfoIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5v3.5" />
    <circle cx="8" cy="5.2" r="0.7" fill="currentColor" stroke="none" />
  </svg>
);

export const SunIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
  </svg>
);

export const MoonIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z" />
  </svg>
);

export const CheckIcon = ({ size }: IconProps) => (
  <svg {...S(size ?? 12)} strokeWidth={2}>
    <path d="M3 8.5 L6.5 12 L13 4.5" />
  </svg>
);

export const EditIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M9.5 3.5l3 3L5 14H2v-3z" />
    <path d="M11.5 1.5l3 3-1.5 1.5-3-3z" />
  </svg>
);

export const RotateCwIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1" />
    <path d="M13.7 1.8v2.4h-2.4" />
  </svg>
);

export const RotateCcwIcon = ({ size }: IconProps) => (
  <svg {...S(size)}>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" />
    <path d="M2.3 1.8v2.4h2.4" />
  </svg>
);

export const MinimizeIcon = () => (
  <svg {...S(12)}>
    <path d="M3 8h10" />
  </svg>
);

export const MaximizeIcon = () => (
  <svg {...S(12)}>
    <rect x="3" y="3" width="10" height="10" rx="1" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...S(12)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
