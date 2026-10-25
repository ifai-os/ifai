import type { ReactNode } from 'react'

import type { StoryCategory } from '../../categories'

/**
 * A category page's banner art (「日报分类底图」board): one drawing per category on a 1440 × 240
 * canvas, all of it right of x = 760 with the most telling shape in the last 150, so it is cut
 * from the left on narrower screens and phones still see that shape. Lines and fills are the
 * category's tile ink (`currentColor`: the banner sets it) at the board's opacities, with white
 * blocks and one brand-red mark; no text, so every language shares it.
 */
export function CategoryArt({ category, className }: { category: StoryCategory; className: string }) {
  return (
    <svg
      viewBox="0 0 1440 240"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      className={`absolute inset-0 size-full ${className}`}
    >
      {drawings[category]}
    </svg>
  )
}

// Copied from the board's SVGs; only the colours are swapped for tokens.
const drawings: Record<StoryCategory, ReactNode> = {
  llm: (
    <>
      <circle cx="1180" cy="120" r="180" fill="currentColor" fillOpacity="0.04" />
      <circle cx="1340" cy="110" r="110" fill="currentColor" fillOpacity="0.04" />
      <line x1="860" y1="44" x2="980" y2="64" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="44" x2="980" y2="114" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="44" x2="980" y2="164" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="84" x2="980" y2="64" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="84" x2="980" y2="114" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="84" x2="980" y2="164" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="124" x2="980" y2="64" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="124" x2="980" y2="114" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="124" x2="980" y2="164" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="164" x2="980" y2="64" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="164" x2="980" y2="114" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="164" x2="980" y2="164" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="204" x2="980" y2="64" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="204" x2="980" y2="114" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="860" y1="204" x2="980" y2="164" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="64" x2="1100" y2="44" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="64" x2="1100" y2="94" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="64" x2="1100" y2="144" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="64" x2="1100" y2="194" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="114" x2="1100" y2="44" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="114" x2="1100" y2="94" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="114" x2="1100" y2="144" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="114" x2="1100" y2="194" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="164" x2="1100" y2="44" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="164" x2="1100" y2="94" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="164" x2="1100" y2="144" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="980" y1="164" x2="1100" y2="194" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="44" x2="1220" y2="84" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="44" x2="1220" y2="154" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="94" x2="1220" y2="84" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="94" x2="1220" y2="154" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="144" x2="1220" y2="84" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="144" x2="1220" y2="154" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="194" x2="1220" y2="84" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1100" y1="194" x2="1220" y2="154" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1220" y1="84" x2="1330" y2="120" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="1220" y1="154" x2="1330" y2="120" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <polyline
        points="860,124 980,114 1100,94 1220,84 1330,120"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="1.75"
      />
      <rect
        x="853"
        y="37"
        width="14"
        height="14"
        rx="4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <rect
        x="853"
        y="77"
        width="14"
        height="14"
        rx="4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <rect
        x="853"
        y="117"
        width="14"
        height="14"
        rx="4"
        fill="currentColor"
        fillOpacity="0.85"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <rect
        x="853"
        y="157"
        width="14"
        height="14"
        rx="4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <rect
        x="853"
        y="197"
        width="14"
        height="14"
        rx="4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle cx="980" cy="64" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="980" cy="114" r="7" fill="currentColor" stroke="currentColor" strokeOpacity="0.95" strokeWidth="2" />
      <circle cx="980" cy="164" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="1100" cy="44" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="1100" cy="94" r="7" fill="currentColor" stroke="currentColor" strokeOpacity="0.95" strokeWidth="2" />
      <circle cx="1100" cy="144" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="1100" cy="194" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="1220" cy="84" r="7" fill="currentColor" stroke="currentColor" strokeOpacity="0.95" strokeWidth="2" />
      <circle cx="1220" cy="154" r="7" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" className="fill-tile-1" />
      <circle cx="1330" cy="120" r="18.4" fill="none" strokeOpacity="0.28" strokeWidth="2" className="stroke-accent" />
      <circle cx="1330" cy="120" r="8" stroke="currentColor" strokeWidth="2.5" className="fill-accent" />
      <rect
        x="1364"
        y="62"
        width="64"
        height="42"
        rx="14"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      <path
        d="M1378 103 L1372 118 L1392 103"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="fill-tile-1"
      />
      <line x1="1376" y1="103.5" x2="1394" y2="103.5" strokeWidth="2" className="stroke-tile-1" />
      <circle cx="1384" cy="83" r="3" fill="currentColor" fillOpacity="0.85" />
      <circle cx="1396" cy="83" r="3" fill="currentColor" fillOpacity="0.85" />
      <circle cx="1408" cy="83" r="3" fill="currentColor" fillOpacity="0.85" />
      <path
        d="M800 50 Q801.9 60.1 812 62 Q801.9 63.9 800 74 Q798.1 63.9 788 62 Q798.1 60.1 800 50 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <path
        d="M1410 188 Q1411.3 194.7 1418 196 Q1411.3 197.3 1410 204 Q1408.7 197.3 1402 196 Q1408.7 194.7 1410 188 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M1272 23 Q1273.1 28.9 1279 30 Q1273.1 31.1 1272 37 Q1270.9 31.1 1265 30 Q1270.9 28.9 1272 23 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
    </>
  ),
  tools: (
    <>
      <circle cx="1236" cy="64" r="150" fillOpacity="0.5" className="fill-white" />
      <rect
        x="900"
        y="44"
        width="300"
        height="236"
        rx="16"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="900" y1="80" x2="1200" y2="80" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
      <circle cx="922" cy="62" r="4.5" fill="currentColor" fillOpacity="0.22" />
      <circle cx="938" cy="62" r="4.5" fill="currentColor" fillOpacity="0.22" />
      <circle cx="954" cy="62" r="4.5" fill="currentColor" fillOpacity="0.22" />
      <rect x="924" y="102" width="150" height="10" rx="5" fill="currentColor" fillOpacity="0.22" />
      <rect x="924" y="122" width="232" height="10" rx="5" fill="currentColor" fillOpacity="0.1" />
      <rect x="924" y="142" width="196" height="10" rx="5" fill="currentColor" fillOpacity="0.1" />
      <rect x="924" y="174" width="56" height="30" rx="15" className="fill-accent" />
      <circle cx="965" cy="189" r="11" className="fill-white" />
      <rect x="994" y="184" width="112" height="10" rx="5" fill="currentColor" fillOpacity="0.22" />
      <path
        d="M972 194 L972 221 L978.5 214.5 L983.5 225 L988 223 L983 212.6 L992 212.6 Z"
        fill="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="stroke-white"
      />
      <rect
        x="1150"
        y="100"
        width="222"
        height="170"
        rx="14"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        className="fill-white"
      />
      <rect
        x="1170"
        y="120"
        width="40"
        height="40"
        rx="10"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.5"
        className="fill-tile-2"
      />
      <path
        d="M1190 129 Q1191.8 138.2 1201 140 Q1191.8 141.8 1190 151 Q1188.2 141.8 1179 140 Q1188.2 138.2 1190 129 Z"
        fill="currentColor"
        fillOpacity="0.55"
      />
      <rect x="1222" y="126" width="118" height="10" rx="5" fill="currentColor" fillOpacity="0.22" />
      <rect x="1222" y="146" width="78" height="10" rx="5" fill="currentColor" fillOpacity="0.1" />
      <rect x="1170" y="182" width="98" height="30" rx="15" fill="currentColor" fillOpacity="0.88" />
      <rect x="1188" y="193" width="62" height="8" rx="4" fillOpacity="0.85" className="fill-white" />
      <circle cx="1370" cy="102" r="10" strokeWidth="3" className="fill-accent stroke-white" />
      <path
        d="M848 57 Q850.1 67.9 861 70 Q850.1 72.1 848 83 Q845.9 72.1 835 70 Q845.9 67.9 848 57 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M1410 187 Q1411.4 194.6 1419 196 Q1411.4 197.4 1410 205 Q1408.6 197.4 1401 196 Q1408.6 194.6 1410 187 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M1110 23 Q1111.1 28.9 1117 30 Q1111.1 31.1 1110 37 Q1108.9 31.1 1103 30 Q1108.9 28.9 1110 23 Z"
        fill="currentColor"
        fillOpacity="0.25"
      />
    </>
  ),
  aigc: (
    <>
      <circle
        cx="996"
        cy="118"
        r="72"
        fillOpacity="0.5"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        className="fill-white"
      />
      <circle
        cx="1080"
        cy="118"
        r="72"
        fillOpacity="0.5"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        className="fill-white"
      />
      <circle
        cx="1038"
        cy="186"
        r="72"
        fillOpacity="0.5"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        className="fill-white"
      />
      <path d="M872 44 L872 26 L890 26" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M1220 44 L1220 26 L1202 26" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M872 208 L872 226 L890 226" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M1220 208 L1220 226 L1202 226" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M790 206 C880 206 930 70 1060 74 C1190 78 1250 196 1412 58"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.72"
        strokeWidth="2.5"
      />
      <line x1="992" y1="72" x2="1128" y2="76" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="992" cy="72" r="4.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" className="fill-white" />
      <circle cx="1128" cy="76" r="4.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" className="fill-white" />
      <rect x="784.5" y="200.5" width="11" height="11" stroke="currentColor" strokeOpacity="0.8" strokeWidth="1.5" className="fill-white" />
      <rect x="1406.5" y="52.5" width="11" height="11" stroke="currentColor" strokeOpacity="0.8" strokeWidth="1.5" className="fill-white" />
      <rect x="1053" y="67" width="14" height="14" strokeWidth="2" className="fill-accent stroke-white" />
      <rect x="1292" y="172" width="28" height="28" rx="7" fill="currentColor" fillOpacity="0.9" />
      <rect x="1328" y="172" width="28" height="28" rx="7" fill="currentColor" fillOpacity="0.42" />
      <rect
        x="1364"
        y="172"
        width="28"
        height="28"
        rx="7"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        className="fill-white"
      />
      <path
        d="M1300 24 Q1301.6 32.4 1310 34 Q1301.6 35.6 1300 44 Q1298.4 35.6 1290 34 Q1298.4 32.4 1300 24 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M842 82 Q843.3 88.7 850 90 Q843.3 91.3 842 98 Q840.7 91.3 834 90 Q840.7 88.7 842 82 Z"
        fill="currentColor"
        fillOpacity="0.25"
      />
    </>
  ),
  open: (
    <>
      <circle cx="1176" cy="36" r="172" fillOpacity="0.45" className="fill-white" />
      <path
        d="M794 62 L772 84 L794 106 M842 62 L864 84 L842 106 M826 54 L810 114"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M890 160 L1440 160" fill="none" stroke="currentColor" strokeOpacity="0.42" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M940 160 C970 160 970 100 1000 100 L1110 100 C1140 100 1140 160 1170 160"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.42"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M1190 160 C1220 160 1220 212 1250 212 L1440 212"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.42"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="910" cy="160" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1050" cy="160" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1020" cy="100" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1080" cy="100" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1170" cy="160" r="9" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1260" cy="160" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1290" cy="212" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1370" cy="212" r="7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" className="fill-white" />
      <circle cx="1350" cy="160" r="18.4" fill="none" strokeOpacity="0.28" strokeWidth="2" className="stroke-accent" />
      <circle cx="1350" cy="160" r="8" strokeWidth="2.5" className="fill-accent stroke-white" />
      <rect x="1254" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.08" />
      <rect x="1276" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.3" />
      <rect x="1298" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.15" />
      <rect x="1320" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.5" />
      <rect x="1342" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.1" />
      <rect x="1364" y="34" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.22" />
      <rect x="1254" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.4" />
      <rect x="1276" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.12" />
      <rect x="1298" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.62" />
      <rect x="1320" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.18" />
      <rect x="1342" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.35" />
      <rect x="1364" y="56" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.08" />
      <rect x="1254" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.2" />
      <rect x="1276" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.45" />
      <rect x="1298" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.1" />
      <rect x="1320" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.28" />
      <rect x="1342" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.12" />
      <rect x="1364" y="78" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.52" />
    </>
  ),
  industry: (
    <>
      <circle cx="1296" cy="214" r="172" fillOpacity="0.42" className="fill-white" />
      <line x1="770" y1="56" x2="1440" y2="56" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="770" y1="96" x2="1440" y2="96" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="770" y1="136" x2="1440" y2="136" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="770" y1="176" x2="1440" y2="176" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <line x1="770" y1="216" x2="1440" y2="216" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
      <polygon
        points="800,240 800,184 842,172 884,178 926,156 968,162 1010,142 1052,130 1094,138 1136,114 1178,102 1220,84 1220,240"
        fill="currentColor"
        fillOpacity="0.06"
      />
      <polyline
        points="800,184 842,172 884,178 926,156 968,162 1010,142 1052,130 1094,138 1136,114 1178,102 1220,84"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <line x1="800" y1="175" x2="800" y2="203" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="793"
        y="184"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="842" y1="163" x2="842" y2="193" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="835"
        y="172"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="884" y1="163" x2="884" y2="187" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="877" y="172" width="14" height="6" rx="2" fill="currentColor" fillOpacity="0.5" />
      <line x1="926" y1="147" x2="926" y2="187" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="919"
        y="156"
        width="14"
        height="22"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="968" y1="147" x2="968" y2="171" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="961" y="156" width="14" height="6" rx="2" fill="currentColor" fillOpacity="0.5" />
      <line x1="1010" y1="133" x2="1010" y2="171" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="1003"
        y="142"
        width="14"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="1052" y1="121" x2="1052" y2="151" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="1045"
        y="130"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="1094" y1="121" x2="1094" y2="147" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect x="1087" y="130" width="14" height="8" rx="2" fill="currentColor" fillOpacity="0.5" />
      <line x1="1136" y1="105" x2="1136" y2="147" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="1129"
        y="114"
        width="14"
        height="24"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="1178" y1="93" x2="1178" y2="123" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="1171"
        y="102"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <line x1="1220" y1="75" x2="1220" y2="111" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <rect
        x="1213"
        y="84"
        width="14"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        className="fill-white"
      />
      <circle cx="1220" cy="66" r="13.8" fill="none" strokeOpacity="0.28" strokeWidth="2" className="stroke-accent" />
      <circle cx="1220" cy="66" r="6" strokeWidth="2.5" className="fill-accent stroke-white" />
      <rect
        x="1266"
        y="46"
        width="142"
        height="220"
        rx="12"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        className="fill-white"
      />
      <rect x="1282" y="66" width="110" height="12" rx="6" fill="currentColor" fillOpacity="0.72" />
      <rect x="1282" y="88" width="84" height="8" rx="4" fill="currentColor" fillOpacity="0.2" />
      <rect x="1282" y="106" width="110" height="58" rx="6" className="fill-tile-3" />
      <path d="M1282 164 L1312 136 L1330 152 L1350 128 L1392 164 Z" fill="currentColor" fillOpacity="0.16" />
      <circle cx="1374" cy="122" r="6" fillOpacity="0.9" className="fill-white" />
      <rect x="1282" y="178" width="110" height="8" rx="4" fill="currentColor" fillOpacity="0.14" />
      <rect x="1282" y="194" width="92" height="8" rx="4" fill="currentColor" fillOpacity="0.14" />
      <rect x="1282" y="210" width="102" height="8" rx="4" fill="currentColor" fillOpacity="0.14" />
    </>
  ),
  research: (
    <>
      <circle cx="1330" cy="112" r="150" fillOpacity="0.42" className="fill-white" />
      <path d="M820 32 L820 212 L1252 212" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="862" y1="212" x2="862" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="904" y1="212" x2="904" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="946" y1="212" x2="946" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="988" y1="212" x2="988" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1030" y1="212" x2="1030" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1072" y1="212" x2="1072" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1114" y1="212" x2="1114" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1156" y1="212" x2="1156" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1198" y1="212" x2="1198" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="1240" y1="212" x2="1240" y2="218" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="814" y1="178" x2="820" y2="178" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="814" y1="144" x2="820" y2="144" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="814" y1="110" x2="820" y2="110" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="814" y1="76" x2="820" y2="76" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="814" y1="42" x2="820" y2="42" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      <polyline
        points="830,194.6 838,193.7 846,192.6 854,191.4 862,190 870,188.6 878,186.9 886,185.1 894,183.1 902,180.8 910,178.4 918,175.8 926,172.9 934,169.8 942,166.5 950,162.9 958,159.1 966,155.2 974,151.1 982,146.8 990,142.4 998,137.8 1006,133.3 1014,128.7 1022,124.2 1030,119.6 1038,115.2 1046,110.9 1054,106.8 1062,102.9 1070,99.1 1078,95.5 1086,92.2 1094,89.1 1102,86.2 1110,83.6 1118,81.2 1126,78.9 1134,76.9 1142,75.1 1150,73.4 1158,72 1166,70.6 1174,69.4 1182,68.3 1190,67.4 1198,66.5 1206,65.8 1214,65.1 1222,64.5 1230,64 1238,63.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.72"
        strokeWidth="2"
      />
      <circle cx="842" cy="202.1" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="858.5" cy="183.7" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="875" cy="191.5" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="891.5" cy="172.7" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="908" cy="185" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="924.5" cy="170.4" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="941" cy="178.9" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="957.5" cy="151.4" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="974" cy="153.1" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="990.5" cy="137.1" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1007" cy="142.7" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1023.5" cy="111.3" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1040" cy="119.2" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1056.5" cy="103.6" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1073" cy="105.7" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1089.5" cy="81.8" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1106" cy="87.9" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1122.5" cy="73.9" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1139" cy="86.8" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1155.5" cy="68.4" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1172" cy="76.7" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1188.5" cy="57.6" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1205" cy="66.9" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1221.5" cy="57.5" r="3.5" fill="currentColor" fillOpacity="0.42" />
      <circle cx="1226" cy="40" r="13.8" fill="none" strokeOpacity="0.28" strokeWidth="2" className="stroke-accent" />
      <circle cx="1226" cy="40" r="6" strokeWidth="2.5" className="fill-accent stroke-white" />
      <ellipse
        cx="1350"
        cy="116"
        rx="70"
        ry="24"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        transform="rotate(0 1350 116)"
      />
      <ellipse
        cx="1350"
        cy="116"
        rx="70"
        ry="24"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        transform="rotate(60 1350 116)"
      />
      <ellipse
        cx="1350"
        cy="116"
        rx="70"
        ry="24"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        transform="rotate(120 1350 116)"
      />
      <circle cx="1284.2" cy="107.8" r="4.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" className="fill-white" />
      <circle cx="1369.9" cy="174.5" r="4.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" className="fill-white" />
      <circle cx="1349.5" cy="75.3" r="4.5" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" className="fill-white" />
      <circle cx="1350" cy="116" r="7" fill="currentColor" fillOpacity="0.7" />
    </>
  ),
  robotics: (
    <>
      <circle cx="1230" cy="212" r="176" fillOpacity="0.55" className="fill-white" />
      <line x1="800" y1="214" x2="1440" y2="214" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path
        d="M900 156 A150 150 0 0 1 1036 34"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />
      <rect x="944" y="198" width="72" height="16" rx="5" fill="currentColor" fillOpacity="0.8" />
      <rect x="960" y="186" width="40" height="14" rx="4" fill="currentColor" fillOpacity="0.45" />
      <line x1="980" y1="182" x2="1062" y2="92" stroke="currentColor" strokeOpacity="0.7" strokeWidth="24" strokeLinecap="round" />
      <line x1="980" y1="182" x2="1062" y2="92" strokeWidth="20" strokeLinecap="round" className="stroke-white" />
      <line x1="1062" y1="92" x2="1168" y2="112" stroke="currentColor" strokeOpacity="0.7" strokeWidth="20" strokeLinecap="round" />
      <line x1="1062" y1="92" x2="1168" y2="112" strokeWidth="16" strokeLinecap="round" className="stroke-white" />
      <circle cx="980" cy="182" r="13" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" className="fill-white" />
      <circle cx="980" cy="182" r="4" fill="currentColor" fillOpacity="0.6" />
      <circle cx="1062" cy="92" r="14" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" className="fill-white" />
      <circle cx="1062" cy="92" r="4.5" fill="currentColor" fillOpacity="0.6" />
      <circle cx="1168" cy="112" r="10" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" className="fill-white" />
      <path
        d="M1160 121 L1154 146 M1176 121 L1182 146"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.8"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <polygon
        points="1168,158 1192,170 1168,182 1144,170"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="fill-white"
      />
      <polygon
        points="1144,170 1168,182 1168,210 1144,198"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon
        points="1168,182 1192,170 1192,198 1168,210"
        fill="currentColor"
        fillOpacity="0.32"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M1306 214 L1306 196 Q1306 168 1350 168 Q1394 168 1394 196 L1394 214 Z"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
        className="fill-white"
      />
      <rect x="1338" y="146" width="24" height="14" rx="3" fill="currentColor" fillOpacity="0.35" />
      <line x1="1350" y1="72" x2="1350" y2="52" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2.5" />
      <rect
        x="1304"
        y="72"
        width="92"
        height="76"
        rx="22"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="2"
        className="fill-white"
      />
      <rect x="1318" y="94" width="64" height="30" rx="15" fill="currentColor" fillOpacity="0.85" />
      <circle cx="1337" cy="109" r="5" className="fill-white" />
      <circle cx="1363" cy="109" r="5" className="fill-white" />
      <circle cx="1350" cy="47" r="6.5" strokeWidth="2" className="fill-accent stroke-white" />
      <path
        d="M1238 51 Q1239.4 58.6 1247 60 Q1239.4 61.4 1238 69 Q1236.6 61.4 1229 60 Q1236.6 58.6 1238 51 Z"
        fill="currentColor"
        fillOpacity="0.3"
      />
      <path
        d="M842 88 Q843.3 94.7 850 96 Q843.3 97.3 842 104 Q840.7 97.3 834 96 Q840.7 94.7 842 88 Z"
        fill="currentColor"
        fillOpacity="0.25"
      />
    </>
  ),
}
