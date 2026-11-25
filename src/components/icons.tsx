// このファイルは scripts/gen-icons.ts が生成する。直接編集しない。
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

/**
 * 線の太さ（画面上の px）。線には vector-effect: non-scaling-stroke を付けているので、
 * stroke-width は viewBox の単位ではなく描画後の px になる。どの大きさ・どの指定方法（width 属性・CSS・em）で
 * 描いても 1.8px を下回らない（P13: 16px で 1.53px でも細いと言われた。検査は audit:icon-stroke の 1.75px）。
 * 大きく描くときは tabler 本来の比率（24 で 2）まで太くする。strokeWidth を渡せば上書きできる（px）。
 */
function iconStroke(size: IconProps["width"]): number {
  const n = typeof size === "number" ? size : Number(size);
  return Number.isFinite(n) ? Math.max(1.8, Math.round((n / 12) * 100) / 100) : 1.85;
}

export function IconSearch(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6"
      />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14m-7-7h14"
      />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 6L6 18M6 6l12 12"
      />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16zm9.5-13.5l4 4"
      />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
      />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5 12l5 5L20 7"
      />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 9l5-5l5 5m-5-5v12"
      />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M7 9.667A2.667 2.667 0 0 1 9.667 7h8.666A2.667 2.667 0 0 1 21 9.667v8.666A2.667 2.667 0 0 1 18.333 21H9.667A2.667 2.667 0 0 1 7 18.333z"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M4.012 16.737A2 2 0 0 1 3 15V5c0-1.1.9-2 2-2h10c.75 0 1.158.385 1.5 1"
        />
      </g>
    </svg>
  );
}

export function IconMaximize(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 4h4v4m-6 2l6-6M8 20H4v-4m0 4l6-6m6 6h4v-4m-6-2l6 6M8 4H4v4m0-4l6 6"
      />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path
          vectorEffect="non-scaling-stroke"
          d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2M9 9h1m-1 4h6m-6 4h6"
        />
      </g>
    </svg>
  );
}

export function IconUserPlus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0m8 12h6m-3-3v6M6 21v-2a4 4 0 0 1 4-4h4"
      />
    </svg>
  );
}

export function IconTable(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <ellipse vectorEffect="non-scaling-stroke" cx="12" cy="10" rx="9" ry="4" />
        <path vectorEffect="non-scaling-stroke" d="M5 12.5V19M19 12.5V19M12 14v6" />
      </g>
    </svg>
  );
}

export function IconCharacter(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M13.192 9h6.616a2 2 0 0 1 1.992 2.183l-.567 6.182A4 4 0 0 1 17.25 21h-1.5a4 4 0 0 1-3.983-3.635l-.567-6.182A2 2 0 0 1 13.192 9M15 13h.01M18 13h.01"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M15 16.5q1.5 1 3 0m-9.368-.518A4 4 0 0 1 8.25 16h-1.5a4 4 0 0 1-3.983-3.635L2.2 6.183A2 2 0 0 1 4.192 4h6.616a2 2 0 0 1 2 2M6 8h.01M9 8h.01"
        />
        <path vectorEffect="non-scaling-stroke" d="M6 12q1.146-.765 2.291-.36" />
      </g>
    </svg>
  );
}

export function IconBooks(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M5 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm4 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1zM5 8h4m0 8h4"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="m13.803 4.56l2.184-.53c.562-.135 1.133.19 1.282.732l3.695 13.418a1.02 1.02 0 0 1-.634 1.219l-.133.041l-2.184.53c-.562.135-1.133-.19-1.282-.732L13.036 5.82a1.02 1.02 0 0 1 .634-1.219zM14 9l4-1m-2 8l3.923-.98"
        />
      </g>
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065"
        />
        <path vectorEffect="non-scaling-stroke" d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0" />
      </g>
    </svg>
  );
}

export function IconCalendarTime(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M11.795 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"
        />
        <path vectorEffect="non-scaling-stroke" d="M14 18a4 4 0 1 0 8 0a4 4 0 1 0-8 0m1-15v4M7 3v4m-4 4h16" />
        <path vectorEffect="non-scaling-stroke" d="M18 16.496V18l1 1" />
      </g>
    </svg>
  );
}

export function IconDice(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        />
        <path
          vectorEffect="non-scaling-stroke"
          fill="currentColor"
          d="M8 8.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m7 0a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m0 7a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m-7 0a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0m3.5-3.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0"
        />
      </g>
    </svg>
  );
}

export function IconTrendingUp(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="m3 17l6-6l4 4l8-8" />
        <path vectorEffect="non-scaling-stroke" d="M14 7h7v7" />
      </g>
    </svg>
  );
}

export function IconBrain(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M15.5 13a3.5 3.5 0 0 0-3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1-7 0v-1.8"
        />
        <path vectorEffect="non-scaling-stroke" d="M17.5 16a3.5 3.5 0 0 0 0-7H17" />
        <path
          vectorEffect="non-scaling-stroke"
          d="M19 9.3V6.5a3.5 3.5 0 0 0-7 0M6.5 16a3.5 3.5 0 0 1 0-7H7"
        />
        <path vectorEffect="non-scaling-stroke" d="M5 9.3V6.5a3.5 3.5 0 0 1 7 0v10" />
      </g>
    </svg>
  );
}

export function IconShieldLock(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"
        />
        <path vectorEffect="non-scaling-stroke" d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0-2 0m1 1v2.5" />
      </g>
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M12 8v4l2 2" />
        <path vectorEffect="non-scaling-stroke" d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </g>
    </svg>
  );
}

export function IconWand(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 21L21 6l-3-3L3 18zm9-15l3 3M9 3a2 2 0 0 0 2 2a2 2 0 0 0-2 2a2 2 0 0 0-2-2a2 2 0 0 0 2-2m10 10a2 2 0 0 0 2 2a2 2 0 0 0-2 2a2 2 0 0 0-2-2a2 2 0 0 0 2-2"
      />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 14L21 3m0 0l-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1z"
      />
    </svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0m12-6a3 3 0 1 0 6 0a3 3 0 1 0-6 0m0 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0m-6.3-7.3l6.6-3.4m-6.6 6l6.6 3.4"
      />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6"
      />
    </svg>
  );
}

export function IconListDetails(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 5h8m-8 4h5m-5 6h8m-8 4h5M3 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
      />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
        />
        <path vectorEffect="non-scaling-stroke" d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
      </g>
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6m-7 1l9-9m-5 0h5v5"
      />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 15l6-6m-4-3l.463-.536a5 5 0 0 1 7.071 7.072L18 13m-5 5l-.397.534a5.07 5.07 0 0 1-7.127 0a4.97 4.97 0 0 1 0-7.071L6 11"
      />
    </svg>
  );
}

export function IconUnlink(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 22v-2m-8-5l6-6m-4-3l.463-.536a5 5 0 0 1 7.071 7.072L18 13m-5 5l-.397.534a5.07 5.07 0 0 1-7.127 0a4.97 4.97 0 0 1 0-7.071L6 11m14 6h2M2 7h2m3-5v2"
      />
    </svg>
  );
}

export function IconGoogle(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 256 262"
      aria-hidden
      {...props}
    >
      <path
        fill="#4285f4"
        d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
      />
      <path
        fill="#34a853"
        d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
      />
      <path
        fill="#fbbc05"
        d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
      />
      <path
        fill="#eb4335"
        d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
      />
    </svg>
  );
}

export function IconDiscord(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      {...props}
    >
      <path
        fill="currentColor"
        d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0a13 13 0 0 0-.617-1.25a.08.08 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.1.1 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.08.08 0 0 0 .084-.028a14 14 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13 13 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10 10 0 0 0 .372-.292a.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01q.181.149.373.292a.077.077 0 0 1-.006.127a12.3 12.3 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028a19.8 19.8 0 0 0 6.002-3.03a.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418"
      />
    </svg>
  );
}

export function IconBrandX(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      {...props}
    >
      <path
        fill="currentColor"
        d="M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z"
      />
    </svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4h16v2.172a2 2 0 0 1-.586 1.414L15 12v7l-6 2v-8.5L4.52 7.572A2 2 0 0 1 4 6.227z"
      />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4"
        />
      </g>
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m-1.637-9.409L2.257 17.125a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87L13.637 3.59a1.914 1.914 0 0 0-3.274 0M12 16h.01"
      />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m6 9l6 6l6-6"
      />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12-4v4M8 3v4m-4 4h16"
      />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15 6l-6 6l6 6"
      />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 6l6 6l-6 6"
      />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
      />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
        <path vectorEffect="non-scaling-stroke" d="M12 7v5l3 3" />
      </g>
    </svg>
  );
}

export function IconWorld(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0m.6-3h16.8M3.6 15h16.8"
        />
        <path vectorEffect="non-scaling-stroke" d="M11.5 3a17 17 0 0 0 0 18m1-18a17 17 0 0 1 0 18" />
      </g>
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-17.87a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"
      />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5m-5-7v12"
      />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
        <path
          vectorEffect="non-scaling-stroke"
          d="M16.681 16.673A8.7 8.7 0 0 1 12 18q-5.4 0-9-6q1.908-3.18 4.32-4.674m2.86-1.146A9 9 0 0 1 12 6q5.4 0 9 6q-1 1.665-2.138 2.87M3 3l18 18"
        />
      </g>
    </svg>
  );
}

export function IconCalendarPlus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5m-4-9v4M8 3v4m-4 4h16m-4 8h6m-3-3v6"
      />
    </svg>
  );
}

export function IconBookmark(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 7v14l-6-4l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4"
      />
    </svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2"
        />
      </g>
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1"
      />
    </svg>
  );
}

export function IconFingerprint(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3M8 11a4 4 0 0 1 8 0v1a10 10 0 0 0 2 6"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M12 11v2a14 14 0 0 0 2.5 8M8 15a18 18 0 0 0 1.8 6m-4.9-2a22 22 0 0 1-.9-7v-1a8 8 0 0 1 12-6.95"
        />
      </g>
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
      />
    </svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14m6-8l-6-6m-6 6l6-6"
      />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14m6-6l-6 6m-6-6l6 6"
      />
    </svg>
  );
}

export function IconWifiOff(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18h.01m-2.838-2.828a4 4 0 0 1 5.656 0m-8.485-2.829a7.96 7.96 0 0 1 3.864-2.14m4.163.155a8 8 0 0 1 3.287 2M3.515 9.515A12 12 0 0 1 7.059 7.06m3.101-.92a12 12 0 0 1 10.325 3.374M3 3l18 18"
      />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0" />
        <path vectorEffect="non-scaling-stroke" d="M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6" />
      </g>
    </svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14"
      />
    </svg>
  );
}

export function IconVideo(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      />
    </svg>
  );
}

export function IconMicrophone(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M9 5a3 3 0 0 1 3-3a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3a3 3 0 0 1-3-3z"
        />
        <path vectorEffect="non-scaling-stroke" d="M5 10a7 7 0 0 0 14 0M8 21h8m-4-4v4" />
      </g>
    </svg>
  );
}

export function IconBroadcast(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path vectorEffect="non-scaling-stroke" d="M18.364 19.364a9 9 0 1 0-12.728 0" />
        <path vectorEffect="non-scaling-stroke" d="M15.536 16.536a5 5 0 1 0-7.072 0" />
        <path vectorEffect="non-scaling-stroke" d="M11 13a1 1 0 1 0 2 0a1 1 0 1 0-2 0" />
      </g>
    </svg>
  );
}

export function IconMovie(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4-2v16m8-16v16M4 8h4m-4 8h4m-4-4h16m-4-4h4m-4 8h4"
      />
    </svg>
  );
}

export function IconMessageCircle(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 20l1.3-3.9C1.976 12.663 2.874 8.228 6.4 5.726c3.526-2.501 8.59-2.296 11.845.48c3.255 2.777 3.695 7.266 1.029 10.501S11.659 20.922 7.7 19z"
      />
    </svg>
  );
}

export function IconTrophy(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 21h8m-4-4v4M7 4h10m0 0v8a5 5 0 0 1-10 0V4M3 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0m14 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"
      />
    </svg>
  );
}

export function IconPhoto(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M15 8h.01M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"
        />
        <path vectorEffect="non-scaling-stroke" d="m3 16l5-5c.928-.893 2.072-.893 3 0l5 5" />
        <path vectorEffect="non-scaling-stroke" d="m14 14l1-1c.928-.893 2.072-.893 3 0l3 3" />
      </g>
    </svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          vectorEffect="non-scaling-stroke"
          d="M12 21a9 9 0 0 1 0-18c4.97 0 9 3.582 9 8c0 1.06-.474 2.078-1.318 2.828S17.693 15 16.5 15H14a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21"
        />
        <path
          vectorEffect="non-scaling-stroke"
          d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0m4-3a1 1 0 1 0 2 0a1 1 0 1 0-2 0m4 3a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
        />
      </g>
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13m9-13v13m9-13v13"
      />
    </svg>
  );
}

export function IconNotes(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm4 2h6m-6 4h6m-6 4h4"
      />
    </svg>
  );
}

export function IconPlayerPlay(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      {...props}
    >
      <path fill="currentColor" d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4" />
    </svg>
  );
}

export function IconLayoutList(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1.2em"
      height="1.2em"
      viewBox="0 0 24 24"
      aria-hidden
      strokeWidth={iconStroke(props.width)}
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"
      />
    </svg>
  );
}
