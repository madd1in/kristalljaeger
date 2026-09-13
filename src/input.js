// Tastatur, virtueller Joystick und Gamepad. Liefert einen analogen Bewegungsvektor (Länge 0..1).

const DEADZONE = 0.12;
const PAD_DEADZONE = 0.2;
// Standard-Mapping (Xbox/PlayStation): A/Kreuz, B/Kreis, LB, RB, LT, RT, Start, Steuerkreuz
const PAD_BUTTONS = { a: 0, b: 1, lb: 4, rb: 5, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };

export class Input {
  constructor({ onKey }) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.pad = { x: 0, y: 0, connected: false };
    this.padPrev = {};
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

  // Einmal pro Frame aufrufen; onButton bekommt neu gedrückte Tasten ('a', 'start', 'up', …)
  pollGamepad(onButton) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    this.pad.connected = Boolean(pad);
    if (!pad) {
      this.pad.x = 0;
      this.pad.y = 0;
      this.padPrev = {};
      return;
    }
    const pressed = {};
    for (const [name, index] of Object.entries(PAD_BUTTONS)) pressed[name] = Boolean(pad.buttons[index]?.pressed);
    const axis = (v) => (Math.abs(v) < PAD_DEADZONE ? 0 : v);
    let x = axis(pad.axes[0] || 0);
    let y = axis(pad.axes[1] || 0);
    if (pressed.left) x = -1;
    if (pressed.right) x = 1;
    if (pressed.up) y = -1;
    if (pressed.down) y = 1;
    this.pad.x = x;
    this.pad.y = y;
    for (const name of Object.keys(PAD_BUTTONS)) {
      if (pressed[name] && !this.padPrev[name]) onButton(name);
    }
    this.padPrev = pressed;
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
    x += this.pad.x;
    z += this.pad.y;
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
