// 효과음: 녹음 파일 없이 Web Audio로 만든 소리. 사용자가 화면을 한 번 누른 뒤부터 재생된다 (브라우저 정책).

const KEY = 'luck-lounge:sound';
let ctx: AudioContext | null = null;
let enabled = load();

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    // 이번 접속에서만 적용
  }
  if (v) unlockAudio();
}

/** 화면을 누를 때마다 호출해 오디오를 깨워 둔다 (아이폰은 사용자 동작 안에서만 시작 가능) */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number) {
  if (!enabled || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export const sfx = {
  tick: () => tone(1200, 0.03, 'square', 0.025),
  pass: () => tone(440, 0.07, 'sine', 0.07),
  receive: () => {
    tone(660, 0.09, 'triangle', 0.12);
    setTimeout(() => tone(880, 0.09, 'triangle', 0.12), 90);
  },
  boom: () => {
    if (!enabled || !ctx) return;
    const len = ctx.sampleRate * 0.9;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.value = 0.7;
    src.buffer = buf;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 아이폰 Safari 등 진동을 지원하지 않는 브라우저
  }
}
