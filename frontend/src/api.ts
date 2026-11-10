/** 방(팀). slug 는 내부 열쇠, code 는 사람이 입력하는 6자리 방 코드 */
export interface Team { slug: string; code: string; name: string }
export interface PlayerView { playerId: string; nickname: string; characterIndex: number }
export interface Joined extends PlayerView { token: string }

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T | null> {
  const headers = new Headers(init.headers);
  if (token) headers.set('X-Device-Token', token);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? '잠시 후 다시 시도해 주세요.');
  }
  return body as T;
}

const base = (slug: string) => `/api/teams/${encodeURIComponent(slug)}`;

export const api = {
  team: (slug: string) => request<Team>(base(slug)) as Promise<Team>,
  findRoom: (code: string) => request<Team>(`/api/rooms/${encodeURIComponent(code)}`) as Promise<Team>,
  createRoom: (name: string, deviceKey: string) =>
    request<Team>('/api/rooms', { method: 'POST', body: JSON.stringify({ name }), headers: { 'X-Device-Key': deviceKey } }) as Promise<Team>,
  me: (slug: string, token: string | null) => request<PlayerView>(`${base(slug)}/me`, {}, token),
  players: (slug: string) => request<PlayerView[]>(`${base(slug)}/players`) as Promise<PlayerView[]>,
  join: (slug: string, token: string | null, body: { nickname: string; characterIndex: number; resumePlayerId: string | null }) =>
    request<Joined>(`${base(slug)}/join`, { method: 'POST', body: JSON.stringify(body) }, token) as Promise<Joined>,
};
