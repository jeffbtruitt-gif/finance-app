/** Inline 20×20 icons, stroke ~1.8, currentColor — Rules / Run Rules surfaces. */

function SvgBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden
      width={16}
      height={16}
    >
      {children}
    </svg>
  );
}

export function IconSearch({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12.5 12.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </SvgBox>
  );
}

export function IconPlus({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </SvgBox>
  );
}

export function IconPlay({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path
        d="M6 4.5l10 5.5-10 5.5V4.5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </SvgBox>
  );
}

export function IconClose({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </SvgBox>
  );
}

export function IconBolt({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path
        d="M11 2L4 12h5l-1 6 8-11h-5l0-5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </SvgBox>
  );
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </SvgBox>
  );
}

export function IconWarn({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path
        d="M10 3.5L3 16h14L10 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 8v4M10 13.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </SvgBox>
  );
}

export function IconEdit({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path
        d="M12.5 3.5l4 4-9 9H4v-3.5l9-9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </SvgBox>
  );
}

export function IconTrash({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <path d="M6 6.5V15h8V6.5M4 6.5h12M8 6.5V4h4v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 9v6M12 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </SvgBox>
  );
}

export function IconDrag({ className }: { className?: string }) {
  return (
    <SvgBox className={className}>
      <circle cx="7" cy="5" r="1.6" fill="currentColor" />
      <circle cx="13" cy="5" r="1.6" fill="currentColor" />
      <circle cx="7" cy="10" r="1.6" fill="currentColor" />
      <circle cx="13" cy="10" r="1.6" fill="currentColor" />
      <circle cx="7" cy="15" r="1.6" fill="currentColor" />
      <circle cx="13" cy="15" r="1.6" fill="currentColor" />
    </SvgBox>
  );
}
