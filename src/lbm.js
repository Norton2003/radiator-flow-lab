// D2Q9 lattice Boltzmann (BGK + Smagorinsky) through a 2-bank louvered fin array, periodic across fin pitch.
// Passive temperature field advected semi-Lagrangian, louvers held at T=1, inlet air at T=0.
const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1], EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const WQ = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
class LouverSim {
  constructor() { this.cfg = null; }
  build(c) {
    // c: {theta, fpr (Fp/Lp), re, n (louvers per bank), lpc (cells per louver pitch), pitches, tr (fin thickness/Lp)}
    this.cfg = { ...c };
    const L = c.lpc, Fpc = Math.max(10, Math.round(c.fpr * L));
    const pitches = c.pitches || 4;
    const NY = Fpc * pitches;
    const xs = Math.round(3.2 * L);
    const runLen = L * (2 * c.n + 3.4);
    const NX = Math.round(xs + runLen + 7 * L);
    Object.assign(this, { NX, NY, Fpc, L, xs });
    const N = NX * NY;
    this.N = N;
    this.f = new Float32Array(9 * N); this.g = new Float32Array(9 * N);
    this.solid = new Uint8Array(N);
    this.ux = new Float32Array(N); this.uy = new Float32Array(N); this.rho = new Float32Array(N);
    this.T = new Float32Array(N); this.T2 = new Float32Array(N); this.vort = new Float32Array(N);
    // geometry: segments (x0,y0,x1,y1) per fin row
    const th = c.theta * Math.PI / 180, chord = 0.94 * L;
    const segs = [];
    const thick = Math.max(1.0, c.tr * L);
    this.thick = thick;
    for (let k = 0; k < pitches; k++) {
      const yc = (k + 0.5) * Fpc;
      let x = xs;
      segs.push({ x0: x, y0: yc, x1: x + L, y1: yc, kind: 'flat' }); x += L;
      const lv = (sign) => { for (let i = 0; i < c.n; i++) { const cx = x + L * 0.5, dx = Math.cos(th) * chord / 2, dy = Math.sin(th) * chord / 2 * sign; segs.push({ x0: cx - dx, y0: yc - dy, x1: cx + dx, y1: yc + dy, kind: sign > 0 ? 'up' : 'down' }); x += L; } };
      lv(1);
      segs.push({ x0: x, y0: yc, x1: x + 1.4 * L, y1: yc, kind: 'flat' }); x += 1.4 * L;
      lv(-1);
      segs.push({ x0: x, y0: yc, x1: x + L, y1: yc, kind: 'flat' }); x += L;
      if (k === 0) { this.bank1 = [xs + L, xs + L * (1 + c.n)]; this.bank2 = [xs + L * (2.4 + c.n), xs + L * (2.4 + 2 * c.n)]; this.finEnd = x; }
    }
    this.segs = segs;
    const r = thick / 2 + (c.pad ?? 0.35);
    for (const s of segs) {
      const minx = Math.floor(Math.min(s.x0, s.x1) - r - 1), maxx = Math.ceil(Math.max(s.x0, s.x1) + r + 1);
      const miny = Math.floor(Math.min(s.y0, s.y1) - r - 1), maxy = Math.ceil(Math.max(s.y0, s.y1) + r + 1);
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0, l2 = vx * vx + vy * vy;
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - s.x0) * vx + (py - s.y0) * vy) / l2; t = Math.max(0, Math.min(1, t));
        const dx = px - (s.x0 + t * vx), dy = py - (s.y0 + t * vy);
        if (dx * dx + dy * dy <= r * r && x >= 0 && x < NX) this.solid[((y % NY) + NY) % NY * NX + x] = 1;
      }
    }
    this.setRe(c.re);
    this.reset();
  }
  setRe(re) {
    this.re = re;
    this.u0 = this.cfg.u0 || 0.11;
    // characteristic velocity is the core velocity (inlet / porosity); length is louver pitch
    const porosity = 1 - this.thick / this.Fpc;
    const nu = (this.u0 / porosity) * this.L / re;
    this.tau0 = 3 * nu + 0.5;
    this.alpha = nu / 0.71;
  }
  reset() {
    const { N, f, u0 } = this;
    for (let i = 0; i < N; i++) {
      const u = this.solid[i] ? 0 : u0;
      for (let q = 0; q < 9; q++) {
        const eu = EX[q] * u; f[q * N + i] = WQ[q] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u * u);
      }
      this.T[i] = this.solid[i] ? 1 : 0; this.rho[i] = 1; this.ux[i] = u; this.uy[i] = 0;
    }
    this.steps = 0; this.blown = false;
  }
  step() {
    const { NX, NY, N, f, g, solid, ux, uy, rho, tau0, u0 } = this;
    const Cs2x18 = 18 * 1.4142 * 0.14 * 0.14;
    // collide + stream (push)
    for (let y = 0; y < NY; y++) {
      const yu = y === NY - 1 ? 0 : y + 1, yd = y === 0 ? NY - 1 : y - 1;
      for (let x = 0; x < NX; x++) {
        const i = y * NX + x;
        if (solid[i]) continue;
        let f0 = f[i], f1 = f[N + i], f2 = f[2 * N + i], f3 = f[3 * N + i], f4 = f[4 * N + i], f5 = f[5 * N + i], f6 = f[6 * N + i], f7 = f[7 * N + i], f8 = f[8 * N + i];
        let r = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        let vx = (f1 + f5 + f8 - f3 - f6 - f7) / r, vy = (f2 + f5 + f6 - f4 - f7 - f8) / r;
        if (x === 0) { r = 1; vx = u0; vy = 0; f0 = f1 = f2 = f3 = f4 = f5 = f6 = f7 = f8 = NaN; }
        rho[i] = r; ux[i] = vx; uy[i] = vy;
        const usq = 1.5 * (vx * vx + vy * vy);
        const e0 = 4 / 9 * r * (1 - usq);
        const e1 = r / 9 * (1 + 3 * vx + 4.5 * vx * vx - usq), e3 = r / 9 * (1 - 3 * vx + 4.5 * vx * vx - usq);
        const e2 = r / 9 * (1 + 3 * vy + 4.5 * vy * vy - usq), e4 = r / 9 * (1 - 3 * vy + 4.5 * vy * vy - usq);
        const a5 = vx + vy, a6 = -vx + vy;
        const e5 = r / 36 * (1 + 3 * a5 + 4.5 * a5 * a5 - usq), e7 = r / 36 * (1 - 3 * a5 + 4.5 * a5 * a5 - usq);
        const e6 = r / 36 * (1 + 3 * a6 + 4.5 * a6 * a6 - usq), e8 = r / 36 * (1 - 3 * a6 + 4.5 * a6 * a6 - usq);
        let o0, o1, o2, o3, o4, o5, o6, o7, o8;
        if (x === 0) { o0 = e0; o1 = e1; o2 = e2; o3 = e3; o4 = e4; o5 = e5; o6 = e6; o7 = e7; o8 = e8; }
        else {
          const n1 = f1 - e1, n2 = f2 - e2, n3 = f3 - e3, n4 = f4 - e4, n5 = f5 - e5, n6 = f6 - e6, n7 = f7 - e7, n8 = f8 - e8;
          const pxx = n1 + n3 + n5 + n6 + n7 + n8, pyy = n2 + n4 + n5 + n6 + n7 + n8, pxy = n5 - n6 + n7 - n8;
          const Q = Math.sqrt(pxx * pxx + pyy * pyy + 2 * pxy * pxy);
          const tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + Cs2x18 * Q / r));
          const om = 1 / tau;
          o0 = f0 + om * (e0 - f0); o1 = f1 - om * n1; o2 = f2 - om * n2; o3 = f3 - om * n3; o4 = f4 - om * n4;
          o5 = f5 - om * n5; o6 = f6 - om * n6; o7 = f7 - om * n7; o8 = f8 - om * n8;
        }
        const xr = x + 1, xl = x - 1;
        g[i] = o0;
        // dir 1 (+x)
        if (xr < NX) { const j = y * NX + xr; if (solid[j]) g[3 * N + i] = o1; else g[N + j] = o1; }
        if (xl >= 0) { const j = y * NX + xl; if (solid[j]) g[N + i] = o3; else g[3 * N + j] = o3; }
        { const j = yu * NX + x; if (solid[j]) g[4 * N + i] = o2; else g[2 * N + j] = o2; }
        { const j = yd * NX + x; if (solid[j]) g[2 * N + i] = o4; else g[4 * N + j] = o4; }
        if (xr < NX) { const j = yu * NX + xr; if (solid[j]) g[7 * N + i] = o5; else g[5 * N + j] = o5; }
        if (xl >= 0) { const j = yu * NX + xl; if (solid[j]) g[8 * N + i] = o6; else g[6 * N + j] = o6; }
        if (xl >= 0) { const j = yd * NX + xl; if (solid[j]) g[5 * N + i] = o7; else g[7 * N + j] = o7; }
        if (xr < NX) { const j = yd * NX + xr; if (solid[j]) g[6 * N + i] = o8; else g[8 * N + j] = o8; }
      }
    }
    // outlet: zero-gradient for incoming populations
    for (let y = 0; y < NY; y++) {
      const i = y * NX + NX - 1, k = i - 1;
      for (let q = 0; q < 9; q++) g[q * N + i] = g[q * N + k];
    }
    this.f = g; this.g = f;
    this.steps++;
    this.advectT();
    if (this.steps % 50 === 0) {
      const mid = (NY >> 1) * NX + (NX >> 1);
      if (!isFinite(this.ux[mid]) || Math.abs(this.ux[mid]) > 0.6) { this.blown = true; this.reset(); }
    }
  }
  advectT() {
    const { NX, NY, T, T2, ux, uy, solid, alpha } = this;
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const i = y * NX + x;
        if (solid[i]) { T2[i] = 1; continue; }
        if (x === 0) { T2[i] = 0; continue; }
        let sx = x - ux[i], sy = y - uy[i];
        if (sx < 0) sx = 0; if (sx > NX - 1) sx = NX - 1;
        sy = (sy + NY) % NY;
        const x0 = sx | 0, y0 = sy | 0, x1 = Math.min(NX - 1, x0 + 1), y1 = (y0 + 1) % NY, fx = sx - x0, fy = sy - y0;
        const a = T[y0 * NX + x0], b = T[y0 * NX + x1], c = T[y1 * NX + x0], d = T[y1 * NX + x1];
        let v = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
        const xr = Math.min(NX - 1, x + 1), yu = (y + 1) % NY, yd = (y - 1 + NY) % NY;
        const lap = T[y * NX + xr] + T[y * NX + x - 1] + T[yu * NX + x] + T[yd * NX + x] - 4 * T[i];
        T2[i] = v + alpha * lap;
      }
    }
    this.T = T2; this.T2 = T;
  }
  computeVorticity() {
    const { NX, NY, ux, uy, vort, solid } = this;
    for (let y = 0; y < NY; y++) {
      const yu = (y + 1) % NY, yd = (y - 1 + NY) % NY;
      for (let x = 1; x < NX - 1; x++) {
        const i = y * NX + x;
        vort[i] = solid[i] ? 0 : (uy[i + 1] - uy[i - 1]) - (ux[yu * NX + x] - ux[yd * NX + x]);
      }
    }
  }
  flowEfficiency() {
    const { NX, NY, ux, uy, solid } = this;
    let su = 0, sv = 0;
    const [a, b] = this.bank1;
    for (let y = 0; y < NY; y++) for (let x = Math.round(a + this.L); x < b; x++) { const i = y * NX + x; if (!solid[i]) { su += ux[i]; sv += uy[i]; } }
    const ang = Math.atan2(sv, su) * 180 / Math.PI;
    return { angle: ang, eta: Math.max(0, Math.min(1.2, ang / this.cfg.theta)) };
  }
  sample(x, y) { // bilinear velocity
    const { NX, NY, ux, uy } = this;
    if (x < 0) x = 0; if (x > NX - 1.001) x = NX - 1.001;
    y = ((y % NY) + NY) % NY;
    const x0 = x | 0, y0 = y | 0, x1 = x0 + 1, y1 = (y0 + 1) % NY, fx = x - x0, fy = y - y0;
    const i00 = y0 * NX + x0, i10 = y0 * NX + x1, i01 = y1 * NX + x0, i11 = y1 * NX + x1;
    return [
      (ux[i00] * (1 - fx) + ux[i10] * fx) * (1 - fy) + (ux[i01] * (1 - fx) + ux[i11] * fx) * fy,
      (uy[i00] * (1 - fx) + uy[i10] * fx) * (1 - fy) + (uy[i01] * (1 - fx) + uy[i11] * fx) * fy];
  }
}
if (typeof module !== 'undefined') module.exports = { LouverSim };
