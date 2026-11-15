import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 14, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className ?? ""}`}
      aria-hidden
      focusable={false}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Svg>
  );
}

export function CrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.75 6.25L13.5 2.5M9.5 2.5h4v4M2.5 9.5v4h4M6.25 9.75L2.5 13.5" />
    </Svg>
  );
}

export function CompressIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 2.5L9.75 6.25M12.75 6.25H9.75V3M2.5 13.5L6.25 9.75M3.25 9.75H6.25V13" />
    </Svg>
  );
}

export function FormIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 3.25l1.75 1.75L5.5 12.25H3.75V10.5L11 3.25zM10.25 4l1.75 1.75" />
    </Svg>
  );
}

export function DocIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 2.5h4.75L12 5.25V13.5H4.5V2.5zM9.25 2.5v2.75H12" />
    </Svg>
  );
}
