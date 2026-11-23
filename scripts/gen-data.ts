import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "generated.json");

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261117);
const ri = (min: number, max: number): number => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const chance = (p: number): boolean => rng() < p;

const JST = 9 * 3600;
function jstEpoch(date: string, time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) + h * 3600 + m * 60 - JST;
}
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim().replace(/\s+/g, " "))}`;
}

/**
 * 12人のユーザー用に、人形顔ではない個性的なグラフィック・エンブレムSVGを生成する。
 * 暖色系デュオトーンの円形バッジに明確なシルエットアイコンを配置する。
 */
function makeUserEmblem(kind: number, bg: string, fg: string, accent: string): string {
  const icons: readonly string[] = [
    // 0: Black cat silhouette & crescent moon (u_mikan)
    `
      <path d="M67 21 A15 15 0 1 0 80 43 A12 12 0 1 1 67 21 Z" fill="${accent}"/>
      <path d="M35 39 L33 27 L43 34 C46 33 50 33 53 34 L63 27 L61 39 C64 43 65 48 63 53 C61 57 59 61 59 74 L37 74 C37 61 35 57 33 53 C31 48 32 43 35 39 Z" fill="${fg}"/>
      <path d="M58 72 C71 72 77 63 72 54 C69 50 65 53 67 57 C69 61 65 66 58 66 Z" fill="${fg}"/>
      <circle cx="43" cy="44" r="2.2" fill="${bg}"/>
      <circle cx="53" cy="44" r="2.2" fill="${bg}"/>
    `,
    // 1: Twin polyhedral d20 / d10 dice (u_sora)
    `
      <polygon points="40,22 60,33 60,55 40,66 20,55 20,33" fill="${fg}"/>
      <polygon points="40,26 54,49 26,49" fill="${bg}" fill-opacity="0.22" stroke="${bg}" stroke-width="1.8" stroke-linejoin="round"/>
      <line x1="40" y1="22" x2="40" y2="26" stroke="${bg}" stroke-width="1.6"/>
      <line x1="20" y1="33" x2="26" y2="49" stroke="${bg}" stroke-width="1.6"/>
      <line x1="60" y1="33" x2="54" y2="49" stroke="${bg}" stroke-width="1.6"/>
      <line x1="40" y1="66" x2="26" y2="49" stroke="${bg}" stroke-width="1.6"/>
      <line x1="40" y1="66" x2="54" y2="49" stroke="${bg}" stroke-width="1.6"/>
      <polygon points="65,42 82,56 65,78 48,56" fill="${accent}" stroke="${bg}" stroke-width="2" stroke-linejoin="round"/>
      <polyline points="48,56 65,61 82,56" fill="none" stroke="${bg}" stroke-width="1.6"/>
      <line x1="65" y1="42" x2="65" y2="78" stroke="${bg}" stroke-width="1.6"/>
    `,
    // 2: Antique brass lantern with warm glow (u_kai)
    `
      <circle cx="50" cy="54" r="26" fill="${accent}" fill-opacity="0.25"/>
      <circle cx="50" cy="54" r="16" fill="${accent}" fill-opacity="0.35"/>
      <path d="M43 26 A7 7 0 0 1 57 26" fill="none" stroke="${fg}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M36 33 L64 33 L59 27 L41 27 Z" fill="${fg}"/>
      <rect x="38" y="35" width="24" height="33" rx="3" fill="${bg}" stroke="${fg}" stroke-width="2.8"/>
      <line x1="44" y1="35" x2="44" y2="68" stroke="${fg}" stroke-width="1.6"/>
      <line x1="56" y1="35" x2="56" y2="68" stroke="${fg}" stroke-width="1.6"/>
      <path d="M50 43 C54 49 54 57 50 60 C46 57 46 49 50 43 Z" fill="${accent}"/>
      <rect x="33" y="68" width="34" height="6" rx="2.5" fill="${fg}"/>
    `,
    // 3: Fountain pen nib & diamond (u_hina)
    `
      <polygon points="28,27 33,32 28,37 23,32" fill="${accent}"/>
      <polygon points="73,38 77,42 73,46 69,42" fill="${accent}"/>
      <path d="M50 18 L66 47 L57 67 L43 67 L34 47 Z" fill="${fg}"/>
      <line x1="50" y1="18" x2="50" y2="48" stroke="${bg}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="3.6" fill="${bg}"/>
      <rect x="40" y="67" width="20" height="7" rx="2" fill="${accent}"/>
      <rect x="42" y="75" width="16" height="5" rx="2" fill="${fg}"/>
    `,
    // 4: Open grimoire book & bookmark (u_rin)
    `
      <path d="M21 31 C32 27 44 29 50 35 C56 29 68 27 79 31 L79 69 C68 65 56 67 50 72 C44 67 32 65 21 69 Z" fill="${fg}"/>
      <path d="M25 34 C34 31 44 33 49 38 L49 67 C44 63 34 61 25 65 Z" fill="${bg}"/>
      <path d="M75 34 C66 31 56 33 51 38 L51 67 C56 63 66 61 75 65 Z" fill="${bg}"/>
      <path d="M30 43 L44 42 M30 50 L44 49 M30 57 L42 56" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.55"/>
      <path d="M56 42 L70 43 M56 49 L70 50 M58 56 L70 57" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.55"/>
      <path d="M57 34 L63 34 L63 79 L60 75 L57 79 Z" fill="${accent}"/>
    `,
    // 5: Classic rangefinder camera (u_natsu)
    `
      <rect x="26" y="29" width="11" height="5" rx="1.5" fill="${accent}"/>
      <rect x="61" y="28" width="12" height="6" rx="1.5" fill="${fg}"/>
      <rect x="20" y="34" width="60" height="39" rx="6" fill="${fg}"/>
      <rect x="20" y="34" width="60" height="11" rx="4" fill="${accent}"/>
      <rect x="27" y="37" width="11" height="5" rx="1.5" fill="${bg}"/>
      <circle cx="52" cy="56" r="14" fill="${bg}"/>
      <circle cx="52" cy="56" r="10.5" fill="${fg}"/>
      <circle cx="52" cy="56" r="5.5" fill="${accent}"/>
      <circle cx="54.5" cy="53.5" r="2" fill="${bg}"/>
    `,
    // 6: Steaming coffee cup & saucer (u_makoto)
    `
      <path d="M40 33 C37 28 43 24 40 19" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M50 31 C47 26 53 21 50 16" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M60 33 C57 28 63 24 60 19" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M30 40 L66 40 L63 58 C62 65 56 69 48 69 C40 69 34 65 33 58 Z" fill="${fg}"/>
      <path d="M65 44 C73 44 75 56 64 58" fill="none" stroke="${fg}" stroke-width="3.6" stroke-linecap="round"/>
      <ellipse cx="49" cy="73" rx="25" ry="4.5" fill="${accent}"/>
    `,
    // 7: Kitsune fox mask (u_aoi)
    `
      <path d="M29 44 L25 20 L43 32 C47 31 53 31 57 32 L75 20 L71 44 C73 56 63 72 50 79 C37 72 27 56 29 44 Z" fill="${fg}"/>
      <path d="M32 45 L29 27 L41 35 Z" fill="${accent}"/>
      <path d="M68 45 L71 27 L59 35 Z" fill="${accent}"/>
      <path d="M36 48 Q42 44 46 49" fill="none" stroke="${bg}" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M54 49 Q58 44 64 48" fill="none" stroke="${bg}" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M45 38 L50 35 L55 38 L50 42 Z" fill="${accent}"/>
      <path d="M33 56 L42 60 M67 56 L58 60" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="50" cy="68" r="2.2" fill="${bg}"/>
    `,
    // 8: Astrolabe / compass rose (u_yura)
    `
      <circle cx="50" cy="20" r="4" fill="none" stroke="${fg}" stroke-width="2.6"/>
      <circle cx="50" cy="53" r="27" fill="none" stroke="${fg}" stroke-width="2.6"/>
      <circle cx="50" cy="53" r="20" fill="none" stroke="${accent}" stroke-width="1.6" stroke-dasharray="3 3"/>
      <polygon points="50,31 55,48 72,53 55,58 50,75 45,58 28,53 45,48" fill="${fg}"/>
      <polygon points="50,31 55,48 50,53" fill="${accent}"/>
      <polygon points="72,53 55,58 50,53" fill="${accent}"/>
      <polygon points="50,75 45,58 50,53" fill="${accent}"/>
      <polygon points="28,53 45,48 50,53" fill="${accent}"/>
      <circle cx="50" cy="53" r="3.5" fill="${bg}"/>
    `,
    // 9: Vintage pocket watch / clock (u_yashimo)
    `
      <circle cx="50" cy="21" r="5" fill="none" stroke="${fg}" stroke-width="2.5"/>
      <rect x="46" y="25" width="8" height="5" rx="1.5" fill="${fg}"/>
      <circle cx="50" cy="54" r="25" fill="${fg}"/>
      <circle cx="50" cy="54" r="20" fill="${bg}"/>
      <circle cx="50" cy="54" r="16.5" fill="none" stroke="${accent}" stroke-width="1.4"/>
      <path d="M50 38 L50 41 M50 67 L50 70 M34 54 L37 54 M63 54 L66 54" stroke="${fg}" stroke-width="2.2" stroke-linecap="round"/>
      <polyline points="50,42 50,54 59,59" fill="none" stroke="${fg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="50" cy="54" r="2.6" fill="${accent}"/>
    `,
    // 10: Crossed sword & shield crest (u_sasa)
    `
      <path d="M25 26 L75 74 M75 26 L25 74" stroke="${accent}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M24 34 L33 25 M76 34 L67 25" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
      <path d="M32 30 L68 30 L68 50 C68 63 59 72 50 77 C41 72 32 63 32 50 Z" fill="${fg}" stroke="${bg}" stroke-width="2"/>
      <path d="M50 35 L50 70 M38 47 L62 47" stroke="${accent}" stroke-width="3.2" stroke-linecap="round"/>
    `,
    // 11: Owl emblem (u_toma)
    `
      <path d="M31 28 L39 34 C44 31 56 31 61 34 L69 28 L66 42 C70 49 69 63 60 72 L50 78 L40 72 C31 63 30 49 34 42 Z" fill="${fg}"/>
      <circle cx="42" cy="45" r="7.5" fill="${bg}"/>
      <circle cx="58" cy="45" r="7.5" fill="${bg}"/>
      <circle cx="42" cy="45" r="3.4" fill="${fg}"/>
      <circle cx="58" cy="45" r="3.4" fill="${fg}"/>
      <polygon points="50,47 54,53 50,57 46,53" fill="${accent}"/>
      <path d="M37 62 Q50 70 63 62" fill="none" stroke="${accent}" stroke-width="2.6" stroke-linecap="round"/>
    `,
  ];

  const motif = icons[kind % icons.length]!;
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="50" fill="${bg}"/>
      <path d="M12 68 A44 44 0 0 0 88 68 A48 48 0 0 1 12 68 Z" fill="${accent}" fill-opacity="0.16"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="${fg}" stroke-opacity="0.2" stroke-width="1.5"/>
      ${motif}
    </svg>
  `);
}

type JawKind = "oval" | "sharp" | "round" | "square";
type EyeKind = "calm" | "sharp" | "gentleSmile" | "serious" | "wink" | "glassesGlint";
type OutfitKind = "lapelCoat" | "highNeck" | "vestTie" | "hoodedCloak" | "shrineCollar" | "armorPauldron";
type AccessoryKind = "hat" | "scarf" | "earring" | "ribbon" | "monocle" | "headband" | "none";

interface PortraitOpts {
  bg: string;
  coat: string;
  hair: string;
  skin?: string;
  hairStyle: number;
  jawStyle: JawKind;
  eyeStyle: EyeKind;
  outfit: OutfitKind;
  accessory?: AccessoryKind;
}

/**
 * 探索者・PCキャラクター用のバストアップSVGを生成する。
 * 輪郭・表情6種・髪型8種・衣装6種・アクセサリの組み合わせで個性を出す。
 */
function makeCharacterPortrait(opts: PortraitOpts): string {
  const skin = opts.skin ?? "#f5dcc4";
  const hairBack = [
    // 0: Medium bob
    `<path d="M22 44 C20 21 40 15 50 15 C60 15 80 21 78 44 L80 74 L20 74 Z" fill="${opts.hair}"/>`,
    // 1: Short layered crop
    `<path d="M24 42 C24 19 76 19 76 42 L73 58 L27 58 Z" fill="${opts.hair}"/>`,
    // 2: Side bun / ponytail
    `<path d="M24 45 C22 20 78 20 76 45 L72 62 L28 62 Z" fill="${opts.hair}"/><circle cx="75" cy="35" r="10.5" fill="${opts.hair}"/>`,
    // 3: Neat short slick
    `<path d="M26 42 C26 19 74 19 74 42 L71 54 L29 54 Z" fill="${opts.hair}"/>`,
    // 4: Long straight hime-cut
    `<path d="M19 44 C19 17 81 17 81 44 L85 86 L15 86 Z" fill="${opts.hair}"/>`,
    // 5: Fluffy wavy medium
    `<path d="M20 45 C18 20 38 14 50 15 C62 14 82 20 80 45 C83 56 79 68 74 74 L26 74 C21 68 17 56 20 45 Z" fill="${opts.hair}"/>`,
    // 6: Low twin braids
    `<path d="M23 44 C23 19 77 19 77 44 L73 60 L27 60 Z" fill="${opts.hair}"/><ellipse cx="26" cy="68" rx="6" ry="13" fill="${opts.hair}"/><ellipse cx="74" cy="68" rx="6" ry="13" fill="${opts.hair}"/>`,
    // 7: Windswept collar-length
    `<path d="M21 44 C22 18 78 18 79 44 L82 68 L68 62 L32 62 L18 68 Z" fill="${opts.hair}"/>`,
  ][opts.hairStyle % 8]!;

  const hairFront = [
    `<path d="M24 38 C30 20 70 20 76 38 C68 30 58 29 50 35 C42 29 32 30 24 38 Z" fill="${opts.hair}"/>`,
    `<path d="M24 40 C27 18 73 18 76 40 C68 29 60 34 55 27 C48 35 40 28 34 37 C29 33 26 35 24 40 Z" fill="${opts.hair}"/>`,
    `<path d="M24 37 C32 18 68 18 76 37 C64 34 54 26 48 35 C40 26 32 34 24 37 Z" fill="${opts.hair}"/>`,
    `<path d="M25 39 C29 19 71 19 75 39 C68 26 56 25 50 31 C44 25 32 26 25 39 Z" fill="${opts.hair}"/>`,
    `<path d="M21 42 C26 18 74 18 79 42 C71 31 61 27 50 36 C39 27 29 31 21 42 Z" fill="${opts.hair}"/><rect x="25" y="38" width="5" height="22" rx="2" fill="${opts.hair}"/><rect x="70" y="38" width="5" height="22" rx="2" fill="${opts.hair}"/>`,
    `<path d="M22 41 C28 19 72 19 78 41 C70 32 62 36 55 30 C49 36 42 30 35 36 C28 32 24 36 22 41 Z" fill="${opts.hair}"/>`,
    `<path d="M24 39 C30 19 70 19 76 39 C65 28 55 29 50 36 C45 29 35 28 24 39 Z" fill="${opts.hair}"/>`,
    `<path d="M22 40 C29 18 72 18 78 40 C69 27 53 29 41 38 C33 31 26 34 22 40 Z" fill="${opts.hair}"/>`,
  ][opts.hairStyle % 8]!;

  const headPath: Record<JawKind, string> = {
    oval: `<path d="M31 43 C31 28 69 28 69 43 C69 57 60 67 50 67 C40 67 31 57 31 43 Z" fill="${skin}"/>`,
    sharp: `<path d="M31 42 C31 27 69 27 69 42 C68 55 58 65 50 68 C42 65 32 55 31 42 Z" fill="${skin}"/>`,
    round: `<path d="M29 44 C29 28 71 28 71 44 C71 58 62 67 50 67 C38 67 29 58 29 44 Z" fill="${skin}"/>`,
    square: `<path d="M31 43 C31 28 69 28 69 43 L67 57 C64 64 57 67 50 67 C43 67 36 64 33 57 Z" fill="${skin}"/>`,
  };

  const eyesSvg: Record<EyeKind, string> = {
    calm: `
      <path d="M36 39 Q41 37 45 39" stroke="#3d2c23" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M55 39 Q59 37 64 39" stroke="#3d2c23" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="41" cy="46" r="2.5" fill="#2c221d"/>
      <circle cx="59" cy="46" r="2.5" fill="#2c221d"/>
      <circle cx="41.8" cy="45.2" r="0.8" fill="#ffffff"/>
      <circle cx="59.8" cy="45.2" r="0.8" fill="#ffffff"/>
      <path d="M46 55 Q50 57.5 54 55" stroke="#8c5843" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    `,
    sharp: `
      <path d="M36 40 L45 41.5" stroke="#3d2c23" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M64 40 L55 41.5" stroke="#3d2c23" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M37 45 L45 46" stroke="#2c221d" stroke-width="2" stroke-linecap="round"/>
      <path d="M63 45 L55 46" stroke="#2c221d" stroke-width="2" stroke-linecap="round"/>
      <circle cx="41" cy="46.5" r="2.1" fill="#2c221d"/>
      <circle cx="59" cy="46.5" r="2.1" fill="#2c221d"/>
      <path d="M46 56 L54 55.2" stroke="#8c5843" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    `,
    gentleSmile: `
      <path d="M36 39 Q41 36.5 45 39" stroke="#3d2c23" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M55 39 Q59 36.5 64 39" stroke="#3d2c23" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M37 46 Q41 42.5 45 46" stroke="#2c221d" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M55 46 Q59 42.5 63 46" stroke="#2c221d" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M45 54.5 Q50 58.5 55 54.5" stroke="#8c5843" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `,
    serious: `
      <path d="M36 40.5 L45 41" stroke="#3d2c23" stroke-width="2" stroke-linecap="round"/>
      <path d="M55 41 L64 40.5" stroke="#3d2c23" stroke-width="2" stroke-linecap="round"/>
      <rect x="38.2" y="44.2" width="5.6" height="3.6" rx="1.6" fill="#2c221d"/>
      <rect x="56.2" y="44.2" width="5.6" height="3.6" rx="1.6" fill="#2c221d"/>
      <line x1="46" y1="56" x2="54" y2="56" stroke="#8c5843" stroke-width="1.7" stroke-linecap="round"/>
    `,
    wink: `
      <path d="M36 39 Q41 37 45 39" stroke="#3d2c23" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M55 40 Q59 38 64 40" stroke="#3d2c23" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="41" cy="46" r="2.5" fill="#2c221d"/>
      <circle cx="41.8" cy="45.2" r="0.8" fill="#ffffff"/>
      <path d="M55 46 Q59 43 63 46" stroke="#2c221d" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M45.5 54.5 Q50 58 54.5 55" stroke="#8c5843" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    `,
    glassesGlint: `
      <path d="M36 39 Q41 37.5 45 39" stroke="#3d2c23" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M55 39 Q59 37.5 64 39" stroke="#3d2c23" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="41" cy="46" r="2.1" fill="#2c221d"/>
      <circle cx="59" cy="46" r="2.1" fill="#2c221d"/>
      <g stroke="#2e231c" stroke-width="1.9" fill="#ffffff" fill-opacity="0.22">
        <rect x="34.5" y="41.5" width="12.5" height="9" rx="3"/>
        <rect x="53" y="41.5" width="12.5" height="9" rx="3"/>
      </g>
      <line x1="47" y1="45.5" x2="53" y2="45.5" stroke="#2e231c" stroke-width="1.8"/>
      <line x1="37" y1="48" x2="41" y2="43.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="55.5" y1="48" x2="59.5" y2="43.5" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M46 55.5 Q50 57.5 54 55.5" stroke="#8c5843" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    `,
  };

  const outfitSvg: Record<OutfitKind, string> = {
    lapelCoat: `
      <path d="M16 98 C18 74 33 68 50 68 C67 68 82 74 84 98 Z" fill="${opts.coat}"/>
      <path d="M41 68 L50 86 L59 68 Z" fill="#fbf6ef"/>
      <path d="M35 69 L44 85 L39 74 Z M65 69 L56 85 L61 74 Z" fill="#2a211b" fill-opacity="0.22"/>
      <circle cx="50" cy="89" r="1.8" fill="#e6d7c3"/>
    `,
    highNeck: `
      <path d="M17 98 C19 75 34 69 50 69 C66 69 81 75 83 98 Z" fill="${opts.coat}"/>
      <path d="M39 63 L61 63 L62 74 Q50 78 38 74 Z" fill="${opts.coat}" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1.2"/>
      <path d="M43 65 L43 74 M50 66 L50 75 M57 65 L57 74" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.2"/>
    `,
    vestTie: `
      <path d="M17 98 C19 74 34 68 50 68 C66 68 81 74 83 98 Z" fill="#fbf6ef"/>
      <path d="M30 70 L42 86 L42 98 L20 98 Z M70 70 L58 86 L58 98 L80 98 Z" fill="${opts.coat}"/>
      <path d="M42 84 L58 84 L58 98 L42 98 Z" fill="${opts.coat}"/>
      <polygon points="48,70 52,70 53,84 50,88 47,84" fill="#8c3b2b"/>
    `,
    hoodedCloak: `
      <path d="M14 98 C16 71 32 65 50 65 C68 65 84 71 86 98 Z" fill="${opts.coat}"/>
      <path d="M27 72 Q50 83 73 72 Q65 65 50 67 Q35 65 27 72 Z" fill="#1e1712" fill-opacity="0.22"/>
      <circle cx="50" cy="77" r="3" fill="#dfb05b"/>
    `,
    shrineCollar: `
      <path d="M17 98 C19 74 34 68 50 68 C66 68 81 74 83 98 Z" fill="#fbf6ef"/>
      <path d="M38 69 L50 83 L62 69" fill="none" stroke="${opts.coat}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M22 98 L28 79 L44 85 L56 85 L72 79 L78 98 Z" fill="${opts.coat}"/>
    `,
    armorPauldron: `
      <path d="M17 98 C19 74 34 68 50 68 C66 68 81 74 83 98 Z" fill="${opts.coat}"/>
      <path d="M17 85 C20 71 31 67 40 72 L36 86 Z" fill="#8e8a84" stroke="#2c241e" stroke-width="1.2"/>
      <path d="M83 85 C80 71 69 67 60 72 L64 86 Z" fill="#8e8a84" stroke="#2c241e" stroke-width="1.2"/>
      <path d="M40 72 L60 72 L55 86 L45 86 Z" fill="#d8cbb8" fill-opacity="0.35"/>
      <line x1="36" y1="73" x2="62" y2="96" stroke="#5c3d28" stroke-width="4"/>
    `,
  };

  const acc =
    opts.accessory === "hat"
      ? `<path d="M18 30 Q50 18 82 30 L74 20 Q50 12 26 20 Z" fill="${opts.coat}"/>`
      : opts.accessory === "scarf"
        ? `<path d="M32 66 Q50 74 68 66 L70 78 Q50 84 30 78 Z" fill="#c85232"/>`
        : opts.accessory === "ribbon"
          ? `<path d="M66 24 L78 18 L75 30 Z M66 24 L76 32 L64 31 Z" fill="#d15b47"/>`
          : opts.accessory === "earring"
            ? `<circle cx="29" cy="52" r="2.5" fill="#dfb05b"/><circle cx="71" cy="52" r="2.5" fill="#dfb05b"/>`
            : opts.accessory === "monocle"
              ? `<circle cx="59" cy="46" r="6" fill="none" stroke="#c89d42" stroke-width="1.8"/><line x1="65" y1="48" x2="67" y2="62" stroke="#c89d42" stroke-width="1.2"/>`
              : opts.accessory === "headband"
                ? `<path d="M27 32 Q50 22 73 32" fill="none" stroke="#c85232" stroke-width="3.2" stroke-linecap="round"/>`
                : "";

  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="50" fill="${opts.bg}"/>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5"/>
      ${hairBack}
      ${outfitSvg[opts.outfit]}
      <rect x="44" y="57" width="12" height="14" rx="5" fill="${skin}"/>
      <circle cx="30" cy="47" r="3.5" fill="${skin}"/>
      <circle cx="70" cy="47" r="3.5" fill="${skin}"/>
      ${headPath[opts.jawStyle]}
      <circle cx="35.5" cy="51.5" r="3" fill="#e89984" fill-opacity="0.38"/>
      <circle cx="64.5" cy="51.5" r="3" fill="#e89984" fill-opacity="0.38"/>
      ${eyesSvg[opts.eyeStyle]}
      ${hairFront}
      ${acc}
    </svg>
  `);
}

const users = [
  {
    id: "u_mikan",
    name: "みかん",
    color: "#b85d27",
    image: makeUserEmblem(0, "#f4decb", "#2a211b", "#b84724"),
    bio: "CoC7版メイン。週末夜にKPとPLの両方で遊んでいます。",
    profilePublic: true,
    accounts: [
      {
        provider: "google",
        status: "linked",
        externalId: "go_10823457",
        displayName: "mikan.trpg@gmail.com",
        email: "mikan.trpg@gmail.com",
        verifiedAt: "2026-08-01",
      },
      {
        provider: "discord",
        status: "linked",
        externalId: "328915401",
        displayName: "mikan_trpg",
        verifiedAt: "2026-08-01",
      },
    ],
  },
  {
    id: "u_sora",
    name: "そら",
    color: "#3b6e52",
    image: makeUserEmblem(1, "#dceadf", "#254935", "#c87a28"),
    bio: "テキストセッション中心。探索者の立ち絵とログの整理が好き。",
    accounts: [
      {
        provider: "discord",
        status: "linked",
        externalId: "55190233",
        displayName: "sora_coc",
        verifiedAt: "2026-08-20",
      },
    ],
  },
  {
    id: "u_kai",
    name: "カイ",
    color: "#a86428",
    image: makeUserEmblem(2, "#f2e2ce", "#4a2c16", "#d9822b"),
    bio: "現代ホラーとクラシック探索シナリオをよく回ります。",
    accounts: [
      {
        provider: "discord",
        status: "linked",
        externalId: "88120199",
        displayName: "kai_dice",
        verifiedAt: "2026-08-20",
      },
    ],
  },
  {
    id: "u_hina",
    name: "ひな",
    color: "#b3423a",
    image: makeUserEmblem(3, "#f4dcd8", "#57211d", "#c85232"),
    bio: "イラストレーター兼PL。自陣の記念カードを作る係。",
    accounts: [
      {
        provider: "x",
        status: "linked",
        externalId: "hina_xz",
        displayName: "@hina_trpg",
        verifiedAt: "2026-09-12",
      },
    ],
  },
  {
    id: "u_rin",
    name: "りん",
    color: "#356b78",
    image: makeUserEmblem(4, "#dae8ec", "#22464f", "#b84724"),
    bio: "古書店勤務。調査系・民俗学系のCoCシナリオが好物。",
    accounts: [
      {
        provider: "google",
        status: "linked",
        externalId: "go_60213371",
        displayName: "rin.books@gmail.com",
        email: "rin.books@gmail.com",
        verifiedAt: "2026-10-02",
      },
    ],
  },
  {
    id: "u_natsu",
    name: "なつ",
    color: "#c0782c",
    image: makeUserEmblem(5, "#f5e6cf", "#36271d", "#c0782c"),
    bio: "SW2.5とCoC7版の二刀流。前衛と斥候キャラをよく担当します。",
    accounts: [
      {
        provider: "discord",
        status: "linked",
        externalId: "77322190",
        displayName: "natsu_roll",
        verifiedAt: "2026-09-01",
      },
    ],
  },
  {
    id: "u_makoto",
    name: "まこと",
    color: "#436e52",
    image: makeUserEmblem(6, "#dfeade", "#2e4b38", "#9c6234"),
    bio: "医療系・理系探索者を作りがち。平日夜の分割卓メイン。",
    accounts: [
      {
        provider: "google",
        status: "linked",
        externalId: "go_55201998",
        displayName: "makoto.table@gmail.com",
        email: "makoto.table@gmail.com",
        verifiedAt: "2026-10-12",
      },
    ],
  },
  {
    id: "u_aoi",
    name: "あおい",
    color: "#9e3f58",
    image: makeUserEmblem(7, "#f1dce2", "#471c28", "#c84640"),
    bio: "マーダーミステリーとエモクロアのGM・進行役をよく担当。",
    accounts: [
      {
        provider: "x",
        status: "linked",
        externalId: "aoi_mm",
        displayName: "@aoi_mystery",
        verifiedAt: "2026-10-15",
      },
    ],
  },
  {
    id: "u_yura",
    name: "由良",
    color: "#6d5b82",
    image: makeUserEmblem(8, "#e6dff0", "#3c304a", "#b87a2e"),
    bio: "同人シナリオ書き。2PL・タイマンシナリオを中心に遊んでいます。",
    accounts: [
      {
        provider: "discord",
        status: "linked",
        externalId: "44102288",
        displayName: "yura_note",
        verifiedAt: "2026-10-20",
      },
    ],
  },
  {
    id: "u_yashimo",
    name: "夜霜",
    color: "#5c4d42",
    image: makeUserEmblem(9, "#e8dfd6", "#302720", "#a86b28"),
    bio: "KP専業ぎみ。学校・地方都市・伝奇もののシナリオを制作・公開しています。",
    accounts: [
      {
        provider: "x",
        status: "linked",
        externalId: "yashimo_kp",
        displayName: "@yashimo_kp",
        verifiedAt: "2026-07-30",
      },
    ],
  },
  {
    id: "u_sasa",
    name: "佐々",
    color: "#735840",
    image: makeUserEmblem(10, "#ede2d5", "#4a3625", "#b84724"),
    bio: "SW2.5とエモクロアのGM。月1でキャンペーン卓を主催。",
    accounts: [
      {
        provider: "discord",
        status: "linked",
        externalId: "99012345",
        displayName: "sasa_gm",
        verifiedAt: "2026-08-11",
      },
    ],
  },
  {
    id: "u_toma",
    name: "灯馬",
    color: "#4a6274",
    image: makeUserEmblem(11, "#dde5eb", "#283a47", "#c47d34"),
    bio: "ルールブック未所持・初心者向けのCoC体験卓を定期開催。",
    accounts: [
      {
        provider: "google",
        status: "linked",
        externalId: "go_77810023",
        displayName: "toma.keeper@gmail.com",
        email: "toma.keeper@gmail.com",
        verifiedAt: "2026-09-05",
      },
    ],
  },
];

const tables = [
  {
    id: "t_haikou",
    name: "廃校部",
    ownerId: "u_yashimo",
    memberIds: ["u_yashimo", "u_mikan", "u_sora", "u_kai", "u_hina"],
    note: "隔週土曜 21:00〜",
  },
  {
    id: "t_shiosai",
    name: "潮騒の会",
    ownerId: "u_mikan",
    memberIds: ["u_mikan", "u_sora", "u_rin", "u_natsu"],
    note: "第2・第4土曜 21:00〜（Discord + ココフォリア）",
  },
  {
    id: "t_ougonto",
    name: "黄金亭の冒険者",
    ownerId: "u_sasa",
    memberIds: ["u_sasa", "u_mikan", "u_kai", "u_hina"],
    note: "月1日曜 13:00〜",
  },
  {
    id: "t_yomatsuri",
    name: "夜祭班",
    ownerId: "u_sasa",
    memberIds: ["u_sasa", "u_sora", "u_aoi"],
    note: "不定期・週末夜",
  },
  {
    id: "t_madamis",
    name: "マダミス研究会",
    ownerId: "u_aoi",
    memberIds: ["u_aoi", "u_sora", "u_mikan", "u_hina"],
    note: "金曜 20:00〜",
  },
  {
    id: "t_nyuumon",
    name: "CoC入門実験団",
    ownerId: "u_toma",
    memberIds: ["u_toma", "u_makoto", "u_natsu", "u_yura"],
    note: "土曜昼（ボイセ）",
  },
  {
    id: "t_keizoku",
    name: "継続探索者の間",
    ownerId: "u_mikan",
    memberIds: ["u_mikan", "u_sora", "u_kai", "u_rin", "u_hina", "u_makoto"],
    note: "週末夜 21:30〜",
  },
  {
    id: "t_zatsu",
    name: "ボイセ雑談卓",
    ownerId: "u_kai",
    memberIds: ["u_kai", "u_natsu", "u_yura"],
    note: "平日夜 21:00〜",
  },
];

const scenarios = [
  {
    id: "sc_kankyo",
    title: "廃校の十三時間目",
    author: "しおかぜ堂",
    systemId: "coc7",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/4710900",
    emoji: "CoC7",
    bg: "#efe6d8",
    tags: ["学校", "クローズド", "4〜5時間"],
    extraRuns: 4,
    description: "取り壊しが決まった旧校舎を舞台にした、4人向けクローズド調査シナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_abyss",
    title: "深淵の呼び声",
    author: "夜霜サークル",
    systemId: "coc7",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/4821337",
    emoji: "CoC7",
    bg: "#e8dfd5",
    tags: ["港町", "キャンペーン", "全3話"],
    extraRuns: 9,
    description: "霧の港町と沈没船の記録を追う、全3話のシティ探索キャンペーン。",
    claimedBy: "u_yashimo",
    addedBy: "system",
  },
  {
    id: "sc_hitori",
    title: "放課後の標本室",
    author: "夜霜（自作）",
    systemId: "coc7",
    source: "manual",
    emoji: "CoC7",
    bg: "#ede4d7",
    tags: ["学校", "短編"],
    description: "旧理科棟の標本整理を手伝う探索者たちが、記録にない標本箱を見つける短編。",
    claimedBy: null,
    addedBy: "user",
    addedByUid: "u_yashimo",
  },
  {
    id: "sc_amamiya",
    title: "雨宮家の食卓",
    author: "神隠し工房",
    systemId: "coc7",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/4501922",
    emoji: "CoC7",
    bg: "#efe8da",
    tags: ["旧家", "調査"],
    description: "山間の旧家に招かれた探索者たちが、屋敷のしきたりと古文書を調べるシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_tsukiyuki",
    title: "月長石の夢路",
    author: "月読堂",
    systemId: "coc7",
    source: "talto",
    sourceUrl: "https://talto.io/works/19220",
    emoji: "CoC7",
    bg: "#e8e2d8",
    tags: ["音楽", "シティ"],
    description: "古いオルゴールと時計店の依頼から始まるシティシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_kyouen",
    title: "狂宴は儂の隣で",
    author: "泡沫フィルム",
    systemId: "emoklore",
    source: "talto",
    sourceUrl: "https://talto.io/works/20113",
    emoji: "エモ",
    bg: "#f0e1dc",
    tags: ["夜祭", "2〜3PL"],
    extraRuns: 18,
    description: "秋祭りの夜、狐面の行列に紛れ込んだ共鳴者たちのエモクロアシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_oudan",
    title: "王都の黄金亭",
    author: "泡沫フィルム",
    systemId: "sw25",
    source: "talto",
    sourceUrl: "https://talto.io/works/18842",
    emoji: "SW",
    bg: "#f0e6d2",
    tags: ["初期作成", "1回完結"],
    description: "冒険者ギルド『黄金亭』の地下倉庫と消えた銀貨を追う初期作成向けシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_kaze",
    title: "風来の旅路",
    author: "しおかぜ堂",
    systemId: "sw25",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/4630221",
    emoji: "SW",
    bg: "#e7eadc",
    tags: ["野外探索", "Lv3〜4"],
    description: "街道沿いの遺跡と隊商護衛を兼ねた中レベル帯シナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_ameya",
    title: "雨の夜の館で",
    author: "雨宿り文庫",
    systemId: "madamis",
    source: "manual",
    emoji: "MM",
    bg: "#e6e2da",
    tags: ["館もの", "4人用"],
    description: "嵐で孤立した洋館を舞台にした4人用マーダーミステリー。",
    claimedBy: null,
    addedBy: "user",
    addedByUid: "u_aoi",
  },
  {
    id: "sc_meicha",
    title: "銘茶と殺意",
    author: "宵待舎",
    systemId: "madamis",
    source: "manual",
    emoji: "MM",
    bg: "#e6eadb",
    tags: ["和風", "4人用"],
    description: "老舗茶舗の品評会で起きた事件を巡る4人用マーダーミステリー。",
    claimedBy: null,
    addedBy: "user",
    addedByUid: "u_aoi",
  },
  {
    id: "sc_shino",
    title: "篠鳴りの宿",
    author: "夜霜サークル",
    systemId: "coc7",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/4910880",
    emoji: "CoC7",
    bg: "#ece0d2",
    tags: ["温泉宿", "伝奇"],
    description: "竹林に囲まれた湯治宿に滞在する探索者たちの和風伝奇シナリオ。",
    claimedBy: "u_yashimo",
    addedBy: "system",
  },
  {
    id: "sc_yukimi",
    title: "雪見の二人",
    author: "月読堂",
    systemId: "coc7",
    source: "talto",
    sourceUrl: "https://talto.io/works/20500",
    emoji: "CoC7",
    bg: "#ebe5dc",
    tags: ["2PL", "冬"],
    description: "大雪で終電を逃した探索者2人が小さな喫茶店で一夜を過ごすシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_yorugari",
    title: "夜汽車の窓辺から",
    author: "夜霜サークル",
    systemId: "coc7",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/5012410",
    emoji: "CoC7",
    bg: "#e6e1d9",
    tags: ["鉄道", "タイマン可", "2〜3時間"],
    description:
      "深夜のローカル線に乗り合わせた探索者たちが、終着駅のない車内で奇妙な乗客と出会う短編シナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_hotaru",
    title: "夏蛍の帰路",
    author: "月読堂",
    systemId: "emoklore",
    source: "talto",
    sourceUrl: "https://talto.io/works/21405",
    emoji: "エモ",
    bg: "#ebd9df",
    tags: ["現代", "田舎", "3〜4時間"],
    extraRuns: 11,
    description:
      "夏休みに祖母の家へ帰省した共鳴者たちが、夕暮れの雑木林で古い石碑と青い蛍を見つけるシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_kagerou",
    title: "陽炎の観測所",
    author: "泡沫フィルム",
    systemId: "emoklore",
    source: "talto",
    sourceUrl: "https://talto.io/works/22018",
    emoji: "エモ",
    bg: "#e9dfe6",
    tags: ["天文台", "2PL"],
    description:
      "廃業した山上の天文台で、観測日誌の空白を埋めるように現れる怪異と向き合う2PLエモクロアシナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_suishou",
    title: "霧森の水晶塔",
    author: "しおかぜ堂",
    systemId: "sw25",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/5104200",
    emoji: "SW",
    bg: "#e5ebd6",
    tags: ["遺跡探索", "Lv5〜6", "4人向け"],
    description:
      "蛮族領域の縁にそびえる魔法文明時代の塔を調査し、起動しかけた魔動機を停止させるダンジョン探索シナリオ。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    id: "sc_hakumei",
    title: "薄明の劇団と最後の幕",
    author: "宵待舎",
    systemId: "madamis",
    source: "booth",
    sourceUrl: "https://booth.pm/ja/items/5189300",
    emoji: "MM",
    bg: "#eae2d8",
    tags: ["劇場", "5人用", "密室"],
    extraRuns: 6,
    description:
      "千秋楽を翌日に控えた小劇場で座長が姿を消し、残された5人の団員が真相を探るマーダーミステリー。",
    claimedBy: null,
    addedBy: "system",
  },
  {
    // シナリオを持たない集まり（事前相談）は、共有シナリオ一覧に出さないシナリオとして記録する
    id: "sc_haikou_prep",
    title: "キャラクター作成・事前相談",
    author: "夜霜",
    systemId: "coc7",
    source: "manual",
    emoji: "CoC7",
    bg: "#ede4d7",
    tags: [],
    claimedBy: null,
    addedBy: "user",
    addedByUid: "u_yashimo",
    private: true,
  },
];

type CharTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string[],
  Record<string, number>,
  PortraitOpts,
];

const charsDef: CharTuple[] = [
  [
    "ch_towa",
    "u_mikan",
    "遠沢澄花",
    "coc7",
    "#b85d27",
    "地方紙記者（継続探索者）",
    "地方紙の文化部記者。聞き込みと図書館調査が得意で、取材用カメラと古い万年筆を常に持ち歩いている。",
    ["記者", "調査枠"],
    { san: 52, mp: 12 },
    {
      bg: "#f3dfd0",
      coat: "#8c4a27",
      hair: "#36251d",
      skin: "#f6ddc6",
      hairStyle: 0,
      jawStyle: "oval",
      eyeStyle: "calm",
      outfit: "lapelCoat",
      accessory: "hat",
    },
  ],
  [
    "ch_rei",
    "u_sora",
    "白瀬怜",
    "coc7",
    "#3b6e52",
    "救急外来看護師（継続探索者）",
    "夜間救急で働く看護師。応急手当と精神分析が高く、混乱した現場でも落ち着いて対処する。",
    ["医療枠", "精神分析"],
    { san: 58, mp: 13 },
    {
      bg: "#dceadf",
      coat: "#3b6e52",
      hair: "#222a26",
      skin: "#f7e2cf",
      hairStyle: 1,
      jawStyle: "sharp",
      eyeStyle: "glassesGlint",
      outfit: "highNeck",
      accessory: "none",
    },
  ],
  [
    "ch_yuzuki",
    "u_kai",
    "如月柚希",
    "coc7",
    "#a86428",
    "民俗学専攻の大学生",
    "郷土史研究室に所属する大学3年生。目星とオカルトが高く、フィールドワーク用の懐中電灯を常備。",
    ["大学生", "目星"],
    { san: 46, mp: 10 },
    {
      bg: "#f2e2ce",
      coat: "#9c5a25",
      hair: "#4a3020",
      skin: "#f3d6bc",
      hairStyle: 3,
      jawStyle: "square",
      eyeStyle: "serious",
      outfit: "hoodedCloak",
      accessory: "scarf",
    },
  ],
  [
    "ch_nami",
    "u_hina",
    "波多乃波音",
    "coc7",
    "#b3423a",
    "装丁イラストレーター",
    "書籍装丁を手がけるイラストレーター。細部の違和感に気づく目星と聞き耳が高め。",
    ["芸術", "知覚枠"],
    { san: 54, mp: 11 },
    {
      bg: "#f4dcd8",
      coat: "#9e3b33",
      hair: "#63342a",
      skin: "#f8e2d2",
      hairStyle: 2,
      jawStyle: "round",
      eyeStyle: "wink",
      outfit: "vestTie",
      accessory: "ribbon",
    },
  ],
  [
    "ch_mio",
    "u_rin",
    "灯堂澪",
    "coc7",
    "#356b78",
    "古書店店員",
    "港町の古書店『灯堂』の店番。古文書と歴史の判定に強く、ラテン語の辞書を引ける。",
    ["古書店", "図書館"],
    { san: 51, mp: 12 },
    {
      bg: "#dae8ec",
      coat: "#2d5d69",
      hair: "#232a2e",
      skin: "#f7e4d4",
      hairStyle: 4,
      jawStyle: "sharp",
      eyeStyle: "glassesGlint",
      outfit: "lapelCoat",
      accessory: "earring",
    },
  ],
  [
    "ch_natsu",
    "u_natsu",
    "桐生那津",
    "coc7",
    "#c0782c",
    "山岳カメラマン",
    "自然雑誌の契約フォトグラファー。体力と登攀・追跡が高く、足場の悪い場所でも動ける。",
    ["写真家", "行動派"],
    { san: 60, mp: 11 },
    {
      bg: "#f5e6cf",
      coat: "#ab6824",
      hair: "#523420",
      skin: "#ecc7a8",
      hairStyle: 7,
      jawStyle: "square",
      eyeStyle: "sharp",
      outfit: "hoodedCloak",
      accessory: "headband",
    },
  ],
  [
    "ch_makoto",
    "u_makoto",
    "天城誠",
    "coc7",
    "#436e52",
    "法医学研究室の院生",
    "大学病院の研究室に所属する大学院生。医学・薬学・図書館を中心に取得している。",
    ["医学", "院生"],
    { san: 55, mp: 10 },
    {
      bg: "#dfeade",
      coat: "#3b6349",
      hair: "#2b2522",
      skin: "#f4dcc6",
      hairStyle: 3,
      jawStyle: "oval",
      eyeStyle: "glassesGlint",
      outfit: "vestTie",
      accessory: "none",
    },
  ],
  [
    "ch_kei",
    "u_yura",
    "由良見景",
    "coc7",
    "#6d5b82",
    "郷土資料館の学芸員",
    "市立資料館の学芸員。地域の伝承や古い戸籍・新聞縮刷版を調べるのが専門。",
    ["学芸員", "歴史"],
    { san: 62, mp: 12 },
    {
      bg: "#e6dff0",
      coat: "#5e4c73",
      hair: "#2e2636",
      skin: "#f6dfcd",
      hairStyle: 5,
      jawStyle: "oval",
      eyeStyle: "gentleSmile",
      outfit: "highNeck",
      accessory: "earring",
    },
  ],
  [
    "ch_meiko",
    "u_aoi",
    "九条迷子",
    "coc7",
    "#9e3f58",
    "骨董品店の店主",
    "路地裏で小さな骨董店を営む。目利きと交渉技能が高く、曰く付きの品物をよく持ち込まれる。",
    ["骨董商", "交渉枠"],
    { san: 49, mp: 13 },
    {
      bg: "#f1dce2",
      coat: "#8f364e",
      hair: "#3a2229",
      skin: "#f7e3d4",
      hairStyle: 6,
      jawStyle: "sharp",
      eyeStyle: "sharp",
      outfit: "shrineCollar",
      accessory: "monocle",
    },
  ],
  [
    "ch_kasumi",
    "u_mikan",
    "霧島霞",
    "coc7",
    "#7c5a44",
    "探偵事務所の調査助手",
    "都内の小さな探偵事務所で資料整理と張り込みを担当。鍵開けと心理学に長ける。",
    ["調査", "心理学"],
    { san: 64, mp: 11 },
    {
      bg: "#ede0d4",
      coat: "#634635",
      hair: "#3d2b22",
      skin: "#f4d8c0",
      hairStyle: 7,
      jawStyle: "sharp",
      eyeStyle: "wink",
      outfit: "vestTie",
      accessory: "monocle",
    },
  ],
  [
    "ch_himiko",
    "u_sora",
    "日向ひみこ",
    "emoklore",
    "#8c4a6b",
    "神社の禰宜",
    "地元の古い神社を継いだばかりの若手神職。祭礼の記録と伝承に詳しい。",
    ["神職", "調査"],
    { von: 4, taisyo: 6 },
    {
      bg: "#efe0e7",
      coat: "#9e3438",
      hair: "#262024",
      skin: "#f7e4d4",
      hairStyle: 4,
      jawStyle: "oval",
      eyeStyle: "calm",
      outfit: "shrineCollar",
      accessory: "ribbon",
    },
  ],
  [
    "ch_rinko",
    "u_aoi",
    "高梨凛子",
    "emoklore",
    "#4d6e63",
    "夜間警備員",
    "商店街と祭礼会場の巡回警備を担当。観察眼と危機察知に優れる。",
    ["警備", "知覚"],
    { von: 5, taisyo: 5 },
    {
      bg: "#dceae5",
      coat: "#3e5e53",
      hair: "#28302d",
      skin: "#f1d3ba",
      hairStyle: 1,
      jawStyle: "square",
      eyeStyle: "serious",
      outfit: "lapelCoat",
      accessory: "none",
    },
  ],
  [
    "ch_fuyuki",
    "u_mikan",
    "逢坂冬樹",
    "emoklore",
    "#4f6578",
    "大学図書館の司書",
    "郷土資料室の書庫を管理する司書。深夜の怪異譚を収集し、共鳴反応の記録をつけている。",
    ["司書", "怪異"],
    { von: 6, taisyo: 4 },
    {
      bg: "#e1e8ee",
      coat: "#3f5364",
      hair: "#2b323b",
      skin: "#f5dec9",
      hairStyle: 5,
      jawStyle: "oval",
      eyeStyle: "gentleSmile",
      outfit: "highNeck",
      accessory: "none",
    },
  ],
  [
    "ch_akantha",
    "u_mikan",
    "アカンタ",
    "sw25",
    "#b3541e",
    "エルフの射手（シューター/スカウト）",
    "森の辺境から王都へ出てきた弓使い。先制判定と遠距離支援を担当する。",
    ["シューター", "スカウト"],
    { hp: 32, mp: 18 },
    {
      bg: "#f5e1d3",
      coat: "#9e4818",
      hair: "#d49b58",
      skin: "#f9e6d5",
      hairStyle: 4,
      jawStyle: "sharp",
      eyeStyle: "sharp",
      outfit: "hoodedCloak",
      accessory: "earring",
    },
  ],
  [
    "ch_grin",
    "u_hina",
    "グリン",
    "sw25",
    "#5c6e32",
    "ドワーフの神官戦士（ファイター/プリースト）",
    "大盾と戦鎚を携えた前衛兼回復役。パーティの盾として最前列に立つ。",
    ["ファイター", "プリースト"],
    { hp: 38, mp: 16 },
    {
      bg: "#e5ebd8",
      coat: "#4e5e29",
      hair: "#8c4a27",
      skin: "#edc8a8",
      hairStyle: 5,
      jawStyle: "square",
      eyeStyle: "gentleSmile",
      outfit: "armorPauldron",
      accessory: "headband",
    },
  ],
  [
    "ch_suya",
    "u_natsu",
    "スヤ",
    "sw25",
    "#55687a",
    "人間のマギテック（マギテック/セージ）",
    "魔動機術と魔物知識判定を受け持つ後衛。遺跡の仕掛け解除も担当。",
    ["マギテック", "セージ"],
    { hp: 28, mp: 20 },
    {
      bg: "#dfe6ed",
      coat: "#465869",
      hair: "#333a40",
      skin: "#f5dcc4",
      hairStyle: 6,
      jawStyle: "round",
      eyeStyle: "glassesGlint",
      outfit: "armorPauldron",
      accessory: "none",
    },
  ],
  [
    "ch_kuro",
    "u_sora",
    "黒沢玖",
    "madamis",
    "#5c554e",
    "館の招待客（ピアニスト）",
    "音楽会のために洋館へ招かれたピアニスト。屋敷の主人とは旧知の仲。",
    ["PC1", "ピアニスト"],
    {},
    {
      bg: "#e8e3dd",
      coat: "#4a433d",
      hair: "#24201d",
      skin: "#f6e1ce",
      hairStyle: 3,
      jawStyle: "sharp",
      eyeStyle: "serious",
      outfit: "vestTie",
      accessory: "none",
    },
  ],
  [
    "ch_jun",
    "u_aoi",
    "白鳥潤",
    "madamis",
    "#9c5a68",
    "茶舗の若主人",
    "品評会を主催する老舗茶舗の跡取り。茶葉の鑑定と来客応対を取り仕切る。",
    ["PC2", "茶舗"],
    {},
    {
      bg: "#f0dfe3",
      coat: "#874b58",
      hair: "#38262a",
      skin: "#f7e2d1",
      hairStyle: 0,
      jawStyle: "round",
      eyeStyle: "calm",
      outfit: "shrineCollar",
      accessory: "none",
    },
  ],
];

interface SessionSeed {
  id: string;
  tableId: string;
  /** セッションは遊んだシナリオの題名で呼ぶ（名前を持たない） */
  scenarioId: string;
  systemId: string;
  ownerId: string;
  dates: string[];
  start: string;
  scope: "members" | "passed" | "public";
  hasLog: boolean;
  secret?: boolean;
  multiday?: boolean;
  players?: string[];
}

const sessions: SessionSeed[] = [
  {
    id: "s01",
    tableId: "t_haikou",
    scenarioId: "sc_kankyo",
    systemId: "coc7",
    ownerId: "u_yashimo",
    dates: ["2026-09-12"],
    start: "13:00",
    scope: "members",
    hasLog: true,
    secret: true,
  },
  {
    // 3 夜に分けて遊んだ 1 つのセッション
    id: "s02",
    tableId: "t_shiosai",
    scenarioId: "sc_abyss",
    systemId: "coc7",
    ownerId: "u_mikan",
    dates: ["2026-09-26", "2026-10-10", "2026-11-07"],
    start: "20:30",
    scope: "public",
    hasLog: true,
    secret: true,
  },
  {
    id: "s04",
    tableId: "t_ougonto",
    scenarioId: "sc_oudan",
    systemId: "sw25",
    ownerId: "u_sasa",
    dates: ["2026-09-20"],
    start: "19:00",
    scope: "members",
    hasLog: true,
    secret: false,
  },
  {
    id: "s05",
    tableId: "t_haikou",
    scenarioId: "sc_hitori",
    systemId: "coc7",
    ownerId: "u_yashimo",
    dates: ["2026-10-24"],
    start: "21:00",
    scope: "members",
    hasLog: true,
    secret: true,
  },
  {
    id: "s06",
    tableId: "t_nyuumon",
    scenarioId: "sc_amamiya",
    systemId: "coc7",
    ownerId: "u_toma",
    dates: ["2026-10-17"],
    start: "19:30",
    scope: "members",
    hasLog: true,
    secret: true,
  },
  {
    id: "s07",
    tableId: "t_yomatsuri",
    scenarioId: "sc_kyouen",
    systemId: "emoklore",
    ownerId: "u_sasa",
    dates: ["2026-10-31"],
    start: "20:30",
    scope: "public",
    hasLog: true,
    secret: false,
  },
  {
    id: "s09",
    tableId: "t_nyuumon",
    scenarioId: "sc_tsukiyuki",
    systemId: "coc7",
    ownerId: "u_toma",
    dates: ["2026-11-03"],
    start: "21:00",
    scope: "members",
    hasLog: true,
    secret: false,
  },
  {
    id: "s10",
    tableId: "t_haikou",
    scenarioId: "sc_kankyo",
    systemId: "coc7",
    ownerId: "u_yashimo",
    dates: ["2026-11-14", "2026-11-15"],
    start: "21:00",
    scope: "members",
    hasLog: true,
    secret: true,
    multiday: true,
  },
  {
    id: "s11",
    tableId: "t_madamis",
    scenarioId: "sc_ameya",
    systemId: "madamis",
    ownerId: "u_aoi",
    dates: ["2026-10-30"],
    start: "19:00",
    scope: "passed",
    hasLog: false,
    players: ["u_aoi", "u_sora", "u_mikan", "u_hina"],
  },
  {
    id: "s12",
    tableId: "t_madamis",
    scenarioId: "sc_meicha",
    systemId: "madamis",
    ownerId: "u_aoi",
    dates: ["2026-11-13"],
    start: "19:30",
    scope: "members",
    hasLog: false,
    players: ["u_aoi", "u_sora", "u_hina", "u_rin"],
  },
  {
    id: "s13",
    tableId: "t_ougonto",
    scenarioId: "sc_oudan",
    systemId: "sw25",
    ownerId: "u_sasa",
    dates: ["2026-11-06"],
    start: "19:00",
    scope: "members",
    hasLog: false,
    players: ["u_sasa", "u_mikan", "u_kai", "u_hina"],
  },
  {
    id: "s14",
    tableId: "t_ougonto",
    scenarioId: "sc_kaze",
    systemId: "sw25",
    ownerId: "u_sasa",
    dates: ["2026-11-05"],
    start: "20:00",
    scope: "members",
    hasLog: false,
    players: ["u_sasa", "u_mikan", "u_natsu"],
  },
  {
    id: "s15",
    tableId: "t_keizoku",
    scenarioId: "sc_yukimi",
    systemId: "coc7",
    ownerId: "u_mikan",
    dates: ["2026-11-01"],
    start: "21:30",
    scope: "passed",
    hasLog: true,
    secret: false,
  },
  {
    id: "s16",
    tableId: "t_haikou",
    scenarioId: "sc_haikou_prep",
    systemId: "coc7",
    ownerId: "u_yashimo",
    dates: ["2026-11-15"],
    start: "21:00",
    scope: "members",
    hasLog: false,
    players: ["u_yashimo", "u_mikan", "u_sora", "u_kai", "u_hina"],
  },
];

const DIALOGUE = {
  coc7: {
    scenes: [
      {
        kp: "それではセッションを始めます。導入として、あなたたちは依頼人から渡された古い鍵と地図を手に、調査対象の建物へと到着しました。",
        actions: [
          "「まずは外観と入口まわりを確認したいです。表札や郵便受けに何か残っていませんか？」",
          "「窓ガラスや施錠の状態を一通り見ておきます。目星で振れますか？」",
          "「周囲に人の気配がないか、聞き耳を立てておきたいです」",
        ],
      },
      {
        kp: "玄関の引き戸は少し重たいものの、預かった鍵で開錠できます。内部は長く使われておらず、廊下の奥に事務室と資料室の札が見えます。",
        actions: [
          "「懐中電灯をつけて事務室から順番に見ていきましょう。机の上や日誌を探します」",
          "「壁の掲示板やカレンダーの日付を確認します。いつから放置されているか分かりそうですか？」",
          "「床に新しい足跡や引きずった跡がないか追跡・目星で調べます」",
        ],
      },
      {
        kp: "事務室のキャビネットから当時の記録簿が見つかりました。最後のページだけ紙質が異なり、旧館地下室の備品目録が挟まっています。",
        actions: [
          "「記録簿の筆跡と日付を詳しく読みます。図書館で関連する記述を探せますか？」",
          "「備品目録に書かれている薬品棚や保管庫をメモしておきます。写真を撮っておこう」",
          "「隣の資料室も開けてみます。鍵がかかっていれば手元の束から合うものを探します」",
        ],
      },
      {
        kp: "資料室の奥、布が掛けられた棚の下から低い金属音が響きました。古い換気口の裏側に、小さな木箱が隠されています。",
        actions: [
          "「不用意に触る前に、罠や危険物がないか確認します」",
          "「木箱の留め具を開けて中身を確かめます。手袋をつけて慎重に扱います」",
          "「少し嫌な予感がするので、いつでも廊下へ退避できるよう扉を押さえておきます」",
        ],
      },
      {
        kp: "木箱の中には当時の日誌と、地下室の扉を封じるための手順書が収められていました。遠くの階段から、規則正しい足音が近づいてきます。",
        actions: [
          "「手順書の内容を急いで確認して、必要なものを揃えましょう！」",
          "「足音が来る方向を見張りつつ、バリケードになる棚を動かします」",
          "「動揺している仲間がいれば声をかけて落ち着かせます。精神分析か応急手当でフォローします」",
        ],
      },
    ],
    chat: [
      "休憩5分お願いします！飲み物取ってきます",
      "戻りました、後半もよろしくお願いします",
      "今の目星クリティカル助かりすぎる",
      "情報タブのメモ更新ありがとうございます！",
      "ここで図書館成功するの頼もしい",
      "次回の日程、来週土曜の21時で大丈夫そうですか？",
    ],
    secret: [
      "【シークレット】HO1個別情報：あなたが預かった封筒の裏には、依頼人の旧姓が記されている。",
      "【シークレット】KPメモ：資料室の判定に成功したため、終盤の交渉ロールに+20%の補正を付与する。",
      "【シークレット】個別伝達：先ほどの帳簿にあった署名は、あなたの過去の取材先と一致している。",
    ],
  },
  sw25: {
    scenes: [
      {
        kp: "王都の冒険者ギルド『黄金亭』にて、亭主から地下倉庫の異変と消えた銀貨袋の調査依頼が提示されました。",
        actions: [
          "「報酬と前金の内訳を確認しておこう。松明とロープはギルドで借りられるかな？」",
          "「倉庫の見取り図と、最後に鍵を閉めた従業員の話を聞いておきたいです」",
        ],
      },
      {
        kp: "地下倉庫へ降りると、奥の石壁の一部が崩れ、古い地下水路へと繋がる横穴が口を開けています。",
        actions: [
          "「足跡と罠の有無をスカウト技能で調べます。ランタンを前に掲げて進もう」",
          "「魔物の気配がないか聞き耳を立てます。いつでも盾を構えられるように前へ出ます」",
        ],
      },
      {
        kp: "水路の広間で、銀貨袋を抱えたゴブリンの斥候小隊と遭遇しました。向こうもこちらに気づき、武器を構えます。",
        actions: [
          "「先制判定いきます！魔物知識判定で弱点も抜いておきたい！」",
          "「前衛が食い止めている間に、後衛から射撃と魔法で数を減らします！」",
        ],
      },
    ],
    chat: [
      "先制とれたの大きい！",
      "回復助かります、次のラウンドで押し切れそう",
      "戦利品と経験点の計算メモしておきますね",
    ],
    secret: ["【シークレット】GMメモ：水路奥の隠し扉は達成値14以上で発見可能。"],
  },
  emoklore: {
    scenes: [
      {
        kp: "宵闇が迫る神社前通り。提灯に灯が入り、遠くから祭囃子の笛と太鼓の音が響いてきます。",
        actions: [
          "「屋台の並びと参道の様子を見渡します。見慣れない面を着けた人がいないか探します」",
          "「神社の社務所に立ち寄って、今年の祭礼の進行表を確認しておきたいです」",
        ],
      },
      {
        kp: "参道の石段を上がると、狐面を着けた行列が音もなく鳥居をくぐっていくのが見えました。",
        actions: [
          "「行列の最後尾に声をかけてみます。知覚や交渉で様子を探れますか？」",
          "「境内の灯籠に刻まれた文字を調べて、伝承との共通点を探します」",
        ],
      },
    ],
    chat: ["共鳴判定のダイス目が熱い", "雰囲気すごく良いですね、続きも楽しみ"],
    secret: [],
  },
  madamis: {
    scenes: [
      {
        kp: "全員が談話室に集まりました。これより前半の全体議論および現場調査フェーズ（25分）を開始します。",
        actions: [
          "「まずは各自の昨日の行動時間を時系列で整理しませんか？」",
          "「現場の部屋で見つかった手がかりカードから順番に共有していきましょう」",
        ],
      },
    ],
    chat: ["ハンドアウト確認完了です！", "議論フェーズ了解しました"],
    secret: [],
  },
} as const;

const COC_SKILLS: readonly [string, number][] = [
  ["目星", 70],
  ["聞き耳", 65],
  ["図書館", 70],
  ["心理学", 60],
  ["応急手当", 65],
  ["精神分析", 60],
  ["追跡", 55],
  ["歴史", 60],
];

function rollResult(roll: number, target: number): string {
  if (roll <= 5) return "クリティカル";
  if (roll >= 96) return "ファンブル";
  if (roll <= Math.floor(target / 5)) return "スペシャル";
  if (roll <= target) return "成功";
  return "失敗";
}

const NPC_PORTRAITS: Record<string, string> = {
  "用務員・佐伯": makeCharacterPortrait({
    bg: "#e9dfd3",
    coat: "#574b41",
    hair: "#6e6862",
    skin: "#ecc8aa",
    hairStyle: 3,
    jawStyle: "square",
    eyeStyle: "serious",
    outfit: "lapelCoat",
    accessory: "none",
  }),
  "灯台守・源造": makeCharacterPortrait({
    bg: "#dce6eb",
    coat: "#385263",
    hair: "#5b5b5e",
    skin: "#e3bc9d",
    hairStyle: 7,
    jawStyle: "square",
    eyeStyle: "sharp",
    outfit: "highNeck",
    accessory: "hat",
  }),
  黄金亭の亭主: makeCharacterPortrait({
    bg: "#f2e2ce",
    coat: "#8c4a27",
    hair: "#4c3222",
    skin: "#efc6a4",
    hairStyle: 1,
    jawStyle: "round",
    eyeStyle: "gentleSmile",
    outfit: "vestTie",
    accessory: "headband",
  }),
  社務所の巫女: makeCharacterPortrait({
    bg: "#f2dfe3",
    coat: "#a8363a",
    hair: "#272024",
    skin: "#f8e4d4",
    hairStyle: 4,
    jawStyle: "oval",
    eyeStyle: "calm",
    outfit: "shrineCollar",
    accessory: "ribbon",
  }),
  "執事・桐原": makeCharacterPortrait({
    bg: "#e4e2ec",
    coat: "#34323b",
    hair: "#4a4852",
    skin: "#f3dac5",
    hairStyle: 3,
    jawStyle: "sharp",
    eyeStyle: "glassesGlint",
    outfit: "vestTie",
    accessory: "monocle",
  }),
};

const NPC_DIALOGUE: Record<string, { sp: string; lines: readonly [string, string] }> = {
  t_haikou: {
    sp: "用務員・佐伯",
    lines: [
      "「旧校舎の鍵は確かに預かっています。日が落ちたら理科室の奥には入らないでください」",
      "「あの戸棚だけは先代の頃から誰も開けていないんです。何か見つけたら教えてください」",
    ],
  },
  t_shiosai: {
    sp: "灯台守・源造",
    lines: [
      "「霧が出る晩は、沖の鐘の音が浜まで聞こえてくるんだ。気をつけて調べてくれ」",
      "「古い航海日誌なら灯台の保管箱にしまってある。必要なら持って行っていいぞ」",
    ],
  },
  sw25: {
    sp: "黄金亭の亭主",
    lines: [
      "「おう、よく来てくれた！昨夜から地下倉庫の奥で妙な物音がしてな」",
      "「銀貨袋の数は帳簿に控えてある。無事で戻ったら温かいシチューを用意しておくぞ」",
    ],
  },
  emoklore: {
    sp: "社務所の巫女",
    lines: [
      "「お参りありがとうございます。今夜の奉納行列は本殿の裏から出ます」",
      "「古い祭礼録でしたら、社務所の棚に写本がございますのでどうぞご覧ください」",
    ],
  },
  madamis: {
    sp: "執事・桐原",
    lines: [
      "「嵐で電話線も切れてしまったようです。今夜は皆様こちらの館でお過ごしください」",
      "「夕食前の時刻表は書斎の机にございますので、ご確認ください」",
    ],
  },
  coc7_default: {
    sp: "執事・桐原",
    lines: [
      "「どうぞお掛けください。当主はまもなく書斎から参ります」",
      "「客間より奥の廊下には古い掛け軸があるだけでございますが、お気をつけて」",
    ],
  },
};

interface RawMsg {
  id: string;
  ch: "main" | "info" | "chat" | "secret";
  sp: string;
  kind: "KP" | "PC" | "PL" | "NPC";
  type: "text" | "note" | "roll";
  text?: string | null;
  roll?: { cmd: string; skill: string; dice: string; result: string };
  ts: number;
}

function genMessages(s: SessionSeed) {
  const pool = DIALOGUE[s.systemId as keyof typeof DIALOGUE] ?? DIALOGUE.coc7;
  const table = tables.find((t) => t.id === s.tableId);
  const members = table ? table.memberIds.filter((u) => u !== s.ownerId) : ["u_mikan", "u_sora"];
  const kpName = users.find((u) => u.id === s.ownerId)?.name ?? "KP";
  const npcPool = NPC_DIALOGUE[s.tableId] ?? NPC_DIALOGUE[s.systemId] ?? NPC_DIALOGUE.coc7_default;

  const charsByUser: Record<string, string[]> = {};
  for (const [, owner, name, sysId] of charsDef) {
    if (sysId === s.systemId) {
      (charsByUser[owner] ??= []).push(name);
    }
  }

  const seq: Omit<RawMsg, "id">[] = [];
  const push = (
    ch: RawMsg["ch"],
    sp: string,
    kind: RawMsg["kind"],
    type: RawMsg["type"],
    text?: string | null,
    roll?: RawMsg["roll"],
  ) => {
    seq.push({ ch, sp, kind, type, text: text ?? null, roll, ts: 0 });
  };

  push(
    "info",
    kpName,
    "KP",
    "text",
    "【部屋案内】BGM音量は各自で調整してください。ハウスルールは情報タブの通りです。",
  );

  for (let idx = 0; idx < pool.scenes.length; idx++) {
    const scene = pool.scenes[idx]!;
    push("main", kpName, "KP", "text", scene.kp);

    if (idx === 0) {
      push("main", npcPool.sp, "NPC", "text", npcPool.lines[0]);
    } else if (idx === 2 || (idx === 1 && pool.scenes.length <= 2)) {
      push("main", npcPool.sp, "NPC", "text", npcPool.lines[1]);
    }

    members.forEach((uid, mIdx) => {
      const cname = charsByUser[uid]?.[0] ?? users.find((u) => u.id === uid)?.name ?? "探索者";
      const line = scene.actions[(idx + mIdx) % scene.actions.length]!;
      push("main", cname, "PC", "text", line);

      const [skill, target] = COC_SKILLS[(idx + mIdx) % COC_SKILLS.length]!;
      const roll = ri(1, 100);
      const res = rollResult(roll, target);
      push("main", cname, "PC", "roll", null, {
        cmd: `CC<=${target} 【${skill}】`,
        skill,
        dice: `1D100<=${target} → ${roll}`,
        result: res,
      });
    });

    if (idx === 2 && s.systemId === "coc7") {
      const targetUid = members[0]!;
      const cname = charsByUser[targetUid]?.[0] ?? "探索者";
      const loss = ri(1, 3);
      push(
        "main",
        kpName,
        "KP",
        "text",
        "異様な光景を目撃した探索者は、正気度ロール（1/1D4）を行ってください。",
      );
      push("main", cname, "PC", "roll", null, {
        cmd: "SANチェック 1/1D4",
        skill: "SANチェック",
        dice: `1D4 → ${loss}`,
        result: `SAN-${loss}`,
      });
    }

    if (idx < pool.scenes.length - 1) {
      push("main", kpName, "KP", "note", `◆ シーン${idx + 1} 終了（場面転換）`);
    }
    if (pool.chat[idx]) {
      const plName = users.find((u) => u.id === members[idx % members.length])?.name ?? kpName;
      push("chat", plName, "PL", "text", pool.chat[idx]!);
    }
    if (s.secret && pool.secret[idx]) {
      push("secret", kpName, "KP", "text", pool.secret[idx]!);
    }
  }

  push(
    "info",
    kpName,
    "KP",
    "text",
    "【公開ハンドアウト】現場の見取り図と調査メモを共有タブに配置しました。",
  );
  push("main", kpName, "KP", "note", "◆ セッション終了");

  let ts = jstEpoch(s.dates[0]!, s.start);
  const halfway = Math.floor(seq.length * 0.55);
  // 何夜かに分けて遊んだセッションは、発言を夜の数に分けてそれぞれの日に置く
  const nights = s.multiday ? 1 : s.dates.length;
  seq.forEach((m, i) => {
    if (s.multiday && i === halfway) {
      ts = jstEpoch(s.dates[1] ?? nextDay(s.dates[0]!), "21:00");
    }
    const night = Math.floor((i * nights) / seq.length);
    if (night > 0 && Math.floor(((i - 1) * nights) / seq.length) < night)
      ts = jstEpoch(s.dates[night]!, s.start);
    ts += ri(180, 420);
    m.ts = ts;
  });

  const mk = (ch: RawMsg["ch"]) =>
    seq
      .filter((m) => m.ch === ch)
      .map((m, i) => ({
        id: `${s.id}-${ch}-${i}`,
        ts: m.ts,
        sp: m.sp,
        kind: m.kind,
        type: m.type,
        text: m.text,
        roll: m.roll,
      }));

  const channels = [{ id: "main", name: "メイン", secret: false, msgs: mk("main") }];
  const infoMsgs = mk("info");
  if (infoMsgs.length) channels.push({ id: "info", name: "情報", secret: false, msgs: infoMsgs });
  const chatMsgs = mk("chat");
  if (chatMsgs.length) channels.push({ id: "chat", name: "雑談", secret: false, msgs: chatMsgs });
  const secretMsgs = mk("secret");
  if (secretMsgs.length)
    channels.push({ id: "secret", name: "秘匿・KPメモ", secret: true, msgs: secretMsgs });

  return channels;
}

const charImageByName: Record<string, string> = {};
for (const [, , name, , , , , , , avatarOpts] of charsDef) {
  charImageByName[name] = makeCharacterPortrait(avatarOpts);
}

const IMPRESSIONS_BY_LOG: Record<
  string,
  { id: string; userId: string; text: string; createdAt: string; spoiler: boolean }[]
> = {
  s01: [
    {
      id: "imp_s01_1",
      userId: "u_mikan",
      text: "旧校舎の空気感がとても良くて、終盤のタイムリミット展開に手に汗握りました！",
      createdAt: "2026-09-12T18:10:00",
      spoiler: false,
    },
    {
      id: "imp_s01_2",
      userId: "u_sora",
      text: "理科室の棚の裏に隠されていた十三時間目の鐘の記録を見つけた瞬間、鳥肌が立ちました。",
      createdAt: "2026-09-12T18:25:00",
      spoiler: true,
    },
  ],
  s02: [
    {
      id: "imp_s02_1",
      userId: "u_rin",
      text: "港町の霧と灯台の描写が印象的でした。次回以降の調査も楽しみです。",
      createdAt: "2026-09-27T01:20:00",
      spoiler: false,
    },
    {
      id: "imp_s08_1",
      userId: "u_sora",
      text: "3 夜の集大成として忘れられない最終夜になりました。みんなお疲れさまでした！",
      createdAt: "2026-11-08T02:10:00",
      spoiler: false,
    },
    {
      id: "imp_s08_2",
      userId: "u_natsu",
      text: "灯台の鐘を止める役を引き受けた場面、ダイス目が震えました。あの選択に後悔なし。",
      createdAt: "2026-11-08T02:30:00",
      spoiler: true,
    },
  ],
  s05: [
    {
      id: "imp_s05_1",
      userId: "u_kai",
      text: "短編ながらNPCとの会話が印象に残る卓でした。用務員さんの一言が効いてた。",
      createdAt: "2026-10-25T00:30:00",
      spoiler: false,
    },
    {
      id: "imp_s05_2",
      userId: "u_hina",
      text: "標本箱のラベルが実は探索者の名前と一致していた仕掛けに気づいたとき声が出ました。",
      createdAt: "2026-10-25T00:45:00",
      spoiler: true,
    },
  ],
  s06: [
    {
      id: "imp_s06_1",
      userId: "u_makoto",
      text: "食卓の作法を一つずつ確認しながら進む緊張感が絶妙でした。また同卓したいです。",
      createdAt: "2026-10-18T00:15:00",
      spoiler: false,
    },
  ],
};

const logs: Record<string, Record<string, unknown>> = {};
for (const s of sessions) {
  const table = tables.find((t) => t.id === s.tableId);
  const memberIds = s.players ?? (table ? table.memberIds : []);
  const players: Record<string, { linked: boolean; hidden: boolean; characterIds: string[] }> = {};
  for (const u of memberIds) {
    players[u] = { linked: u !== "u_yura" || s.ownerId === "u_toma", hidden: false, characterIds: [] };
  }

  let channels: ReturnType<typeof genMessages> = [];
  /** 遊んだ時間帯（集まり）。ログがあれば発言時刻から、4 時間以上空いたところで区切る（src/lib/sittings.ts と同じ） */
  let sittings: { start: number; end: number }[];
  if (s.hasLog) {
    channels = genMessages(s);
    const all = channels.flatMap((c) => c.msgs.map((m) => m.ts)).sort((a, b) => a - b);
    sittings = [];
    for (const ts of all) {
      const cur = sittings.at(-1);
      if (cur && ts - cur.end < 4 * 3600) cur.end = ts;
      else sittings.push({ start: ts, end: ts });
    }
  } else {
    const start = jstEpoch(s.dates[0]!, s.start);
    sittings = [{ start, end: start + ri(3, 5) * 3600 + ri(0, 45) * 60 }];
  }
  const t1 = sittings.at(-1)!.end;

  const speakerIcons: Record<string, string> = {};
  const owner = users.find((u) => u.id === s.ownerId);
  if (owner?.image) {
    speakerIcons[owner.name] = owner.image;
  }
  for (const ch of channels) {
    for (const msg of ch.msgs) {
      if (speakerIcons[msg.sp]) continue;
      if (msg.kind === "NPC" && NPC_PORTRAITS[msg.sp]) {
        speakerIcons[msg.sp] = NPC_PORTRAITS[msg.sp]!;
      } else if (msg.kind === "PC" && charImageByName[msg.sp]) {
        speakerIcons[msg.sp] = charImageByName[msg.sp]!;
      } else if (msg.kind === "KP" && owner?.image) {
        speakerIcons[msg.sp] = owner.image;
      } else {
        const uImg = users.find((u) => u.name === msg.sp)?.image;
        if (uImg) speakerIcons[msg.sp] = uImg;
      }
    }
  }

  logs[s.id] = {
    id: s.id,
    tableId: s.tableId,
    scenarioId: s.scenarioId,
    systemId: s.systemId,
    ownerId: s.ownerId,
    scope: s.scope,
    hasLog: s.hasLog,
    channels,
    players,
    speakerIcons,
    createdAt: new Date((t1 + JST) * 1000).toISOString().slice(0, 19),
    sittings,
    ...(IMPRESSIONS_BY_LOG[s.id] ? { impressions: IMPRESSIONS_BY_LOG[s.id] } : {}),
  };
}

const firstStart = (l: Record<string, unknown>) => (l.sittings as { start: number }[])[0]!.start;

const characters: Record<string, Record<string, unknown>> = {};
for (const [, [id, owner, name, systemId, color, archetype, bio, tags, stats]] of charsDef.entries()) {
  const image = charImageByName[name]!;
  const sessionsStat: {
    logId: string;
    date: string;
    title: string;
    scenarioId?: string;
    rolls: NonNullable<RawMsg["roll"]>[];
    delta: Record<string, { before: number; after: number }>;
    memo: string;
  }[] = [];
  const growth: {
    id: string;
    date: string;
    logId: string;
    skill: string;
    from: number;
    to: number;
  }[] = [];

  Object.values(logs)
    .filter((l) => Boolean(l.hasLog))
    .sort((a, b) => firstStart(a) - firstStart(b))
    .forEach((l) => {
      const playersMap = l.players as Record<string, { linked: boolean; characterIds: string[] }>;
      const p = playersMap[owner];
      if (!p || !p.linked || l.systemId !== systemId || l.ownerId === owner) return;
      const rolls: NonNullable<RawMsg["roll"]>[] = [];
      const chList = l.channels as ReturnType<typeof genMessages>;
      chList.forEach((c) =>
        c.msgs.forEach((m) => {
          if (m.type === "roll" && m.sp === name && m.roll) rolls.push(m.roll);
        }),
      );
      if (rolls.length === 0 && systemId !== "madamis") return;
      const date = new Date((firstStart(l) + JST - 6 * 3600) * 1000).toISOString().slice(0, 10);
      const delta: Record<string, { before: number; after: number }> = {};
      if (systemId === "coc7" && stats.san != null) {
        const prevAfter = sessionsStat.at(-1)?.delta.san?.after ?? stats.san;
        const loss = ri(2, 5);
        delta.san = { before: prevAfter, after: Math.max(15, prevAfter - loss) };
      } else if (systemId === "emoklore" && stats.von != null) {
        delta.von = { before: stats.von, after: Math.max(1, stats.von - 1) };
      } else if (systemId === "sw25" && stats.hp != null) {
        delta.hp = { before: stats.hp, after: Math.max(12, stats.hp - ri(4, 10)) };
      }

      sessionsStat.push({
        logId: String(l.id),
        date,
        title: scenarios.find((sc) => sc.id === l.scenarioId)?.title ?? "",
        scenarioId: l.scenarioId ? String(l.scenarioId) : undefined,
        rolls,
        delta,
        memo: "",
      });

      const okRolls = rolls.filter(
        (r) => r.result === "成功" || r.result === "スペシャル" || r.result === "クリティカル",
      );
      if (okRolls.length && chance(0.6)) {
        const r = pick(okRolls);
        const dayAfter = nextDay(date);
        const from = r.skill === "SANチェック" ? 55 : ri(55, 70);
        growth.push({
          id: `g_${id}_${growth.length}`,
          date: dayAfter,
          logId: String(l.id),
          skill: r.skill === "SANチェック" ? "心理学" : r.skill,
          from,
          to: from + ri(4, 8),
        });
      }
    });

  const finalStats = { ...stats };
  if (systemId === "coc7" && sessionsStat.length) {
    const lastSan = sessionsStat.at(-1)?.delta.san?.after;
    if (lastSan != null) finalStats.san = lastSan;
  }

  sessionsStat.sort((a, b) => b.date.localeCompare(a.date));
  growth.sort((a, b) => b.date.localeCompare(a.date));

  characters[id] = {
    id,
    ownerId: owner,
    name,
    systemId,
    color,
    image,
    archetype,
    bio,
    tags,
    stats: finalStats,
    sessions: sessionsStat,
    growth,
    share: {
      enabled: true,
      scope: "link",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
    import: { source: "CCFOLIA", importedAt: "2026-09-05" },
  };
}

Object.values(logs).forEach((l) => {
  const playersMap = l.players as Record<string, { linked: boolean; characterIds: string[] }>;
  Object.entries(playersMap).forEach(([uid, p]) => {
    if (!p.linked) return;
    if (uid === l.ownerId) {
      p.characterIds = [];
      return;
    }
    const mine = Object.values(characters).filter((c) => c.ownerId === uid && c.systemId === l.systemId);
    p.characterIds = mine.slice(0, 1).map((c) => String(c.id));
  });
});

const events = {
  ev_haikou_1: {
    id: "ev_haikou_1",
    tableId: "t_haikou",
    title: "篠鳴りの宿 事前擦り合わせ・導入",
    status: "confirmed",
    date: "2026-11-21",
    startTime: "21:00",
    endTime: "24:00",
    note: "新規探索者または継続探索者のすり合わせ＋導入まで行います。",
    responses: {
      u_yashimo: "ok",
      u_mikan: "ok",
      u_sora: "ok",
      u_kai: "maybe",
      u_hina: "ok",
    },
    createdBy: "u_yashimo",
  },
  ev_ougonto_1: {
    id: "ev_ougonto_1",
    tableId: "t_ougonto",
    title: "風来の旅路 第二話",
    status: "confirmed",
    date: "2026-11-22",
    startTime: "13:00",
    endTime: "18:00",
    note: "キャラクターはLv3成長済み状態で集合お願いします。",
    responses: {
      u_sasa: "ok",
      u_mikan: "ok",
      u_kai: "ok",
      u_hina: "maybe",
    },
    createdBy: "u_sasa",
  },
  ev_shiosai_1: {
    id: "ev_shiosai_1",
    tableId: "t_shiosai",
    title: "次回キャンペーン打ち上げ＆感想戦",
    status: "confirmed",
    date: "2026-11-28",
    startTime: "21:00",
    endTime: "23:00",
    note: "深淵の呼び声の振り返りと次のシナリオ候補相談。",
    responses: {
      u_mikan: "ok",
      u_sora: "ok",
      u_rin: "ok",
      u_natsu: "ng",
    },
    createdBy: "u_mikan",
  },
  ev_madamis_1: {
    id: "ev_madamis_1",
    tableId: "t_madamis",
    title: "新作マダミス体験卓",
    status: "poll",
    date: "2026-11-27",
    startTime: "20:00",
    endTime: "23:30",
    note: "ハンドアウト事前配布予定。参加しやすい候補日を選択してください。",
    responses: {},
    candidates: [
      {
        id: "c_madamis_1",
        date: "2026-11-27",
        startTime: "20:00",
        endTime: "23:30",
        responses: {
          u_aoi: "ok",
          u_sora: "ok",
          u_mikan: "maybe",
          u_hina: "ok",
        },
      },
      {
        id: "c_madamis_2",
        date: "2026-11-29",
        startTime: "13:30",
        endTime: "17:00",
        responses: {
          u_aoi: "ok",
          u_sora: "maybe",
          u_mikan: "ok",
          u_hina: "ok",
        },
      },
      {
        id: "c_madamis_3",
        date: "2026-12-04",
        startTime: "20:00",
        endTime: "23:30",
        responses: {
          u_aoi: "ok",
          u_sora: "ok",
          u_mikan: "ok",
          u_hina: "ng",
        },
      },
    ],
    createdBy: "u_aoi",
  },
  ev_keizoku_1: {
    id: "ev_keizoku_1",
    tableId: "t_keizoku",
    title: "継続探索者の間 定例卓",
    status: "poll",
    date: "2026-11-29",
    startTime: "21:30",
    endTime: "24:30",
    note: "全員揃いやすい日程を第1希望から確認します。",
    responses: {},
    candidates: [
      {
        id: "c_keizoku_1",
        date: "2026-11-29",
        startTime: "21:30",
        endTime: "24:30",
        responses: {
          u_mikan: "ok",
          u_sora: "ok",
          u_kai: "ok",
          u_rin: "maybe",
          u_hina: "ok",
          u_makoto: "ng",
        },
      },
      {
        id: "c_keizoku_2",
        date: "2026-12-05",
        startTime: "21:30",
        endTime: "24:30",
        responses: {
          u_mikan: "ok",
          u_sora: "ok",
          u_kai: "maybe",
          u_rin: "ok",
          u_hina: "ok",
          u_makoto: "ok",
        },
      },
      {
        id: "c_keizoku_3",
        date: "2026-12-06",
        startTime: "21:00",
        endTime: "24:00",
        responses: {
          u_mikan: "maybe",
          u_sora: "ok",
          u_kai: "ok",
          u_rin: "ok",
          u_hina: "maybe",
          u_makoto: "ok",
        },
      },
    ],
    createdBy: "u_mikan",
  },
};

const usersOut = users.map((u) => ({ ...u, profilePublic: true }));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ users: usersOut, tables, scenarios, logs, characters, events }, null, 1));
console.log(
  `generated.json written: users=${usersOut.length} tables=${tables.length} chars=${Object.keys(characters).length} scenarios=${scenarios.length} logs=${Object.keys(logs).length} events=${Object.keys(events).length}`,
);
