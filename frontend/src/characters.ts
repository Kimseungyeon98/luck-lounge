// 임시 캐릭터 10종 (사람 모양 도형). M6에서 실제 그림으로 교체한다.
// 서버는 0~9 번호만 저장하므로, 그림을 바꿔도 데이터는 그대로다.

export const CHARACTER_COUNT = 10;

export const CHARACTER_NAMES = [
  '짧은 머리', '단발', '긴 생머리', '똥머리', '야구모자',
  '곱슬', '앞머리', '안경', '비니', '양갈래',
] as const;

const SKINS = ['#F6D2B4', '#EDC09A', '#D9A27A', '#F8DCC4', '#C98E66'];
const HAIRS = ['#2A2320', '#5A3A26', '#1B1B1F', '#8A5A32', '#B9B2A8', '#3A2A55', '#6B3A2A', '#232323', '#D9A55B', '#4A3426'];
const TOPS = ['#4C7BF4', '#F08A4B', '#3FA97C', '#D565B0', '#F2C94C', '#5BB8D6', '#8A6FE0', '#E85D6E', '#7FA04A', '#B08A6A'];

/** 머리 모양 (3D 모델 characters3d.ts 와 같은 순서) */
function hair(i: number, c: string): string {
  const cap = `<path d="M8 30 Q8 6 28 6 Q48 6 48 30 Q40 18 28 18 Q16 18 8 30Z" fill="${c}"/>`;
  switch (i) {
    case 0: return cap;
    case 1: return cap + `<path d="M8 28 L8 40 L13 40 L13 26Z M48 28 L48 40 L43 40 L43 26Z" fill="${c}"/>`;
    case 2: return cap + `<path d="M8 28 L7 56 L14 56 L13 26Z M48 28 L49 56 L42 56 L43 26Z" fill="${c}"/>`;
    case 3: return cap + `<circle cx="28" cy="5" r="6" fill="${c}"/>`;
    case 4: return '<path d="M7 26 Q7 5 28 5 Q49 5 49 26Z" fill="#2F6BFF"/><rect x="26" y="22" width="26" height="4" rx="2" fill="#2F6BFF"/>';
    case 5: return `<g fill="${c}"><circle cx="12" cy="20" r="7"/><circle cx="20" cy="11" r="7"/><circle cx="30" cy="8" r="7"/><circle cx="40" cy="12" r="7"/><circle cx="46" cy="21" r="6"/></g>`;
    case 6: return cap + `<rect x="13" y="16" width="30" height="7" rx="3" fill="${c}"/>`;
    case 7: return cap + '<g fill="none" stroke="#2A2A2A" stroke-width="1.8"><circle cx="21" cy="31" r="5"/><circle cx="35" cy="31" r="5"/><path d="M26 31 L30 31"/></g>';
    case 8: return '<path d="M7 26 Q7 4 28 4 Q49 4 49 26Z" fill="#E85D6E"/><rect x="7" y="22" width="42" height="6" rx="3" fill="#C94B5B"/><circle cx="28" cy="4" r="4" fill="#fff"/>';
    default: return cap + `<circle cx="8" cy="26" r="6" fill="${c}"/><circle cx="48" cy="26" r="6" fill="${c}"/><path d="M5 30 L8 46 L11 30Z M51 30 L48 46 L45 30Z" fill="${c}"/>`;
  }
}

/** SD 캐릭터 아이콘 SVG (이어하기 목록 등 작은 자리용). 크기는 56x84 비율. */
export function characterSvg(index: number, scale = 2): string {
  const i = ((index % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT;
  const skin = SKINS[i % SKINS.length];
  const top = TOPS[i];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 84" width="${56 * scale}" height="${84 * scale}">`
    + '<ellipse cx="28" cy="81" rx="13" ry="2.5" fill="rgba(0,0,0,0.12)"/>'
    + '<rect x="20" y="66" width="6" height="10" rx="3" fill="#4A5878"/><rect x="30" y="66" width="6" height="10" rx="3" fill="#4A5878"/>'
    + '<ellipse cx="22" cy="78" rx="6" ry="3.5" fill="#fff" stroke="#D5DCE4"/><ellipse cx="34" cy="78" rx="6" ry="3.5" fill="#fff" stroke="#D5DCE4"/>'
    + `<path d="M16 68 Q16 50 28 50 Q40 50 40 68Z" fill="${top}"/>`
    + `<rect x="11" y="54" width="6" height="11" rx="3" fill="${top}" transform="rotate(20 14 54)"/><rect x="39" y="54" width="6" height="11" rx="3" fill="${top}" transform="rotate(-20 42 54)"/>`
    + `<ellipse cx="28" cy="30" rx="21" ry="20" fill="${skin}"/>`
    + '<ellipse cx="21" cy="32" rx="3.4" ry="4.6" fill="#221C20"/><ellipse cx="35" cy="32" rx="3.4" ry="4.6" fill="#221C20"/>'
    + '<circle cx="22.2" cy="30.2" r="1.2" fill="#fff"/><circle cx="36.2" cy="30.2" r="1.2" fill="#fff"/>'
    + '<ellipse cx="15" cy="38" rx="3.5" ry="2" fill="#FF8A8A" opacity=".5"/><ellipse cx="41" cy="38" rx="3.5" ry="2" fill="#FF8A8A" opacity=".5"/>'
    + '<path d="M25.5 39 Q28 41.5 30.5 39" fill="none" stroke="#8A4A3A" stroke-width="1.4" stroke-linecap="round"/>'
    + hair(i, HAIRS[i]) + '</svg>';
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
