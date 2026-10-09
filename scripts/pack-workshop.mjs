import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  House,
  Plus,
  Save,
  Upload,
  Download,
  Undo2,
  Redo2,
  Move3d,
  Rotate3d,
  Scaling,
  Copy,
  Trash2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Scan,
  Search,
  X,
} from 'lucide-react';
export async function packWorkshop(root) {
  const components = {
    back: ArrowLeft,
    next: ArrowRight,
    box: Box,
    house: House,
    plus: Plus,
    save: Save,
    upload: Upload,
    download: Download,
    undo: Undo2,
    redo: Redo2,
    move: Move3d,
    rotate: Rotate3d,
    scale: Scaling,
    copy: Copy,
    delete: Trash2,
    reset: RotateCcw,
    right: RotateCw,
    zoomIn: ZoomIn,
    zoomOut: ZoomOut,
    fit: Scan,
    search: Search,
    close: X,
  };
  const icons = Object.fromEntries(
    Object.entries(components).map(([key, component]) => [
      key,
      renderToStaticMarkup(
        createElement(component, {
          size: 18,
          strokeWidth: 1.7,
          'aria-hidden': true,
          focusable: false,
        }),
      ),
    ]),
  );
  await writeFile(path.join(root, '.generated/workshop-icons.json'), JSON.stringify(icons));
}
