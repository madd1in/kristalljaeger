// Tastatur + virtueller Joystick. Liefert einen analogen Bewegungsvektor (Länge 0..1).

const DEADZONE = 0.12;

export class Input {
  constructor({ onKey }) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.boostQueued = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.boostQueued = true;
      onKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.resetJoystick?.();
    });
  }

  bindTouch({ zone, base, knob, boost, radius = 56 }) {
    let pointerId = null;
    let originX = 0;
    let originY = 0;

    const moveKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    this.resetJoystick = () => {
      pointerId = null;
      this.joy.x = 0;
      this.joy.y = 0;
      moveKnob(0, 0);
      base.classList.remove('active');
      base.style.left = '';
      base.style.top = '';
    };

    zone.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      originX = e.clientX;
      originY = e.clientY;
      base.style.left = `${originX}px`;
      base.style.top = `${originY}px`;
      base.classList.add('active');
      moveKnob(0, 0);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      let dx = e.clientX - originX;
      let dy = e.clientY - originY;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx *= radius / len;
        dy *= radius / len;
      }
      this.joy.x = dx / radius;
      this.joy.y = dy / radius;
      moveKnob(dx, dy);
    });
    const end = (e) => { if (e.pointerId === pointerId) this.resetJoystick(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);

    boost.addEventListener('pointerdown', (e) => {
      this.boostQueued = true;
      boost.classList.add('pressed');
      e.preventDefault();
    });
    const release = () => boost.classList.remove('pressed');
    boost.addEventListener('pointerup', release);
    boost.addEventListener('pointercancel', release);
    boost.addEventListener('pointerleave', release);
  }

  move(out) {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const keyLen = Math.hypot(x, z);
    if (keyLen > 0) {
      x /= keyLen;
      z /= keyLen;
    }
    const joyLen = Math.hypot(this.joy.x, this.joy.y);
    if (joyLen > DEADZONE) {
      const scale = Math.min(1, (joyLen - DEADZONE) / (1 - DEADZONE)) / joyLen;
      x += this.joy.x * scale;
      z += this.joy.y * scale;
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return out.set(x, 0, z);
  }

  consumeBoost() {
    const queued = this.boostQueued;
    this.boostQueued = false;
    return queued;
  }
}
