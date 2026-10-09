/** Вписывает общий холст 16:9 в окно, сохраняя пропорции интерфейса и сцены. */
export function fitGameViewport(frame: HTMLElement) {
  const events = new AbortController();
  function resize() {
    const scale = Math.min(innerWidth / frame.offsetWidth, innerHeight / frame.offsetHeight);
    // Диалоги в верхнем слое тоже наследуют масштаб от корня документа.
    document.documentElement.style.setProperty('--game-scale', String(scale));
  }
  window.addEventListener('resize', resize, { signal: events.signal });
  resize();
  return () => events.abort();
}
