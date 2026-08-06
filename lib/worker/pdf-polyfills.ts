/**
 * Browser geometry globals that pdfjs-dist's legacy build expects in Node
 * (it attempts its own polyfill via @napi-rs/canvas and warns otherwise).
 * Vercel's Lambda runtime can reference DOMMatrix at module evaluation, so
 * install minimal stubs BEFORE pdfjs loads. Text extraction never renders,
 * so the math only needs to be structurally correct.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

class DOMMatrixStub {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: string | number[]) {
    if (typeof init === "string") {
      const m = init.match(/[+-]?\d*\.?\d+(?:e[+-]?\d+)?/gi);
      if (m && m.length >= 6) {
        const [a, b, c, d, e, f] = m.slice(0, 6).map(Number);
        this.set(a, b, c, d, e, f);
      }
    } else if (Array.isArray(init) && init.length >= 6) {
      this.set(init[0], init[1], init[2], init[3], init[4], init[5]);
    }
  }

  set(a: number, b: number, c: number, d: number, e: number, f: number): this {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  translate(tx = 0, ty = 0): DOMMatrixStub {
    return new DOMMatrixStub([
      this.a, this.b, this.c, this.d,
      this.e + this.a * tx + this.c * ty,
      this.f + this.b * tx + this.d * ty,
    ]);
  }

  scale(sx = 1, sy = sx): DOMMatrixStub {
    return new DOMMatrixStub([this.a * sx, this.b * sy, this.c * sx, this.d * sy, this.e, this.f]);
  }

  multiply(other: DOMMatrixStub): DOMMatrixStub {
    const a = this.a * other.a + this.c * other.b;
    const b = this.b * other.a + this.d * other.b;
    const c = this.a * other.c + this.c * other.d;
    const d = this.b * other.c + this.d * other.d;
    const e = this.a * other.e + this.c * other.f + this.e;
    const f = this.b * other.e + this.d * other.f + this.f;
    return new DOMMatrixStub([a, b, c, d, e, f]);
  }

  inverse(): DOMMatrixStub {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return new DOMMatrixStub();
    const inv = 1 / det;
    return new DOMMatrixStub([
      this.d * inv,
      -this.b * inv,
      -this.c * inv,
      this.a * inv,
      (this.c * this.f - this.d * this.e) * inv,
      (this.b * this.e - this.a * this.f) * inv,
    ]);
  }

  transformPoint(p: { x: number; y: number }) {
    return {
      x: this.a * p.x + this.c * p.y + this.e,
      y: this.b * p.x + this.d * p.y + this.f,
    };
  }
}

class Path2DStub {
  constructor() {
    /* no-op — only used for canvas rendering, which never happens here */
  }
}

const g = globalThis as any;
if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = DOMMatrixStub;
if (typeof g.Path2D === "undefined") g.Path2D = Path2DStub;
