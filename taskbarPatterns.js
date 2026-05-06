// ── WCN Taskbar Patterns ──────────────────────────────────────────────────────
// Loaded as a plain script (before ES modules) so WindowControls can reference
// WCN_PATTERNS at runtime without a build step.
//
// WCN_PATTERNS.list
//   Array of { key, label } descriptors for the pattern dropdown.
//
// WCN_PATTERNS.getCSS(key, hexColor, sizePx, bgHexColor)
//   Returns { image, size, position? } for use as CSS background properties.
//   hexColor   — Secondary color ('#rrggbb') — pattern lines / ring highlights
//   sizePx     — Tile size in px (2–64); controls background-size and radii
//   bgHexColor — Primary color ('#rrggbb') — scale body fill (used by seigaiha)

globalThis.WCN_PATTERNS = (() => {

  // ── HSL helpers (used by multi-colour patterns) ──────────────────────────
  function _hexToHSL(hexStr) {
    const r = parseInt(hexStr.slice(1, 3), 16) / 255;
    const g = parseInt(hexStr.slice(3, 5), 16) / 255;
    const b = parseInt(hexStr.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function _hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    if (!s) { const v = Math.round(l * 255); return `rgb(${v},${v},${v})`; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `rgb(${Math.round(f(h + 1/3) * 255)},${Math.round(f(h) * 255)},${Math.round(f(h - 1/3) * 255)})`;
  }

  // ── Dragon Scale SVG template (fill colour injected at runtime) ──────────
  // Paths use WCNFILL as placeholder — replaced with Secondary hex before encoding.
  const _DS_SVG_TPL =
    `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="75">` +
    `<path d="M0 0 C1.98 0 3.96 0 6 0 C6.08636719 0.556875 6.17273438 1.11375 6.26171875 1.6875 C8.10034315 11.67342332 12.93051359 17.96316831 21 24 C22.28620239 24.45632812 22.28620239 24.45632812 23.59838867 24.921875 C26 27 26 27 26.43887329 29.12541199 C26.58137285 32.02669148 26.56072603 34.88900036 26.48828125 37.79296875 C26.48120651 38.85413406 26.47413177 39.91529938 26.46684265 41.00862122 C26.43882466 44.40229403 26.37606956 47.7943248 26.3125 51.1875 C26.28742684 53.48630432 26.26461197 55.78513447 26.24414062 58.08398438 C26.1889739 63.72321774 26.10527355 69.36149159 26 75 C25.34 75 24.68 75 24 75 C23.34 68.73 22.68 62.46 22 56 C19.97461735 55.82085828 19.97461735 55.82085828 18.44921875 56.98828125 C16.2222316 60.07965155 16.16381993 63.49702915 15.8125 67.1875 C15.73064453 67.93708984 15.64878906 68.68667969 15.56445312 69.45898438 C15.36459216 71.30475918 15.18073462 73.15225433 15 75 C14.01 75 13.02 75 12 75 C11.67 71.37 11.34 67.74 11 64 C8.3549963 64.91783124 8.3549963 64.91783124 6 67 C5.53162101 69.79374292 5.76575495 72.14221036 6 75 C4.02 75 2.04 75 0 75 C0.103125 73.741875 0.20625 72.48375 0.3125 71.1875 C0.39581568 69.00858677 0.39581568 69.00858677 0 67 C-2.3549963 64.91783124 -2.3549963 64.91783124 -5 64 C-5.33 67.63 -5.66 71.26 -6 75 C-6.99 75 -7.98 75 -9 75 C-9.09796875 73.89140625 -9.1959375 72.7828125 -9.296875 71.640625 C-9.4469916 70.17698816 -9.59808465 68.71345124 -9.75 67.25 C-9.811875 66.52039063 -9.87375 65.79078125 -9.9375 65.0390625 C-10.3310746 61.43129537 -10.74002556 59.3147059 -13.078125 56.484375 C-13.71234375 55.99453125 -14.3465625 55.5046875 -15 55 C-16.53701881 56.53701881 -16.32298725 58.11807163 -16.53515625 60.25390625 C-16.62216797 61.10791016 -16.70917969 61.96191406 -16.79882812 62.84179688 C-16.9293457 64.18854492 -16.9293457 64.18854492 -17.0625 65.5625 C-17.19881836 66.91504883 -17.19881836 66.91504883 -17.33789062 68.29492188 C-17.56253923 70.52958434 -17.78305769 72.76457839 -18 75 C-18.66 75 -19.32 75 -20 75 C-20.25424062 68.29306333 -20.42894142 61.5873735 -20.54931641 54.87670898 C-20.59950674 52.5959633 -20.66767853 50.31553783 -20.75439453 48.03588867 C-20.87619021 44.7509877 -20.93250227 41.47034573 -20.9765625 38.18359375 C-21.02817535 37.16978134 -21.07978821 36.15596893 -21.13296509 35.11143494 C-21.13533292 32.10045417 -21.0106237 29.84134139 -20 27 C-17.65645836 24.70555518 -15.32474036 23.11854586 -12.48886108 21.47987366 C-6.50107202 17.91954184 -3.24088329 12.48676742 -1 6 C-0.60235737 4.01178687 -0.24544834 2.01267638 0 0 Z M0 14 C-1.04755745 15.14576596 -2.03809717 16.3439356 -3 17.5625 C-3.53625 18.22378906 -4.0725 18.88507812 -4.625 19.56640625 C-7.66894182 24.95383737 -7.13421127 31.40823727 -7.0625 37.4375 C-7.05798828 38.16904297 -7.05347656 38.90058594 -7.04882812 39.65429688 C-7.03718148 41.43623419 -7.01925191 43.21812863 -7 45 C-8.84566532 41.01606389 -9.36022829 37.55623317 -9.625 33.1875 C-9.69976563 32.02605469 -9.77453125 30.86460938 -9.8515625 29.66796875 C-9.90054687 28.78753906 -9.94953125 27.90710937 -10 27 C-13.79547921 27.96776098 -13.79547921 27.96776098 -17 30 C-17.84457427 37.62885943 -16.99557428 44.383329 -13 51 C-8.97027234 55.93201963 -4.26691045 61.1895592 2 63 C8.89166174 62.1010876 13.7347226 56.38772482 18.3125 51.5625 C22.64430911 44.98456765 24.42894745 37.8722014 23 30 C20.54305747 27.73702662 19.3203746 27 16 27 C15.95101562 27.89203125 15.90203125 28.7840625 15.8515625 29.703125 C15.77679688 30.87359375 15.70203125 32.0440625 15.625 33.25 C15.55539063 34.41015625 15.48578125 35.5703125 15.4140625 36.765625 C15.03751692 39.70694334 14.5225877 41.49949011 13 44 C13.01160156 42.99839844 13.02320312 41.99679688 13.03515625 40.96484375 C13.04454398 39.62239772 13.05364312 38.27994964 13.0625 36.9375 C13.07410156 35.62652344 13.08570312 34.31554687 13.09765625 32.96484375 C12.87890268 24.0834488 11.19011575 20.15474366 5 14 C4.17538604 27.01712039 3.87631141 39.95772483 4 53 C3.34 53 2.68 53 2 53 C2.01160156 51.77667969 2.02320312 50.55335937 2.03515625 49.29296875 C2.11065902 37.4909414 1.7461049 25.77779876 1 14 C0.67 14 0.34 14 0 14 Z" fill="WCNFILL" transform="translate(20,0)"/>` +
    `<path d="M0 0 C0.66 0 1.32 0 2 0 C2 4.95 2 9.9 2 15 C1.67 15 1.34 15 1 15 C-0.32286246 10.03926578 -0.08893197 5.08888488 0 0 Z" fill="WCNFILL" transform="translate(44,0)"/>` +
    `<path d="M0 0 C0.66 0 1.32 0 2 0 C2.18451025 10.55808656 2.18451025 10.55808656 1 15 C0.67 15 0.34 15 0 15 C0 10.05 0 5.1 0 0 Z" fill="WCNFILL" transform="translate(0,0)"/>` +
    `<path d="M0 0 C0.99 0 1.98 0 3 0 C3.33 3.3 3.66 6.6 4 10 C1.07490914 6.09987886 0.52464905 4.61691161 0 0 Z" fill="WCNFILL" transform="translate(32,0)"/>` +
    `<path d="M0 0 C0.99 0 1.98 0 3 0 C2.47535095 4.61691161 1.92509086 6.09987886 -1 10 C-0.67 6.7 -0.34 3.4 0 0 Z" fill="WCNFILL" transform="translate(11,0)"/>` +
    `</svg>`;

  function _dragonScaleDataURI(fillHex) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(_DS_SVG_TPL.replace(/WCNFILL/g, fillHex)) + '")';
  }

  const list = [
    { key: 'none',       label: 'None'         },
    { key: 'diagonal',   label: 'Diagonal'     },
    { key: 'diagonal-3', label: 'Diagonal v2'  },
    { key: 'zigzag',     label: 'ZigZag'       },
    { key: 'polka-2',    label: 'Dots'         },
    { key: 'circles',    label: 'Circles'      },
    { key: 'lines',      label: 'Lines'        },
    { key: 'lines-v2',   label: 'Lines v2'     },
    { key: 'boxes',      label: 'Boxes'        },
    { key: 'cross',      label: 'Boxes v2'     },
    { key: 'rhombus',    label: 'Checkers'     },
    { key: 'herringbone',  label: 'Herringbone'   },
    { key: 'seigaiha',    label: 'Seigaiha'      },
    { key: 'dragonscale', label: 'Dragon Scale'   },
  ];

  function getCSS(key, hexColor, sizePx, bgHexColor) {
    const s = Math.max(2, Math.min(64, sizePx || 4));
    const h = s / 2;

    // Secondary color — pattern lines / ring highlights.
    const hex = /^#[0-9a-f]{6}$/i.test(hexColor) ? hexColor : '#000000';
    const rr = parseInt(hex.slice(1, 3), 16);
    const gg = parseInt(hex.slice(3, 5), 16);
    const bb = parseInt(hex.slice(5, 7), 16);
    const c  = `rgb(${rr},${gg},${bb})`;

    // Primary color — used as scale body fill by seigaiha.
    const bghex = /^#[0-9a-f]{6}$/i.test(bgHexColor) ? bgHexColor : '#808080';
    const br   = parseInt(bghex.slice(1, 3), 16);
    const bg_g = parseInt(bghex.slice(3, 5), 16);
    const bgb  = parseInt(bghex.slice(5, 7), 16);
    const bg   = `rgb(${br},${bg_g},${bgb})`;

    switch (key) {
      case 'none':
        return { image: 'none', size: `${s}px ${s}px` };

      case 'diagonal':
        return {
          image: `linear-gradient(45deg, transparent 49%, ${c} 49%, ${c} 51%, transparent 51%), `
               + `linear-gradient(-45deg, transparent 49%, ${c} 49%, ${c} 51%, transparent 51%)`,
          size: `${s}px ${s}px`,
        };

      case 'diagonal-3':
        return {
          image: `repeating-linear-gradient(45deg, transparent, transparent ${h}px, ${c} ${h}px, ${c} ${s}px)`,
          size: `${s}px ${s}px`,
        };

      case 'zigzag':
        return {
          image: `linear-gradient(135deg, ${c} 25%, transparent 25%), `
               + `linear-gradient(225deg, ${c} 25%, transparent 25%), `
               + `linear-gradient(315deg, ${c} 25%, transparent 25%), `
               + `linear-gradient(45deg, ${c} 25%, transparent 25%)`,
          size: `${s}px ${h}px`,
          position: `${-h}px 0, ${-h}px 0, 0 0, 0 0`,
        };

      case 'polka-2': {
        const pr = Math.max(1, Math.round(s * 0.15));
        return {
          image: `radial-gradient(circle, ${c} ${pr}px, transparent ${pr}px), `
               + `radial-gradient(circle, ${c} ${pr}px, transparent ${pr}px)`,
          size: `${s}px ${s}px`,
          position: `0 0, ${h}px ${h}px`,
        };
      }

      case 'circles': {
        const r1 = Math.max(1, Math.round(s * 0.3));
        const r2 = Math.max(2, Math.round(s * 0.38));
        return {
          image: `radial-gradient(circle, transparent ${r1}px, ${c} ${r1}px, ${c} ${r2}px, transparent ${r2}px)`,
          size: `${s}px ${s}px`,
        };
      }

      case 'lines':
        return {
          image: `repeating-linear-gradient(0deg, ${c}, ${c} 1px, transparent 1px, transparent ${s}px)`,
          size: `${s}px ${s}px`,
        };

      case 'lines-v2':
        return {
          image: `repeating-linear-gradient(90deg, ${c}, ${c} 1px, transparent 1px, transparent ${s}px)`,
          size: `${s}px ${s}px`,
        };

      case 'boxes':
        return {
          image: `linear-gradient(${c} 1px, transparent 1px), `
               + `linear-gradient(90deg, ${c} 1px, transparent 1px)`,
          size: `${s}px ${s}px`,
        };

      case 'cross': {
        const t   = Math.max(1, Math.round(s * 0.15));
        const off = Math.round((s - t) / 2);
        return {
          image: `linear-gradient(${c} 0, ${c} ${t}px, transparent ${t}px), `
               + `linear-gradient(90deg, ${c} 0, ${c} ${t}px, transparent ${t}px)`,
          size: `${s}px ${s}px`,
          position: `${off}px 0, 0 ${off}px`,
        };
      }

      case 'rhombus':
        return {
          image: `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%), `
               + `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`,
          size: `${s}px ${s}px`,
          position: `0 0, ${h}px ${h}px`,
        };

      case 'seigaiha':
        // bg = Primary (scale body fill), c = Secondary (ring/highlight lines)
        return {
          image: [
            `radial-gradient(circle at 100% 150%, ${bg} 25%, ${c} 25%, ${c} 29%, ${bg} 29%, ${bg} 36%, ${c} 36%, ${c} 40%, transparent 40%, transparent)`,
            `radial-gradient(circle at 0 150%, ${bg} 25%, ${c} 25%, ${c} 29%, ${bg} 29%, ${bg} 36%, ${c} 36%, ${c} 40%, transparent 40%, transparent)`,
            `radial-gradient(circle at 50% 100%, ${c} 10%, ${bg} 10%, ${bg} 23%, ${c} 23%, ${c} 30%, ${bg} 30%, ${bg} 43%, ${c} 43%, ${c} 50%, ${bg} 50%, ${bg} 63%, ${c} 63%, ${c} 70%, transparent 70%, transparent)`,
            `radial-gradient(circle at 100% 50%, ${c} 5%, ${bg} 5%, ${bg} 15%, ${c} 15%, ${c} 20%, ${bg} 20%, ${bg} 30%, ${c} 30%, ${c} 35%, ${bg} 35%, ${bg} 45%, ${c} 45%, ${c} 50%, transparent 50%, transparent)`,
            `radial-gradient(circle at 0 50%, ${c} 5%, ${bg} 5%, ${bg} 15%, ${c} 15%, ${c} 20%, ${bg} 20%, ${bg} 30%, ${c} 30%, ${c} 35%, ${bg} 35%, ${bg} 45%, ${c} 45%, ${c} 50%, transparent 50%, transparent)`,
          ].join(', '),
          size: `${s}px ${h}px`,
        };

      case 'herringbone': {
        // Tile size is scaled up so the stripes are visible at default spacing.
        const ts = Math.max(Math.round(s * 3), 24);
        // Secondary → 3 shades used in arm 1 AND the tail of arm 2.
        const [hs, ss, ls] = _hexToHSL(hex);
        const c1l = _hslToRgb(hs, ss, Math.min(95, ls + 20));
        const c1m = _hslToRgb(hs, ss, ls);
        const c1d = _hslToRgb(hs, ss, Math.max(5, ls - 20));
        // Primary → 3 shades for the leading bands of arm 2.
        const [hb, sb, lb] = _hexToHSL(bghex);
        const c2l = _hslToRgb(hb, sb, Math.min(95, lb + 20));
        const c2m = _hslToRgb(hb, sb, lb);
        const c2d = _hslToRgb(hb, sb, Math.max(5, lb - 20));
        // Separator: dark tint derived from Secondary hue/saturation.
        const sep = _hslToRgb(hs, ss, Math.max(5, ls * 0.2 + 5));
        const S = (col, a, b) => `${col} ${a}%, ${col} ${b}%`;

        // ── Two separate stop lists so arm 1 layers sit ABOVE arm 2 layers ────────
        // Arm 1 (0-25%): 3 Secondary bands × 7%, 4 separators × 1.143%.
        const arm1 = [
          S(sep, 0, 0.5),
          S(c1l, 0.5, 7.6),
          S(sep, 7.6, 8.643),
          S(c1m, 8.643, 15.643),
          S(sep, 15.643, 16.886),
          S(c1d, 16.886, 23.843),
          S(sep, 23.843, 25),
          `transparent 25%`,
        ].join(', ');

        // Arm 2 (25-75%): picks up immediately where arm1 ends — no transparent gap.
        // 7 separators × 1.143% + 6 bands × 7% = 50% total, landing exactly on 75%.
        const arm2 = [
          `transparent 25%`,
          S(sep,  25.000, 26.143),
          S(c2l,  26.143, 33.143),
          S(sep,  33.143, 34.286),
          S(c2m,  34.286, 41.286),
          S(sep,  41.286, 42.429),
          S(c2d,  42.429, 49.429),
          S(sep,  49.429, 50.571),
          S(c1l,  50.571, 57.571),
          S(sep,  57.571, 58.714),
          S(c1m,  58.714, 65.714),
          S(sep,  65.714, 66.857),
          S(c1d,  66.857, 73.857),
          S(sep,  73.857, 75),
          `transparent 75%`,
        ].join(', ');

        // 135 / 225 deg = ∨-pointing chevrons (inverted vs. standard 45/-45).
        // Arm 1 pair listed first → higher z-order → correctly occludes arm 2.
        return {
          image: [
            `linear-gradient(135deg, ${arm1})`,
            `linear-gradient(225deg, ${arm1})`,
            `linear-gradient(135deg, ${arm2})`,
            `linear-gradient(225deg, ${arm2})`,
          ].join(', '),
          size: `${ts}px ${ts}px`,
          position: '0 0',
        };
      }

      case 'dragonscale': {
        // SVG tile is 46×75px. Color is injected by replacing WCNFILL with Secondary hex.
        // Returns a normal { image, size } — no special handling needed downstream.
        const scale = s / 46;
        const tw = Math.round(46 * scale);
        const th = Math.round(75 * scale);
        return {
          image: _dragonScaleDataURI(hex),
          size: `${tw}px ${th}px`,
        };
      }

      default:
        return null;
    }
  }

  return { list, getCSS };

})();
