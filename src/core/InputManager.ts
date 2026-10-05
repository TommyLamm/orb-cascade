import { ORB_PHYSICS } from './Constants';

export class InputManager {
  public isAiming = false;
  public aimAngleRad = Math.PI / 2; // 正下方 90 度
  public targetAimAngle = Math.PI / 2;
  public launchRequested = false;
  public hoverPos: { x: number; y: number } = { x: -1, y: -1 };

  // 虛擬握柄位置與阻尼拉力
  public gripPullDistance = 0;

  // 點擊事件監聽（用於按鈕點擊）
  public clickEventQueue: { x: number; y: number }[] = [];

  constructor(
    private canvasElement: HTMLCanvasElement,
    private onFirstGesture: () => void
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    const handleStart = (clientX: number, clientY: number) => {
      this.onFirstGesture();
      const pos = this.toVirtualCoords(clientX, clientY);
      this.hoverPos = pos;

      // 先將點擊座標記錄進佇列
      this.clickEventQueue.push(pos);

      // 若點擊在頂部 HUD 控制區 (y <= 135) 或微調握柄按鈕區，不啟動拖曳發射
      if (pos.y <= 135) {
        return;
      }

      // 微調按鈕檢測：左微調 [250, 160, 48, 36], 右微調 [422, 160, 48, 36]
      if (pos.y >= 148 && pos.y <= 198) {
        if (pos.x >= 240 && pos.x <= 295) {
          this.nudgeAim(-0.02); // 逆時針微調約 1.15 度
          return;
        }
        if (pos.x >= 425 && pos.x <= 480) {
          this.nudgeAim(0.02); // 順時針微調約 1.15 度
          return;
        }
      }

      this.isAiming = true;
      this.updateAim(pos.x, pos.y);
    };

    const handleMove = (clientX: number, clientY: number) => {
      const pos = this.toVirtualCoords(clientX, clientY);
      this.hoverPos = pos;
      if (this.isAiming) {
        this.updateAim(pos.x, pos.y);
      }
    };

    const handleEnd = () => {
      if (this.isAiming) {
        this.isAiming = false;
        this.launchRequested = true;
      }
    };

    // 1. 滑鼠事件
    this.canvasElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) handleStart(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      handleMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      handleEnd();
    });

    // 2. 觸控事件 (增強手機操作流暢度)
    this.canvasElement.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handleStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      handleEnd();
    });
  }

  private toVirtualCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvasElement.getBoundingClientRect();
    const scaleX = ORB_PHYSICS.VIRTUAL_WIDTH / (rect.width || 1);
    const scaleY = ORB_PHYSICS.VIRTUAL_HEIGHT / (rect.height || 1);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private updateAim(virtualX: number, virtualY: number): void {
    const dx = virtualX - ORB_PHYSICS.CANNON_X;
    const dy = virtualY - ORB_PHYSICS.CANNON_Y;

    // 計算指向方向
    let angle = Math.atan2(dy, dx);

    // 限制發射角度：朝下方左右各約 75 度（15° 到 165°）
    const minAngle = (15 * Math.PI) / 180;
    const maxAngle = (165 * Math.PI) / 180;

    if (angle < minAngle) angle = minAngle;
    if (angle > maxAngle) angle = maxAngle;

    this.targetAimAngle = angle;

    // 記錄觸控拉伸阻尼深度 (0 到 150px)
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.gripPullDistance = Math.min(150, Math.max(30, dist));
  }

  // 阻尼更新循環
  public update(dt: number): void {
    // 平滑阻尼插值 (Damping Smooth Interpolation)
    const diff = this.targetAimAngle - this.aimAngleRad;
    const dampingFactor = Math.min(1, dt * 18);
    this.aimAngleRad += diff * dampingFactor;
  }

  // 精細微調按鈕：增加或減少微量發射角度
  public nudgeAim(deltaRad: number): void {
    const minAngle = (15 * Math.PI) / 180;
    const maxAngle = (165 * Math.PI) / 180;
    this.targetAimAngle = Math.max(minAngle, Math.min(maxAngle, this.targetAimAngle + deltaRad));
    this.aimAngleRad = this.targetAimAngle;
  }

  public cancelAim(): void {
    this.isAiming = false;
    this.launchRequested = false;
  }

  public consumeLaunch(): boolean {
    const req = this.launchRequested;
    this.launchRequested = false;
    return req;
  }

  public popClick(): { x: number; y: number } | null {
    if (this.clickEventQueue.length === 0) return null;
    return this.clickEventQueue.shift() || null;
  }
}
