// 임시 캐릭터 10종 (사람 모양 도형). M6에서 실제 그림으로 교체한다.
// 서버는 0~9 번호만 저장하므로, 그림을 바꿔도 데이터는 그대로다.

export const CHARACTER_COUNT = 10;

export const CHARACTER_NAMES = [
  '짧은 머리', '단발', '긴 생머리', '똥머리', '야구모자',
  '곱슬', '앞머리', '안경', '비니', '양갈래',
] as const;

const SKINS = ['#F2C9A0', '#E3B08A', '#C98E66', '#F5D3B3', '#B97C55'];
const HAIR = ['#2A2320', '#4A3426', '#1B1B1F', '#7A4E2D', '#8C8C8C'];
const SHIRTS = ['#4C7BF4', '#E8833A', '#3FA97C', '#C455A8', '#D9B53F', '#5BB8D6', '#8A6FE0', '#E05A6A', '#6E8B3D', '#A0785A'];

function hair(i: number, c: string): string {
  switch (i) {
    case 0: return `<path d="M15 20 Q15 9 28 9 Q41 9 41 20 L41 17 Q36 13 28 13 Q20 13 15 17Z" fill="${c}"/>`;
    case 1: return `<path d="M14 22 Q13 8 28 8 Q43 8 42 22 L42 30 L38 30 L38 18 L18 18 L18 30 L14 30Z" fill="${c}"/>`;
    case 2: return `<path d="M14 22 Q13 8 28 8 Q43 8 42 22 L43 44 L37 44 L38 18 L18 18 L19 44 L13 44Z" fill="${c}"/>`;
    case 3: return `<path d="M15 20 Q15 9 28 9 Q41 9 41 20 Q36 14 28 14 Q20 14 15 20Z" fill="${c}"/><circle cx="28" cy="6" r="5" fill="${c}"/>`;
    case 4: return `<path d="M14 18 Q14 7 28 7 Q42 7 42 18Z" fill="#333A44"/><rect x="26" y="15" width="22" height="4" rx="2" fill="#333A44"/>`;
    case 5: return `<g fill="${c}"><circle cx="18" cy="14" r="5"/><circle cx="24" cy="10" r="5"/><circle cx="31" cy="9" r="5"/><circle cx="38" cy="13" r="5"/><circle cx="15" cy="20" r="4"/><circle cx="41" cy="20" r="4"/></g>`;
    case 6: return `<path d="M14 22 Q14 8 28 8 Q42 8 42 22 L42 18 L14 18Z" fill="${c}"/><path d="M16 18 L40 18 L40 21 L16 21Z" fill="${c}"/>`;
    case 7: return `<path d="M15 20 Q15 9 28 9 Q41 9 41 20 Q36 13 28 13 Q20 13 15 20Z" fill="${c}"/><g fill="none" stroke="#222" stroke-width="1.6"><circle cx="23" cy="22" r="3.6"/><circle cx="33" cy="22" r="3.6"/><path d="M26.6 22 L29.4 22"/></g>`;
    case 8: return '';
    default: return `<path d="M14 22 Q13 8 28 8 Q43 8 42 22 L42 32 L38 32 L38 18 L18 18 L18 32 L14 32Z" fill="${c}"/><rect x="15" y="12" width="26" height="3.5" rx="1.75" fill="#E05A6A"/>`;
  }
}

/** 캐릭터 SVG 문자열. 크기는 56x84 비율. */
export function characterSvg(index: number, scale = 2): string {
  const i = ((index % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT;
  const skin = SKINS[i % SKINS.length];
  const hc = HAIR[(i * 3) % HAIR.length];
  const shirt = SHIRTS[i];
  const eyes = i === 7
    ? '<circle cx="23" cy="22" r="1.2" fill="#222"/><circle cx="33" cy="22" r="1.2" fill="#222"/>'
    : '<circle cx="23.5" cy="22" r="1.6" fill="#222"/><circle cx="32.5" cy="22" r="1.6" fill="#222"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 84" width="${56 * scale}" height="${84 * scale}">`
    + '<ellipse cx="28" cy="80" rx="14" ry="3" fill="rgba(0,0,0,0.12)"/>'
    + '<rect x="20" y="62" width="6" height="17" rx="3" fill="#3B4250"/><rect x="30" y="62" width="6" height="17" rx="3" fill="#3B4250"/>'
    + `<rect x="15" y="36" width="26" height="30" rx="9" fill="${shirt}"/>`
    + `<rect x="10" y="39" width="6" height="20" rx="3" fill="${shirt}"/><rect x="40" y="39" width="6" height="20" rx="3" fill="${shirt}"/>`
    + `<circle cx="28" cy="21" r="13" fill="${skin}"/>${eyes}`
    + '<path d="M24.5 28 Q28 30.5 31.5 28" fill="none" stroke="#7A4A3A" stroke-width="1.4" stroke-linecap="round"/>'
    + hair(i, hc) + '</svg>';
}

export function characterDataUrl(index: number, scale = 2): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(characterSvg(index, scale));
}

/** Phaser 텍스처로 쓰기 위해 10종을 이미지로 미리 읽어 둔다. */
export function loadCharacterImages(scale = 2): Promise<HTMLImageElement[]> {
  return Promise.all(
    Array.from({ length: CHARACTER_COUNT }, (_, i) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = characterDataUrl(i, scale);
    })),
  );
}
