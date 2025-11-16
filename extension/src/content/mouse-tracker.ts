// Mouse position tracker for content proximity detection

export class MouseTracker {
  private currentX: number = 0;
  private currentY: number = 0;
  private isTracking: boolean = false;

  start() {
    if (this.isTracking) return;

    this.isTracking = true;
    document.addEventListener('mousemove', this.handleMouseMove);
    console.log('[MOUSE] 🟢 Tracking started');
  }

  stop() {
    this.isTracking = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    console.log('[MOUSE] 🔴 Tracking stopped');
  }

  private handleMouseMove = (e: MouseEvent) => {
    this.currentX = e.clientX;
    this.currentY = e.clientY;
  };

  getPosition(): { x: number; y: number } {
    return {
      x: this.currentX,
      y: this.currentY
    };
  }

  isActive(): boolean {
    return this.isTracking;
  }
}

// Export singleton instance
export const mouseTracker = new MouseTracker();
