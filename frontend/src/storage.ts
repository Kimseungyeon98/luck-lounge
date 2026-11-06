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
