import { ORB_PHYSICS } from '../core/Constants';

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderW: number;
  renderH: number;
}

export class ViewportAdapter {
  public static fitCanvas(
    canvas: HTMLCanvasElement,
    containerWidth: number,
    containerHeight: number
  ): ViewportTransform {
    const targetW = ORB_PHYSICS.VIRTUAL_WIDTH;
    const targetH = ORB_PHYSICS.VIRTUAL_HEIGHT;

    const scale = Math.min(containerWidth / targetW, containerHeight / targetH);
    const renderW = Math.floor(targetW * scale);
    const renderH = Math.floor(targetH * scale);
    const offsetX = Math.floor((containerWidth - renderW) / 2);
    const offsetY = Math.floor((containerHeight - renderH) / 2);

    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.position = 'absolute';
    canvas.style.width = `${renderW}px`;
    canvas.style.height = `${renderH}px`;
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;

    return { scale, offsetX, offsetY, renderW, renderH };
  }
}
