// 기기 토큰은 팀별로 이 브라우저에만 저장한다. 사생활 보호 모드 등에서 저장소가 막혀도 동작은 하게 한다.
const key = (slug: string) => `luck-lounge:token:${slug}`;

export function loadToken(slug: string): string | null {
  try {
    return localStorage.getItem(key(slug));
  } catch {
    return null;
  }
}

export function saveToken(slug: string, token: string): void {
  try {
    localStorage.setItem(key(slug), token);
  } catch {
    // 저장이 안 되면 다음 접속 때 이어하기로 들어오면 된다.
  }
}

export function clearToken(slug: string): void {
  try {
    localStorage.removeItem(key(slug));
  } catch {
    // 무시
  }
}

// ---------- 방 (M9: 고정 주소 + 방 코드) ----------
export interface SavedRoom { slug: string; code: string; name: string }
const LAST_ROOM = 'luck-lounge:last-room';
const CURRENT_ROOM = 'luck-lounge:current-room';
const DEVICE_KEY = 'luck-lounge:device-key';

/** 이 휴대폰이 마지막으로 들어간 방 (첫 화면 "최근 방" 카드) */
export function loadLastRoom(): SavedRoom | null {
  try {
    const r = JSON.parse(localStorage.getItem(LAST_ROOM) ?? 'null') as SavedRoom | null;
    return r && typeof r.slug === 'string' && typeof r.code === 'string' && typeof r.name === 'string' ? r : null;
  } catch {
    return null;
  }
}

export function saveLastRoom(r: SavedRoom): void {
  try {
    localStorage.setItem(LAST_ROOM, JSON.stringify({ slug: r.slug, code: r.code, name: r.name }));
  } catch {
    // 무시
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM);
  } catch {
    // 무시
  }
}

/** 지금 이 탭에서 들어가 있는 방. 새로고침하면 첫 화면을 건너뛰고 바로 그 방으로 */
export function loadCurrentRoom(): string | null {
  try {
    return sessionStorage.getItem(CURRENT_ROOM);
  } catch {
    return null;
  }
}

export function saveCurrentRoom(slug: string | null): void {
  try {
    if (slug) sessionStorage.setItem(CURRENT_ROOM, slug);
    else sessionStorage.removeItem(CURRENT_ROOM);
  } catch {
    // 무시
  }
}

/** 방 만들기 하루 제한에 쓰는 이 브라우저의 무작위 열쇠 (서버에는 해시만 남는다) */
export function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY);
    if (!k) {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, k);
    }
    return k;
  } catch {
    // 저장이 막힌 브라우저: 이번 접속에서만 쓰는 열쇠
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
