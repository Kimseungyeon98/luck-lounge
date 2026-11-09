/**
 * 아래에서 올라오는 창(설정, 방장 메뉴, 통계)을 여닫는 공용 처리.
 * - 뒤를 어둡게 하고, 바깥을 누르거나 Esc 를 누르면 닫힌다
 * - 열리면 창 안 첫 버튼으로 초점을 옮기고, 닫으면 창을 연 버튼으로 돌려준다
 * - 한 번에 하나만 열린다
 */
let backdrop: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
let opener: HTMLElement | null = null;
const onClose = new WeakMap<HTMLElement, () => void>();

function ensureBackdrop(): HTMLDivElement {
  if (backdrop) return backdrop;
  backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.hidden = true;
  backdrop.addEventListener('click', () => closeSheet());
  document.body.append(backdrop);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) closeSheet();
  });
  return backdrop;
}

export function openSheet(sheet: HTMLElement, whenClosed?: () => void) {
  const bd = ensureBackdrop();
  if (current && current !== sheet) closeSheet();
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  current = sheet;
  if (whenClosed) onClose.set(sheet, whenClosed);
  sheet.setAttribute('aria-modal', 'true');
  // 창과 같은 부모에 두어야 겹침 순서가 맞는다 (대기실 표시줄은 position: fixed 라 따로 쌓인다)
  sheet.parentElement?.insertBefore(bd, sheet);
  sheet.hidden = false;
  bd.hidden = false;
  const first = sheet.querySelector<HTMLElement>('button:not([disabled]), input, [tabindex="0"]');
  first?.focus({ preventScroll: true });
}

export function closeSheet(sheet?: HTMLElement) {
  if (!current || (sheet && sheet !== current)) {
    if (sheet) sheet.hidden = true;
    return;
  }
  const closing = current;
  closing.hidden = true;
  current = null;
  if (backdrop) backdrop.hidden = true;
  onClose.get(closing)?.();
  opener?.focus({ preventScroll: true });
  opener = null;
}
