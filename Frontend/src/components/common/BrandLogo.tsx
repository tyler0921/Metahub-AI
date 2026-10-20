import { useId } from 'react';
import {
  LOGO_ARCH_PATH,
  LOGO_GRADIENT,
  LOGO_SPARK_PATH,
  LOGO_STROKE,
  LOGO_VIEWBOX,
} from './brand-logo';

interface BrandLogoProps {
  readonly className?: string;
}

/** MetaHub 로고 마크 — 장식이라 스크린리더에는 옆의 회사 이름만 읽힙니다 */
export function BrandLogo({ className }: BrandLogoProps): React.JSX.Element {
  // 한 화면에 로고가 여러 번 나와도 그라데이션 id 가 겹치지 않게
  const gradientId = useId();
  return (
    <svg
      className={className}
      viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0.2" y2="0.8">
          <stop offset="0" stopColor={LOGO_GRADIENT[0]} />
          <stop offset="1" stopColor={LOGO_GRADIENT[1]} />
        </linearGradient>
      </defs>
      <path
        d={LOGO_ARCH_PATH}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={LOGO_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={LOGO_SPARK_PATH} fill="#ffffff" />
    </svg>
  );
}
