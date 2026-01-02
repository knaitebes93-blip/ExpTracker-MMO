let startX = 0;
let startY = 0;
let startClientX = 0;
let startClientY = 0;
let selecting = false;

const selectionBox = document.getElementById('selection-box') as HTMLDivElement;

function updateBox(x: number, y: number, width: number, height: number) {
  if (!selectionBox) return;
  selectionBox.style.display = 'block';
  selectionBox.style.left = `${Math.min(x, x + width)}px`;
  selectionBox.style.top = `${Math.min(y, y + height)}px`;
  selectionBox.style.width = `${Math.abs(width)}px`;
  selectionBox.style.height = `${Math.abs(height)}px`;
}

function finishSelection(endX: number, endY: number, endClientX: number, endClientY: number) {
  if (!window.regionSelector || !selectionBox) return;
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < 5 || height < 5) {
    window.regionSelector.cancel();
    return;
  }

  window.regionSelector.submit({ x, y, width, height });
}

document.addEventListener('mousedown', (e) => {
  selecting = true;
  startX = e.screenX;
  startY = e.screenY;
  startClientX = e.clientX;
  startClientY = e.clientY;
  updateBox(startClientX, startClientY, 0, 0);
});

document.addEventListener('mousemove', (e) => {
  if (!selecting) return;
  updateBox(startClientX, startClientY, e.clientX - startClientX, e.clientY - startClientY);
});

document.addEventListener('mouseup', (e) => {
  if (!selecting) return;
  selecting = false;
  finishSelection(e.screenX, e.screenY, e.clientX, e.clientY);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.regionSelector?.cancel();
  }
});
