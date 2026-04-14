import { cn } from '@a4/ui';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: 'light' | 'dark';
}

export function Logo({ variant = 'light', className, ...props }: LogoProps) {
  const color = variant === 'light' ? '#0D9B6A' : '#10B981';
  const textColor = variant === 'light' ? '#111111' : '#FFFFFF';

  return (
    <svg
      width="68"
      height="84"
      viewBox="0 0 68 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-auto", className)}
      {...props}
    >
      <path d="M6 76 L6 4 L62 4" stroke={color} strokeWidth="1.5" strokeLinejoin="miter" fill="none" opacity="0.2"/>
      <path d="M62 4 L62 76 L6 76" stroke={color} strokeWidth="2.5" strokeLinejoin="miter" fill="none"/>
      <text x="34" y="49" textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="23" fontWeight="600" letterSpacing="-0.5" fill={textColor}>A4</text>
    </svg>
  );
}
