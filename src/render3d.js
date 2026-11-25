// Radiator 3D renderer v2: hand-built WebGL2 with real geometry, PBR shading, shadow map, floor reflection,
// streak-ribbon air and coolant flow, exploded view and callouts.
const M4 = {
  id() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  persp(fov, a, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  tr(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  rz(a) { const o = M4.id(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
};

// ---------------- geometry ----------------
class GB {
  constructor() { this.P = []; this.N = []; this.U = []; this.I = []; }
  v(p, n, u) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(u ? u[0] : 0, u ? u[1] : 0); return this.P.length / 3 - 1; }
  q(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
  add(m, off) { const b = this.P.length / 3; for (let i = 0; i < m.P.length; i += 3) { this.P.push(m.P[i] + off[0], m.P[i + 1] + off[1], m.P[i + 2] + off[2]); } this.N.push(...m.N); this.U.push(...m.U); for (const i of m.I) this.I.push(i + b); return this; }
  done() { return { P: new Float32Array(this.P), N: new Float32Array(this.N), U: new Float32Array(this.U), I: new Uint32Array(this.I) }; }
}
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function roundedBox(w, h, d, r, k = 6) {
  const g = new GB(), H = [w / 2, h / 2, d / 2];
  r = Math.min(r, H[0], H[1], H[2]) * 0.999;
  const co = (hh) => { const a = []; for (let i = 0; i <= k; i++) a.push(-hh + r * i / k); a.push(-hh * 0.33, hh * 0.33); for (let i = k; i >= 0; i--) a.push(hh - r * i / k); a.sort((x, y) => x - y); return a.filter((v, i, s) => i === 0 || Math.abs(v - s[i - 1]) > 1e-6); };
  for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
    const b = (ax + 1) % 3, c = (ax + 2) % 3, cb = co(H[b]), cc = co(H[c]), base = g.P.length / 3;
    for (let i = 0; i < cb.length; i++) for (let j = 0; j < cc.length; j++) {
      const p = [0, 0, 0]; p[ax] = sg * H[ax]; p[b] = cb[i]; p[c] = cc[j];
      const inner = p.map((v, a) => Math.max(-(H[a] - r), Math.min(H[a] - r, v)));
      let dv = [p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]], l = Math.hypot(...dv);
      const n = l > 1e-6 ? dv.map((v) => v / l) : (() => { const f = [0, 0, 0]; f[ax] = sg; return f; })();
      g.v([inner[0] + n[0] * r, inner[1] + n[1] * r, inner[2] + n[2] * r], n, [i / (cb.length - 1), j / (cc.length - 1)]);
    }
    for (let i = 0; i < cb.length - 1; i++) for (let j = 0; j < cc.length - 1; j++) { const a = base + i * cc.length + j; g.q(a, a + cc.length, a + cc.length + 1, a + 1); }
  }
  return g.done();
}
function sweep(path, rad, seg = 20, closed = false) {
  const g = new GB(), n = path.length;
  const T = path.map((p, i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; if (closed) { const a2 = path[(i - 1 + n) % n], b2 = path[(i + 1) % n]; return nrm([b2[0] - a2[0], b2[1] - a2[1], b2[2] - a2[2]]); } return nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); });
  let up = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let Nn = nrm(cross(cross(T[0], up), T[0]));
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) { const t = T[i]; const b = cross(t, Nn); Nn = nrm(cross(b, t)); len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); }
    const B = cross(T[i], Nn), R = typeof rad === 'function' ? rad(i / (n - 1)) : rad;
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nn = [Nn[0] * c + B[0] * s, Nn[1] * c + B[1] * s, Nn[2] * c + B[2] * s];
      g.v([path[i][0] + nn[0] * R, path[i][1] + nn[1] * R, path[i][2] + nn[2] * R], nn, [len, j / seg]);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = ((i + 1) % n) * (seg + 1) + j; g.q(a, b, b + 1, a + 1); }
  return g.done();
}
const arcPts = (c, r, a0, a1, plane, k = 12) => { const o = []; for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; const u = Math.cos(a) * r, v = Math.sin(a) * r; o.push(plane === 'xz' ? [c[0] + u, c[1], c[2] + v] : plane === 'xy' ? [c[0] + u, c[1] + v, c[2]] : [c[0], c[1] + u, c[2] + v]); } return o; };
const linePts = (a, b, k = 4) => { const o = []; for (let i = 0; i <= k; i++) o.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k, a[2] + (b[2] - a[2]) * i / k]); return o; };
const joinPts = (...ls) => { const o = []; for (const l of ls) for (const p of l) { const q = o[o.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-4) o.push(p); } return o; };
function cylinder(r, h, seg = 32, caps = true) { // along y, centered
  const g = new GB();
  for (const y of [-h / 2, h / 2]) for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; g.v([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], [j / seg * Math.PI * 2 * r, y]); }
  for (let j = 0; j < seg; j++) g.q(j, j + seg + 1, j + seg + 2, j + 1);
  if (caps) for (const [y, ny] of [[-h / 2, -1], [h / 2, 1]]) { const c = g.v([0, y, 0], [0, ny, 0], [0, 0]); const b = g.P.length / 3; for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; g.v([Math.cos(a) * r, y, Math.sin(a) * r], [0, ny, 0], [Math.cos(a) * r, Math.sin(a) * r]); } for (let j = 0; j < seg; j++) g.I.push(c, b + j, b + j + 1); }
  return g.done();
}
const rotXYZ = (m, f) => { const P = new Float32Array(m.P.length), N = new Float32Array(m.N.length); for (let i = 0; i < m.P.length; i += 3) { const a = f([m.P[i], m.P[i + 1], m.P[i + 2]]), b = f([m.N[i], m.N[i + 1], m.N[i + 2]]); P.set(a, i); N.set(b, i); } return { P, N, U: m.U, I: m.I }; };
const yToZ = (v) => [v[0], v[2], -v[1]];
const yToX = (v) => [v[1], -v[0], v[2]];
function stadiumTube(L, Th, D, seg = 10) {
  const g = new GB(), a = Th / 2, zc = D / 2 - a, ring = [];
  for (let i = 0; i <= seg; i++) { const t = -Math.PI / 2 + Math.PI * i / seg; ring.push([Math.sin(t) * a, zc + Math.cos(t) * a, Math.sin(t), Math.cos(t)]); }
  for (let i = 0; i <= seg; i++) { const t = Math.PI / 2 + Math.PI * i / seg; ring.push([Math.sin(t) * a, -zc + Math.cos(t) * a, Math.sin(t), Math.cos(t)]); }
  ring.push(ring[0]);
  for (const x of [-L / 2, L / 2]) for (const [y, z, ny, nz] of ring) g.v([x, y, z], [0, ny, nz], [x, 0]);
  const m = ring.length; for (let i = 0; i < m - 1; i++) g.q(i, i + m, i + m + 1, i + 1);
  return g.done();
}
function finRow(W, Fl, D, Fp) {
  const g = new GB(), rc = Math.min(Fp / 2, Fl / 3), nw = Math.floor(W / Fp), y0 = -Fl / 2, y1 = Fl / 2, pts = [];
  const x0 = -W / 2 + (W - (nw - 1) * Fp) / 2;
  for (let i = 0; i < nw; i++) {
    const x = x0 + i * Fp, upward = i % 2 === 0;
    const ya = upward ? y0 + rc : y1 - rc, yb = upward ? y1 - rc : y0 + rc;
    for (let k = 0; k <= 3; k++) { const y = ya + (yb - ya) * k / 3; pts.push([x, y, upward ? -1 : 1, 0, (y - y0) / Fl]); }
    if (i < nw - 1) {
      const cx = x + Fp / 2, cy = upward ? y1 - rc : y0 + rc;
      for (let k = 1; k < 6; k++) { const t = Math.PI - Math.PI * k / 6; const s = upward ? 1 : -1; const nx = Math.cos(t), ny = Math.sin(t) * s; pts.push([cx + nx * Fp / 2, cy + ny * rc, nx, ny, -1]); }
    }
  }
  for (const z of [-D / 2, D / 2]) for (const [x, y, nx, ny, u] of pts) g.v([x, y, z], [nx, ny, 0], [u, z]);
  const m = pts.length; for (let i = 0; i < m - 1; i++) g.q(i, i + m, i + m + 1, i + 1);
  return g.done();
}
function annulusPlate(w, h, R, thick, seg = 72) { // rectangle with circular hole, in xy, thickness along z
  const g = new GB();
  for (const [z, nz] of [[thick / 2, 1], [-thick / 2, -1]]) {
    const b = g.P.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const k = Math.min(Math.abs(c) > 1e-6 ? (w / 2) / Math.abs(c) : 1e9, Math.abs(s) > 1e-6 ? (h / 2) / Math.abs(s) : 1e9);
      g.v([c * R, s * R, z], [0, 0, nz], [0, 0]); g.v([c * k, s * k, z], [0, 0, nz], [1, 0]);
    }
    for (let i = 0; i < seg; i++) { const a = b + i * 2; g.q(a, a + 1, a + 3, a + 2); }
  }
  return g.done();
}
function bladeMesh(R, hub, nB) {
  const g = new GB(), nr = 7, nc = 6;
  for (let b = 0; b < nB; b++) {
    const base = g.P.length / 3, a0 = b / nB * Math.PI * 2;
    for (let i = 0; i <= nr; i++) for (let j = 0; j <= nc; j++) {
      const r = hub + (R - hub) * i / nr, c = j / nc - 0.5;
      const span = (0.62 - 0.18 * i / nr) * (1 + 0.25 * Math.sin(i / nr * Math.PI));
      const pitch = 0.75 - 0.35 * i / nr;
      const a = a0 + c * span + 0.25 * (i / nr) ** 2;
      const z = -c * span * r * Math.tan(pitch) * 0.5 + 0.9 * (c * c - 0.25) * r * 0.08;
      g.v([Math.cos(a) * r, Math.sin(a) * r, z], [0, 0, 1], [i / nr, j / nc]);
    }
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const a = base + i * (nc + 1) + j; g.q(a, a + nc + 1, a + nc + 2, a + 1); }
  }
  const m = g.done();
  // recompute normals
  const N = new Float32Array(m.P.length);
  for (let t = 0; t < m.I.length; t += 3) { const [a, b, c] = [m.I[t] * 3, m.I[t + 1] * 3, m.I[t + 2] * 3]; const e1 = [m.P[b] - m.P[a], m.P[b + 1] - m.P[a + 1], m.P[b + 2] - m.P[a + 2]], e2 = [m.P[c] - m.P[a], m.P[c + 1] - m.P[a + 1], m.P[c + 2] - m.P[a + 2]]; const n = cross(e1, e2); for (const v of [a, b, c]) { N[v] += n[0]; N[v + 1] += n[1]; N[v + 2] += n[2]; } }
  for (let i = 0; i < N.length; i += 3) { const n = nrm([N[i], N[i + 1], N[i + 2]]); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
  m.N = N; return m;
}

// ---------------- shaders ----------------
const RAMP_GLSL = `
vec3 ramp(float t){ t=clamp(t,0.,1.);
 vec3 c0=vec3(.11,.23,.62),c1=vec3(.16,.58,.86),c2=vec3(.55,.88,.82),c3=vec3(.98,.88,.45),c4=vec3(.96,.55,.2),c5=vec3(.86,.13,.2);
 float s=t*5.; if(s<1.)return mix(c0,c1,s); if(s<2.)return mix(c1,c2,s-1.); if(s<3.)return mix(c2,c3,s-2.); if(s<4.)return mix(c3,c4,s-3.); return mix(c4,c5,s-4.);}
vec3 lin(vec3 c){ return pow(c,vec3(2.2)); }`;
const VS_MAIN = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV; layout(location=3) in vec3 iOff; layout(location=4) in vec4 iA;
uniform mat4 uVP; uniform mat4 uModel; uniform float uMirror; uniform float uFloorY;
out vec3 vW; out vec3 vN; out vec2 vUV; out vec4 vA; out vec3 vL;
void main(){ vec4 w=uModel*vec4(aPos+iOff,1.); vN=mat3(uModel)*aNrm;
 if(uMirror>.5){ w.y=2.*uFloorY-w.y; vN.y=-vN.y; }
 vW=w.xyz; vUV=aUV; vA=iA; vL=aPos; gl_Position=uVP*w; }`;
const FS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.); }`;
const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec2 vUV; in vec4 vA; in vec3 vL; out vec4 o;
uniform vec3 uCam; uniform int uKind; uniform float uThermal; uniform float uTaIn; uniform float uTcIn; uniform float uW; uniform float uD; uniform float uLp; uniform float uTheta;
uniform float uCut; uniform int uPass; uniform int uCutMode; uniform float uMirror; uniform float uFloorY; uniform float uEtaF;
uniform sampler2DShadow uShadow; uniform mat4 uLightVP; uniform vec3 uLdir; uniform sampler2D uTemp; uniform vec2 uTempSize; uniform float uTime;
${RAMP_GLSL}
const float PI=3.14159265;
vec3 env(vec3 d){
 float y=d.y; vec3 c=mix(vec3(.018,.021,.027),vec3(.06,.07,.085),smoothstep(-.1,.7,y));
 c+=vec3(2.4,2.35,2.25)*smoothstep(.82,.93,y);
 c+=vec3(2.6,2.35,2.0)*smoothstep(.94,.99,dot(d,normalize(vec3(.75,.35,.55))));
 c+=vec3(1.,1.3,1.9)*smoothstep(.91,.985,dot(d,normalize(vec3(-.8,.25,-.55))));
 c+=vec3(.5,.55,.6)*smoothstep(.95,.995,dot(d,normalize(vec3(-.6,.15,.8))));
 c+=vec3(.12,.14,.17)*exp(-abs(y)*10.);
 if(y<0.) c=mix(c,vec3(.012,.014,.017),smoothstep(0.,-.12,y));
 return c; }
vec3 envR(vec3 d,float r){ vec3 a=mix(vec3(.03,.035,.042),vec3(.5,.52,.55),clamp(d.y*.6+.25,0.,1.)); return mix(env(d),a,clamp(r*r*1.8,0.,1.)); }
float D_GGX(float nh,float a){ float a2=a*a; float d=nh*nh*(a2-1.)+1.; return a2/(PI*d*d); }
float G_S(float nv,float nl,float r){ float k=(r+1.)*(r+1.)/8.; return nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k); }
vec3 bump(vec3 n,float h,float s){ vec3 dx=dFdx(vW),dy=dFdy(vW); float hx=dFdx(h),hy=dFdy(h); vec3 r1=cross(dy,n),r2=cross(n,dx); float det=dot(dx,r1); vec3 g=sign(det)*(hx*r1+hy*r2); return normalize(abs(det)*n-g*s); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float shadowAt(vec3 w,vec3 n){
 vec4 l=uLightVP*vec4(w+n*.6,1.); vec3 p=l.xyz/l.w*.5+.5; if(p.x<0.||p.x>1.||p.y<0.||p.y>1.) return 1.;
 float s=0.; vec2 t=vec2(1./2048.);
 for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s+=texture(uShadow,vec3(p.xy+vec2(i,j)*t*1.5,p.z-.0012));
 return s/9.; }
vec3 light(vec3 base,float metal,float rough,vec3 n,vec3 v,float sh,float ao){
 vec3 F0=mix(vec3(.04),base,metal); vec3 dif=base*(1.-metal); float nv=max(dot(n,v),1e-3);
 vec3 col=vec3(0.);
 vec3 Ls[3]; vec3 Cs[3]; Ls[0]=uLdir; Cs[0]=vec3(3.2,3.0,2.75)*sh; Ls[1]=normalize(vec3(-.7,.3,-.5)); Cs[1]=vec3(.55,.7,1.)*1.1; Ls[2]=normalize(vec3(-.5,.4,.8)); Cs[2]=vec3(.35,.37,.4);
 for(int i=0;i<3;i++){ vec3 L=Ls[i]; float nl=max(dot(n,L),0.); if(nl<=0.) continue; vec3 h=normalize(L+v); float nh=max(dot(n,h),0.);
  float a=max(.04,rough*rough); vec3 F=F0+(1.-F0)*pow(1.-max(dot(h,v),0.),5.);
  vec3 spec=D_GGX(nh,a)*G_S(nv,nl,rough)*F/(4.*nv*nl+1e-3);
  col+=(dif*(1.-F)/PI*1.0+spec)*Cs[i]*nl; }
 vec3 Fr=F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-nv,5.);
 vec3 amb=dif*mix(vec3(.05,.055,.065),vec3(.28,.3,.34),n.y*.5+.5)*.9;
 col+=(amb+envR(reflect(-v,n),rough)*Fr)*ao;
 return col; }
void main(){
 vec3 n=normalize(vN); vec3 v=normalize(uCam-vW); if(dot(n,v)<0.) n=-n;
 float alpha=1.;
 bool cut=vW.x>uCut;
 if(uCutMode==1){ if(uPass==0&&cut) discard; if(uPass==1&&!cut) discard; }
 if(uKind==3){ // floor
  float r=length(vW.xz)/900.; vec3 c=mix(vec3(.0075,.009,.012),vec3(.0028,.0039,.006),smoothstep(0.,.8,r));
  vec2 gp=vW.xz/40.; vec2 gg=abs(fract(gp)-.5); float line=1.-smoothstep(.0,.025*length(fwidth(gp))*20.,min(gg.x,gg.y)); c+=line*.006*(1.-smoothstep(.1,.8,r));
  float sh=shadowAt(vW,vec3(0,1,0)); c*=.35+.65*sh;
  float fog=smoothstep(.3,.95,r); vec3 bg=vec3(.0028,.0039,.0060);
  c=mix(c,bg,fog);
  o=vec4(pow(c,vec3(1./2.2)),mix(.86,1.,fog)); return; }
 vec3 base=vec3(.8,.82,.84); float metal=1., rough=.32, ao=1.; vec3 emit=vec3(0.);
 float tn=-1.;
 if(uKind==0){ // tanks: bead-blasted cast aluminum with fine streaks
  float s=hash(floor(vW.yz*vec2(3.,.4)))*.5+hash(floor(vW.xy*8.))*.5; n=bump(n,s*.05+.02*sin(vW.y*2.1),.35);
  base=vec3(.70,.72,.75); rough=.42; }
 if(uKind==1){ // flat tube
  vec2 tc=vec2(((vW.x+uW*.5)/uW*(uTempSize.x-1.)+.5)/uTempSize.x,(vA.z+.5)/uTempSize.y);
  tn=texture(uTemp,tc).b; base=vec3(.74,.76,.79); rough=.28; }
 if(uKind==2){ // serpentine louvered fin
  float zf=clamp((uD*.5-vW.z)/uD,0.,1.); float dm=zf*uD; float u=vUV.x;
  float nL=floor((uD-3.4*uLp)/uLp*.5); float e=uLp, b1=e+nL*uLp, t0=b1+1.4*uLp, b2=t0+nL*uLp;
  float sgn=0.; if(dm>e&&dm<b1) sgn=1.; else if(dm>t0&&dm<b2) sgn=-1.;
  float ph=dm/uLp; float fw=fwidth(ph); float detail=1.-smoothstep(.18,.45,fw);
  if(u>=0.&&sgn!=0.&&u>.08&&u<.92){
   float s=fract(ph); float edge=min(s,1.-s);
   float aw=fwidth(ph)*1.2+.005; float m=smoothstep(.05,.05+aw,edge);
   if(u>.12&&u<.88&&uThermal<.5) alpha=mix(1.,m,detail);
   float tilt=radians(uTheta)*sgn; n=normalize(mix(n,normalize(n+vec3(0.,0.,sin(tilt)*sign(n.x+1e-4))*1.2),detail));
   ao=mix(1.,.55+.45*smoothstep(0.,.18,edge),detail);
  }
  if(u<0.) ao=.8;
  float ed=min(zf,1.-zf); ao*=mix(1.,.38,smoothstep(.0,.16,ed));
  vec2 tc=vec2(((vW.x+uW*.5)/uW*(uTempSize.x-1.)+.5)/uTempSize.x,(vA.z+.5)/uTempSize.y); vec4 tt=texture(uTemp,tc);
  float mid=u<0.?0.:1.-abs(2.*u-1.);
  float taL=mix(tt.g*.55,tt.g,zf);
  tn=mix(tt.r,taL,mid*.55);
  float var=hash(vec2(floor((vW.x+uW)/max(.3,uLp*1.2)),vA.z)); base=vec3(.86,.87,.89)*(.9+.14*var); rough=.34+.1*var; metal=.6; }
 if(uKind==4){ base=vec3(.035,.036,.04); metal=0.; rough=.62; float rib=sin(vUV.x*1.6); n=bump(n,rib*.08,.6); } // rubber
 if(uKind==5){ base=vec3(.75,.05,.07); metal=.85; rough=.28; float kn=sin(vUV.x*6.); n=bump(n,kn*.05,.6*smoothstep(.0,.2,abs(vL.y))); } // red anodized cap
 if(uKind==6){ base=vec3(.045,.047,.052); metal=0.; rough=.45; } // black nylon fan
 if(uKind==7){ // TIG weld bead: stacked-dime ripples
  float ph=fract(vUV.x/1.35); float hgt=pow(ph,1.6)*.6; n=bump(n,hgt,.9);
  base=vec3(.82,.83,.85); rough=.18; }
 if(uKind==8){ base=vec3(.62,.63,.65); rough=.22; } // stainless
 if(uKind==9){ base=vec3(.08,.085,.09); metal=0.; rough=.7; } // rubber grommet
 if(uThermal>.5&&tn>=0.){ vec3 tcol=lin(ramp(tn)); base=tcol; metal=.25; rough=.4; emit=tcol*.22; }
 float sh=uMirror>.5?1.:shadowAt(vW,n);
 vec3 col=light(base,metal,rough,n,v,sh,ao)+emit;
 if(uPass==1){ alpha=.2; col=col*.6+ (tn>=0.?lin(ramp(tn))*.4:vec3(.08,.1,.13)); }
 if(uMirror>.5){ float d=max(0.,uFloorY-vW.y); col*=.5*exp(-d*.02); }
 col=col*.92; col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
 o=vec4(pow(clamp(col,0.,1.),vec3(1./2.2)),alpha);
}`;
const VS_RIB = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aQ; layout(location=2) in vec3 aS; // side, temp, alpha
uniform mat4 uVP; uniform vec2 uRes; uniform float uWid; uniform float uTa; uniform float uTc; out vec4 vC; out float vE;
${RAMP_GLSL}
void main(){ vec4 p=uVP*vec4(aP,1.), q=uVP*vec4(aQ,1.);
 vec2 a=p.xy/p.w*uRes, b=q.xy/q.w*uRes; vec2 d=b-a; float l=length(d); d=l>1e-4?d/l:vec2(1.,0.);
 vec2 nn=vec2(-d.y,d.x); float w=uWid*(.4+.6*aS.z);
 p.xy+=nn*aS.x*w/uRes*p.w; gl_Position=p; vE=aS.x;
 vC=vec4(ramp((aS.y-uTa)/max(.1,uTc-uTa)),aS.z); }`;
const FS_RIB = `#version 300 es
precision mediump float; in vec4 vC; in float vE; out vec4 o;
void main(){ float e=1.-abs(vE); float a=vC.a*smoothstep(0.,.7,e); vec3 c=vC.rgb*(1.+.6*e); o=vec4(c*a,a); }`;

class Radiator3D {
  constructor(canvas, labelsEl) {
    this.cv = canvas; this.labelsEl = labelsEl;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) { this.ok = false; return; }
    this.ok = true; this.gl = gl;
    this.prog = this.mk(VS_MAIN, FS_MAIN); this.dprog = this.mk(VS_MAIN, FS_DEPTH); this.rprog = this.mk(VS_RIB, FS_RIB);
    // shadow map
    this.SM = 2048;
    this.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SM, this.SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.tTex = gl.createTexture();
    this.instBuf = gl.createBuffer(); this.ribBuf = gl.createBuffer();
    this.yaw = -0.55; this.pitch = 0.3; this.vy = 0; this.vp = 0; this.zoom = 1; this.autoSpin = true;
    this.thermal = 1; this.cutaway = false; this.showAir = true; this.fanOn = false; this.explode = 0; this.ex = 0;
    this.H = 10; this.nAir = 800; this.nCool = 420;
    this.air = { al: new Float32Array(this.nAir), pos: new Float32Array(this.nAir * 3), T: new Float32Array(this.nAir), hist: new Float32Array(this.nAir * this.H * 4), v: new Float32Array(this.nAir), age: new Float32Array(this.nAir) };
    this.cool = { s: new Float32Array(this.nCool * 3), hist: new Float32Array(this.nCool * this.H * 4) };
    this.histT = 0; this.t = 0; this.fanAng = 0;
    this.Ldir = nrm([0.42, 0.88, 0.5]);
    this.bindInput();
  }
  mk(vs, fs) {
    const gl = this.gl, sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name] = gl.getUniformLocation(p, a.name); }
    return p;
  }
  up(m) {
    const gl = this.gl, mk = (d, t = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(t, b); gl.bufferData(t, d, gl.STATIC_DRAW); return b; };
    return { p: mk(m.P), n: mk(m.N), u: mk(m.U), i: mk(m.I, gl.ELEMENT_ARRAY_BUFFER), count: m.I.length };
  }
  free(o) { const gl = this.gl; if (!o) return; for (const k of ['p', 'n', 'u', 'i']) gl.deleteBuffer(o[k]); }
  bindInput() {
    const cv = this.cv, ptrs = new Map(); let pinch = 0;
    cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId); this.autoSpin = false; this.onSpin && this.onSpin(false); });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) { this.vy = -dx * 0.5; this.yaw -= dx * 0.007; if (e.pointerType !== 'touch') { this.pitch = Math.max(-0.05, Math.min(1.3, this.pitch + dy * 0.005)); } }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoom = Math.max(0.45, Math.min(2.2, this.zoom * pinch / d)); pinch = d; }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.45, Math.min(2.2, this.zoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });
    cv.addEventListener('dblclick', () => { this.yaw = -0.55; this.pitch = 0.3; this.zoom = 1; this.autoSpin = true; this.onSpin && this.onSpin(true); });
  }
  // ---------- model ----------
  setModel(p, r) {
    this.p = p; this.r = r;
    const key = [p.W, p.H, p.D, p.Th, p.Fl, p.Fp, r.N, this.fanOn].join('|');
    if (key !== this.geoKey) { this.buildGeo(p, r); this.geoKey = key; this.resetParticles(); }
    this.uploadTemps(p, r);
  }
  buildGeo(p, r) {
    const W = p.W, D = p.D, Th = p.Th, Fl = p.Fl, N = r.N, rows = r.rows;
    const H = N * Th + rows * Fl; this.coreH = H;
    if (this.M) for (const k in this.M) this.free(this.M[k]);
    const M = this.M = {};
    M.tube = this.up(stadiumTube(W + 10, Th, D));
    M.fin = this.up(finRow(W, Fl, D, p.Fp));
    const y0 = -H / 2, inst = [];
    this.tubeY = [];
    for (let t = 0; t < N; t++) { const y = y0 + Fl * (t + 1) + Th * (t + 0.5); this.tubeY.push(y); inst.push(0, y, 0, 0, 0, t, 0); }
    this.tubeInst = inst.length / 7;
    for (let k = 0; k < rows; k++) { const y = y0 + k * (Fl + Th) + Fl / 2; inst.push(0, y, 0, 0, 0, k, 0); }
    this.finInst = rows;
    this.instData = new Float32Array(inst);
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, this.instData, gl.STATIC_DRAW);
    // headers, tanks, welds
    const tw = Math.max(24, Math.min(36, H * 0.24)), tH = H + 14, tD = D + 8, hx = W / 2 + 5;
    this.tankW = tw; this.tankH = tH;
    const rr = Math.min(tw, tD) * 0.45;
    M.tank = this.up(roundedBox(tw, tH, tD, rr, 7));
    M.header = this.up(roundedBox(3.2, tH + 4, tD + 4, 1.4, 3));
    M.chan = this.up(roundedBox(W + 4, 2.4, D - 2, 1, 2));
    const wp = []; { const a = tH / 2 - rr, b = tD / 2 - rr; const seg = (cy, cz, a0) => arcPts([0, cy, cz], rr + 0.2, a0, a0 + Math.PI / 2, 'yz', 8); wp.push(...joinPts(seg(a, b, 0), seg(-a, b, Math.PI / 2), seg(-a, -b, Math.PI), seg(a, -b, Math.PI * 1.5))); }
    // arcPts in 'yz' uses u->y, v->z, with c=[x,cy,cz]
    M.weld = this.up(sweep(wp, 1.15, 10, true));
    // pipes and hoses
    const xL = -(hx + tw), xR = hx + tw, yIn = H / 2 - 16, yOut = -H / 2 + 16, pr = 9.5, hr = 12.5;
    const pipeL = joinPts(linePts([xL + 8, yIn, 0], [xL - 26, yIn, 0], 3));
    const hoseL = joinPts(linePts([xL - 14, yIn, 0], [xL - 30, yIn, 0], 2), arcPts([xL - 30, yIn, -30], 30, Math.PI / 2, Math.PI, 'xz', 14).map((q) => [q[0] - 0 + 0, q[1], q[2]]).map((q) => [xL - 30 + (q[0] - (xL - 30)) * 1, q[1], q[2]]), linePts([xL - 60, yIn, -30], [xL - 60, yIn, -160], 4));
    // fix arc orientation: centre (xL-30, yIn, -30); start angle pi/2 gives (xL-30, -30+30=0) ok, end pi gives (xL-60, -30)
    M.pipeL = this.up(sweep(pipeL, pr, 24));
    M.hoseL = this.up(sweep(hoseL, hr, 28));
    const pipeR = joinPts(linePts([xR - 8, yOut, 0], [xR + 26, yOut, 0], 3));
    const hoseR = joinPts(linePts([xR + 14, yOut, 0], [xR + 30, yOut, 0], 2), arcPts([xR + 30, yOut, -30], 30, Math.PI / 2, 0, 'xz', 14), linePts([xR + 60, yOut, -30], [xR + 60, yOut, -160], 4));
    M.pipeR = this.up(sweep(pipeR, pr, 24)); M.hoseR = this.up(sweep(hoseR, hr, 28));
    const ring = (c, R, rt, axis) => sweep(arcPts(c, R, 0, Math.PI * 2, axis, 40), rt, 10, true);
    M.beadL = this.up(ring([xL - 20, yIn, 0], pr + 0.2, 1.3, 'yz')); M.beadR = this.up(ring([xR + 20, yOut, 0], pr + 0.2, 1.3, 'yz'));
    M.clampL = this.up(new GB().add(ring([xL - 22, yIn, 0], hr + 0.6, 1.5, 'yz'), [0, 0, 0]).add(roundedBox(7, 6, 9, 1.5, 2), [xL - 22, yIn + hr + 3, 0]).done());
    M.clampR = this.up(new GB().add(ring([xR + 22, yOut, 0], hr + 0.6, 1.5, 'yz'), [0, 0, 0]).add(roundedBox(7, 6, 9, 1.5, 2), [xR + 22, yOut - hr - 3, 0]).done());
    // filler neck & cap on right tank, overflow nipple
    const xn = hx + tw / 2, yTop = tH / 2;
    M.neck = this.up(new GB().add(cylinder(10.5, 22, 32, false), [xn, yTop + 8, 0]).add(cylinder(12.5, 2.4, 32), [xn, yTop + 18.5, 0]).done());
    M.cap = this.up(new GB().add(cylinder(15, 7, 48), [xn, yTop + 23, 0]).add(cylinder(9, 3, 32), [xn, yTop + 28, 0]).done());
    M.nipple = this.up(sweep(joinPts(linePts([xn, yTop + 12, -8], [xn, yTop + 12, -26], 3)), 3, 14));
    // brackets with grommets and bolts
    const br = new GB(), gr = new GB(), bo = new GB();
    for (const x of [-(hx + tw / 2), hx + tw / 2]) {
      br.add(roundedBox(16, 24, 4, 1.6, 2), [x, -tH / 2 - 10, -D / 2 + 6]);
      gr.add(sweep(arcPts([x, -tH / 2 - 15, -D / 2 + 6], 4.8, 0, Math.PI * 2, 'xy', 24), 2.3, 10, true), [0, 0, 0]);
      bo.add(rotXYZ(cylinder(2.6, 12, 6), yToZ), [x, -tH / 2 - 15, -D / 2 + 6]);
    }
    M.brk = this.up(br.done()); M.grom = this.up(gr.done()); M.bolt = this.up(bo.done());
    // fan assembly
    if (this.fanOn) {
      const fanD = Math.min(H + 6, W * 0.92), nF = Math.max(1, Math.min(3, Math.floor((W + 10) / (fanD + 6))));
      const colW = (W + 6) / nF, zf = -D / 2 - 7;
      const sh = new GB(), rim = new GB(), mot = new GB(), st = new GB();
      this.fans = [];
      for (let i = 0; i < nF; i++) {
        const cx = -W / 2 - 3 + colW * (i + 0.5);
        this.fans.push([cx, 0, zf - 6]);
        sh.add(annulusPlate(colW, H + 8, fanD / 2, 2.4), [cx, 0, zf]);
        rim.add(sweep(arcPts([cx, 0, zf - 4], fanD / 2 + 0.4, 0, Math.PI * 2, 'xy', 72), (q) => 2.2, 12, true), [0, 0, 0]);
        mot.add(rotXYZ(cylinder(fanD * 0.15, 20, 40), yToZ), [cx, 0, zf - 20]);
        mot.add(rotXYZ(cylinder(fanD * 0.17, 3, 40), yToZ), [cx, 0, zf - 10]);
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; st.add(sweep(linePts([cx + Math.cos(a) * fanD * 0.15, Math.sin(a) * fanD * 0.15, zf - 16], [cx + Math.cos(a) * fanD * 0.49, Math.sin(a) * fanD * 0.49, zf - 3], 2), 1.8, 8), [0, 0, 0]); }
      }
      M.shroud = this.up(sh.done()); M.rim = this.up(rim.done()); M.motor = this.up(mot.done()); M.strut = this.up(st.done());
      M.blade = this.up(bladeMesh(fanD * 0.46, fanD * 0.17, 7));
      M.hub = this.up(rotXYZ(cylinder(fanD * 0.175, 9, 40), yToZ));
    }
    M.floor = this.up((() => { const g = new GB(); const s = 3000; const a = g.v([-s, 0, -s], [0, 1, 0]), b = g.v([s, 0, -s], [0, 1, 0]), c = g.v([s, 0, s], [0, 1, 0]), d = g.v([-s, 0, s], [0, 1, 0]); g.q(a, b, c, d); return g.done(); })());
    this.floorY = -tH / 2 - 24;
    this.inPort = [xL - 60, yIn, -160]; this.outPort = [xR + 60, yOut, -160];
    this.inlet = [xL - 20, yIn, 0]; this.outlet = [xR + 20, yOut, 0]; this.hx = hx; this.yIn = yIn; this.yOut = yOut;
    this.modelW = W + 2 * tw + 140;
    this.scene = [
      ['floor', 3, 'none'],
      ['tube', 1, 'core', 'tubes'], ['fin', 2, 'core', 'fins'], ['chan', 0, 'core', null, [0, H / 2 + 1.2, 0]], ['chan', 0, 'core', null, [0, -H / 2 - 1.2, 0]],
      ['header', 8, 'L', null, [-hx + 1.6, 0, 0]], ['header', 8, 'R', null, [hx - 1.6, 0, 0]],
      ['tank', 0, 'L', null, [-(hx + tw / 2), 0, 0]], ['tank', 0, 'R', null, [hx + tw / 2, 0, 0]],
      ['weld', 7, 'L', null, [-hx, 0, 0]], ['weld', 7, 'R', null, [hx, 0, 0]],
      ['pipeL', 0, 'L'], ['pipeR', 0, 'R'], ['beadL', 0, 'L'], ['beadR', 0, 'R'], ['hoseL', 4, 'L'], ['hoseR', 4, 'R'], ['clampL', 8, 'L'], ['clampR', 8, 'R'],
      ['neck', 0, 'R'], ['cap', 5, 'R'], ['nipple', 0, 'R'], ['brk', 0, 'B'], ['grom', 9, 'B'], ['bolt', 8, 'B']
    ];
    if (this.fanOn) this.scene.push(['shroud', 6, 'F'], ['rim', 6, 'F'], ['motor', 6, 'F'], ['strut', 6, 'F'], ['blade', 6, 'F', 'blades'], ['hub', 8, 'F', 'hubs']);
  }
  uploadTemps(p, r) {
    const gl = this.gl, nx = r.nx, rows = r.rows, N = r.N, d = new Uint8Array(nx * rows * 4);
    const tn = (T) => Math.max(0, Math.min(255, Math.round((T - p.TaIn) / Math.max(0.1, p.TcIn - p.TaIn) * 255)));
    for (let k = 0; k < rows; k++) for (let i = 0; i < nx; i++) {
      const a = Math.min(N - 1, Math.max(0, k - 1)), b = Math.min(N - 1, k), o = (k * nx + i) * 4;
      d[o] = tn((r.mapC[a][i] + r.mapC[b][i]) / 2); d[o + 1] = tn((r.mapA[a][i] + r.mapA[b][i]) / 2); d[o + 2] = k < N ? tn(r.mapC[k][i]) : 0; d[o + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nx, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tSize = [nx, rows];
  }
  groupOff(g) { const e = this.ex; return g === 'L' ? [-48 * e, 0, 0] : g === 'R' ? [48 * e, 0, 0] : g === 'F' ? [0, 0, -80 * e] : g === 'B' ? [0, -18 * e, 0] : [0, 0, 0]; }
  // ---------- particles ----------
  resetParticles() { if (!this.p) return; for (let i = 0; i < this.nAir; i++) this.spawnAir(i, true); for (let i = 0; i < this.nCool; i++) this.spawnCool(i, true); }
  spawnAir(i, scatter) {
    const p = this.p, a = this.air, W = p.W, H = this.coreH, zs = p.D / 2 + 170;
    const x = (Math.random() - 0.5) * W * 1.02, y = (Math.random() - 0.5) * H * 1.02;
    const z = scatter ? -p.D / 2 - 200 + Math.random() * (zs + p.D / 2 + 200) : zs + Math.random() * 20;
    a.pos.set([x, y, z], i * 3); a.T[i] = p.TaIn; a.v[i] = 0.85 + Math.random() * 0.3; a.age[i] = 0;
    for (let h = 0; h < this.H; h++) a.hist.set([x, y, z, p.TaIn], (i * this.H + h) * 4);
  }
  spawnCool(i, scatter) {
    const s = this.cool.s; s[i * 3] = Math.floor(Math.random() * this.r.N); s[i * 3 + 1] = scatter ? Math.random() * 4 : 0; s[i * 3 + 2] = (Math.random() - 0.5) * (this.p.D - 8);
    const q = this.coolPos(i); for (let h = 0; h < this.H; h++) this.cool.hist.set(q, (i * this.H + h) * 4);
  }
  coolPos(i) {
    const s = this.cool.s, p = this.p, W = p.W, tw = this.tankW, hx = this.hx, e = this.ex * 48;
    const t = s[i * 3] | 0, u = s[i * 3 + 1], z = s[i * 3 + 2], ty = this.tubeY[Math.min(t, this.tubeY.length - 1)];
    const L = (a, b, k) => a + (b - a) * k, rc = this.r.mapC[Math.min(t, this.r.N - 1)];
    const xl = -(hx + tw / 2) - e, xr = hx + tw / 2 + e;
    if (u < 1) return [L(this.inlet[0] - 30 - e, xl, u), this.yIn, z * 0.25 * u, p.TcIn];
    if (u < 1.5) { const k = (u - 1) / 0.5; return [xl + Math.sin(t * 7.1 + i) * 0.22 * tw, L(this.yIn, ty, k), z * L(0.25, 1, k), p.TcIn]; }
    if (u < 3) { const k = (u - 1.5) / 1.5, x = L(xl, xr, k); const ix = Math.min(rc.length - 1, Math.floor(Math.max(0, Math.min(0.999, (x + W / 2) / W)) * rc.length)); return [x, ty, z, rc[ix]]; }
    if (u < 3.5) { const k = (u - 3) / 0.5; return [xr + Math.cos(t * 5.3 + i) * 0.22 * tw, L(ty, this.yOut, k), z * L(1, 0.25, k), this.r.TcOut]; }
    const k = (u - 3.5) / 0.5; return [L(xr, this.outlet[0] + 30 + e, k), this.yOut, z * 0.25 * (1 - k), this.r.TcOut];
  }
  update(dt) {
    const p = this.p, r = this.r, a = this.air, slow = 1 / 30;
    const Vup = Math.max(0.15, p.VfaceSolved) * 1000 * slow, Vcore = Vup / r.sigma;
    const zf = p.D / 2, zb = -p.D / 2, H = this.coreH, W = p.W, fan = this.fanOn && this.fans, fz = fan ? this.fans[0][2] - 80 * this.ex : 0;
    this.histT += dt; const push = this.histT > 0.04; if (push) this.histT = 0;
    for (let i = 0; i < this.nAir; i++) {
      const o = i * 3; let x = a.pos[o], y = a.pos[o + 1], z = a.pos[o + 2];
      const tx = Math.min(r.nx - 1, Math.max(0, Math.floor((x + W / 2) / W * r.nx))), ty = Math.min(r.N - 1, Math.max(0, Math.floor((y + H / 2) / H * r.N)));
      const Tout = r.mapA[ty][tx];
      let v = (z > zf ? Vup : z > zb ? Vcore : Vup * 1.1) * a.v[i];
      if (z > zf) { a.T[i] = p.TaIn; z -= v * dt; }
      else if (z > zb) { const k = (zf - z) / p.D; a.T[i] = p.TaIn + (Tout - p.TaIn) * (1 - Math.exp(-3 * k)) / (1 - Math.exp(-3)); z -= v * dt; }
      else {
        a.T[i] = Tout;
        if (fan) {
          let best = this.fans[0]; for (const f of this.fans) if (Math.abs(f[0] - x) < Math.abs(best[0] - x)) best = f;
          const dx = x - best[0], dy = y - best[1], rr = Math.hypot(dx, dy) + 1e-3, beyond = z < fz;
          const pull = beyond ? 0.12 : -0.7, sw = beyond ? 0.55 : 0.9;
          x += (dx / rr * pull * v - dy / rr * sw * v * 0.6) * dt; y += (dy / rr * pull * v + dx / rr * sw * v * 0.6) * dt; z -= v * 1.3 * dt;
        } else { x += x * 0.0015 * v * dt; y += (y * 0.0015 + 0.02) * v * dt; z -= v * dt; }
      }
      a.pos[o] = x; a.pos[o + 1] = y; a.pos[o + 2] = z;
      a.al[i] = Math.min(1, Math.max(0, (p.D / 2 + 170 - z) / 70)) * Math.min(1, Math.max(0, (z - (zb - 240)) / 120));
      if (push) { const hb = i * this.H * 4; a.hist.copyWithin(hb + 4, hb, hb + (this.H - 1) * 4); a.hist.set([x, y, z, a.T[i]], hb); }
      if (z < zb - 240) this.spawnAir(i, false);
    }
    const s = this.cool.s, du = Math.max(0.04, r.Vi) * 1000 * slow * 1.6 * dt / (W / 1.5);
    for (let i = 0; i < this.nCool; i++) {
      s[i * 3 + 1] += du * (s[i * 3 + 1] < 1.5 || s[i * 3 + 1] > 3 ? 1.4 : 1);
      if (s[i * 3 + 1] >= 4) { this.spawnCool(i, false); continue; }
      if (push) { const hb = i * this.H * 4; this.cool.hist.copyWithin(hb + 4, hb, hb + (this.H - 1) * 4); this.cool.hist.set(this.coolPos(i), hb); }
    }
  }
  ribbons(hist, n, headPos, al) {
    // build segment quads from history; returns Float32Array of [P(3) Q(3) S(3)] * 6 per segment
    const Hn = this.H, segs = Hn - 1, out = this.ribOut && this.ribOut.length >= n * segs * 54 ? this.ribOut : (this.ribOut = new Float32Array(n * segs * 54));
    let k = 0;
    for (let i = 0; i < n; i++) {
      const hb = i * Hn * 4;
      for (let s = 0; s < segs; s++) {
        const a = hb + s * 4, b = hb + (s + 1) * 4;
        const ax = s === 0 && headPos ? headPos[i * 3] : hist[a], ay = s === 0 && headPos ? headPos[i * 3 + 1] : hist[a + 1], az = s === 0 && headPos ? headPos[i * 3 + 2] : hist[a + 2];
        const bx = hist[b], by = hist[b + 1], bz = hist[b + 2];
        if (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz) < 0.05) continue;
        const k0 = al ? al[i] : 1; if (k0 < 0.01) continue; const fa = (1 - s / segs) * k0, fb = (1 - (s + 1) / segs) * k0, Ta = hist[a + 3], Tb = hist[b + 3];
        const V = [[ax, ay, az, bx, by, bz, -1, Ta, fa], [ax, ay, az, bx, by, bz, 1, Ta, fa], [bx, by, bz, ax + 2 * (bx - ax), ay + 2 * (by - ay), az + 2 * (bz - az), 1, Tb, fb],
          [ax, ay, az, bx, by, bz, -1, Ta, fa], [bx, by, bz, ax + 2 * (bx - ax), ay + 2 * (by - ay), az + 2 * (bz - az), 1, Tb, fb], [bx, by, bz, ax + 2 * (bx - ax), ay + 2 * (by - ay), az + 2 * (bz - az), -1, Tb, fb]];
        for (const q of V) { out.set(q, k); k += 9; }
      }
    }
    return [out, k / 9];
  }
  // ---------- drawing ----------
  bindMesh(m, prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.n); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.u); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i);
  }
  drawItem(it, prog, pass, mirror) {
    const gl = this.gl, [name, kind, group, special, off] = it, m = this.M[name]; if (!m) return;
    if (name === 'floor' && (prog === this.dprog || mirror)) return;
    const go = this.groupOff(group), o = off || [0, 0, 0];
    let cnt = 1, base = 0;
    if (special === 'tubes') { cnt = this.tubeInst; base = 0; }
    if (special === 'fins') { cnt = this.finInst; base = this.tubeInst; }
    const u = prog.u;
    if (u.uKind) gl.uniform1i(u.uKind, kind);
    if (u.uCutMode) gl.uniform1i(u.uCutMode, this.cutaway && (special === 'tubes' || special === 'fins' || (group === 'R' && kind !== 4)) ? 1 : 0);
    if (name === 'floor') { gl.uniformMatrix4fv(u.uModel, false, M4.tr(0, this.floorY, 0)); this.bindMesh(m); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.vertexAttrib3f(3, 0, 0, 0); gl.vertexAttrib4f(4, 0, 0, 0, 0); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); return; }
    this.bindMesh(m);
    if (special === 'tubes' || special === 'fins') {
      gl.uniformMatrix4fv(u.uModel, false, M4.tr(go[0] + o[0], go[1] + o[1], go[2] + o[2]));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 28, base * 28); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 28, base * 28 + 12); gl.vertexAttribDivisor(4, 1);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, cnt);
      gl.vertexAttribDivisor(3, 0); gl.vertexAttribDivisor(4, 0); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4);
      return;
    }
    gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4); gl.vertexAttrib3f(3, 0, 0, 0); gl.vertexAttrib4f(4, 0, 0, 0, 0);
    if (special === 'blades' || special === 'hubs') {
      for (const f of this.fans) {
        const T = M4.tr(f[0] + go[0], f[1] + go[1], f[2] + go[2] + (special === 'hubs' ? -6 : 0));
        gl.uniformMatrix4fv(u.uModel, false, special === 'blades' ? M4.mul(T, M4.rz(this.fanAng)) : T);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      return;
    }
    gl.uniformMatrix4fv(u.uModel, false, M4.tr(go[0] + o[0], go[1] + o[1], go[2] + o[2]));
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
  }
  render() {
    if (!this.ok || !this.p || !this.M) return;
    const gl = this.gl, cv = this.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = Math.max(1, Math.round(cv.clientWidth * dpr)), Hc = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== Wc || cv.height !== Hc) { cv.width = Wc; cv.height = Hc; }
    const aspect = Wc / Hc, fov = 0.5;
    const hf = Math.atan(Math.tan(fov / 2) * aspect);
    const fitW = (this.modelW / 2) / Math.tan(hf), fitH = ((this.coreH + 120) / 2) / Math.tan(fov / 2);
    const dist = Math.max(fitW, fitH) * (aspect < 1 ? 0.9 : 1.24) * this.zoom;
    const cy = Math.cos(this.pitch), eye = [Math.sin(this.yaw) * cy * dist, Math.sin(this.pitch) * dist, Math.cos(this.yaw) * cy * dist];
    const tgt = [0, -this.coreH * 0.06, 0];
    eye[1] += tgt[1];
    const V = M4.look(eye, tgt, [0, 1, 0]), Pm = M4.persp(fov, aspect, 20, dist * 6), VP = M4.mul(Pm, V);
    this.VP = VP; this.eye = eye; this.Wc = Wc; this.Hc = Hc; this.dpr = dpr;
    // shadow pass
    const ext = this.modelW * 0.62 + 60, L = this.Ldir, le = [L[0] * 900, L[1] * 900, L[2] * 900];
    const LV = M4.mul(M4.ortho(-ext, ext, -ext, ext, 100, 1900), M4.look(le, [0, 0, 0], [0, 1, 0]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFB); gl.viewport(0, 0, this.SM, this.SM);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.dprog); gl.uniformMatrix4fv(this.dprog.u.uVP, false, LV); gl.uniform1f(this.dprog.u.uMirror, 0);
    for (const it of this.scene) this.drawItem(it, this.dprog, 0, false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, Wc, Hc);
    gl.clearColor(0.043, 0.052, 0.068, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const P = this.prog, u = P.u, p = this.p;
    gl.useProgram(P);
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uCam, eye); gl.uniform1f(u.uThermal, this.thermal);
    gl.uniform1f(u.uTaIn, p.TaIn); gl.uniform1f(u.uTcIn, p.TcIn); gl.uniform1f(u.uW, p.W); gl.uniform1f(u.uD, p.D); gl.uniform1f(u.uLp, p.Lp); gl.uniform1f(u.uTheta, p.theta);
    gl.uniform1f(u.uFloorY, this.floorY); gl.uniform1f(u.uCut, this.cutaway ? p.W * 0.06 : 1e6); gl.uniform3fv(u.uLdir, L); gl.uniformMatrix4fv(u.uLightVP, false, LV);
    gl.uniform1f(u.uEtaF, this.r.etaF); gl.uniform2fv(u.uTempSize, this.tSize);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tTex); gl.uniform1i(u.uTemp, 1);
    gl.uniform1i(u.uPass, 0);
    // mirrored reflection pass
    gl.uniform1f(u.uMirror, 1);
    for (const it of this.scene) if (it[1] !== 2) this.drawItem(it, P, 0, true);
    gl.uniform1f(u.uMirror, 0);
    // floor (blended over reflection)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawItem(this.scene[0], P, 0, false);
    gl.disable(gl.BLEND);
    for (const it of this.scene) if (it[0] !== 'floor') { const fin = it[3] === 'fins'; if (fin) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); this.drawItem(it, P, 0, false); if (fin) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); }
    // translucent cutaway pass
    gl.enable(gl.BLEND); gl.depthMask(false);
    if (this.cutaway) {
      gl.uniform1i(u.uPass, 1);
      for (const it of this.scene) if (it[3] === 'tubes' || (it[2] === 'R' && (it[0] === 'tank' || it[0] === 'header'))) this.drawItem(it, P, 1, false);
      gl.uniform1i(u.uPass, 0);
      this.drawRibbons(this.cool.hist, this.nCool, null, 3.2);
    }
    if (this.showAir) this.drawRibbons(this.air.hist, this.nAir, this.air.pos, 1.7, this.air.al);
    gl.depthMask(true); gl.disable(gl.BLEND);
    this.placeLabels();
  }
  drawRibbons(hist, n, head, wid, al) {
    const gl = this.gl, R = this.rprog, [buf, nv] = this.ribbons(hist, n, head, al);
    if (!nv) return;
    gl.useProgram(R); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(R.u.uVP, false, this.VP); gl.uniform2f(R.u.uRes, this.Wc / 2, this.Hc / 2); gl.uniform1f(R.u.uWid, wid * this.dpr);
    gl.uniform1f(R.u.uTa, this.p.TaIn); gl.uniform1f(R.u.uTc, this.p.TcIn);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribBuf); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, nv * 9), gl.STREAM_DRAW);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 0); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(4);
    gl.drawArrays(gl.TRIANGLES, 0, nv);
    gl.useProgram(this.prog);
  }
  project(pt) {
    const m = this.VP, x = pt[0], y = pt[1], z = pt[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(cx / cw * 0.5 + 0.5) * this.Wc / this.dpr, (1 - (cy / cw * 0.5 + 0.5)) * this.Hc / this.dpr, cw];
  }
  placeLabels() {
    if (!this.labelsEl || !this.p) return;
    const p = this.p, e = this.ex * 48;
    const pts = { lin: [this.inlet[0] - 14 - e, this.yIn + 14, 0], lout: [this.outlet[0] + 14 + e, this.yOut + 14, 0], lair: [-p.W * 0.25, this.coreH * 0.32, p.D / 2 + 70], lexh: [p.W * 0.18, this.coreH / 2 + 26, -p.D / 2 - 90] };
    for (const id in pts) {
      const el = this.labelsEl.querySelector('[data-k=' + id + ']'); if (!el) continue;
      const [x, y, w] = this.project(pts[id]);
      const behind = (id === 'lair' && this.eye[2] < 0) || (id === 'lexh' && this.eye[2] > 0 && false);
      const vis = !behind && w > 0 && x > 40 && x < this.Wc / this.dpr - 40 && y > 50 && y < this.Hc / this.dpr - 10;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.style.opacity = vis ? 1 : 0;
    }
  }
  frame(dt) {
    if (!this.p || !this.M) return;
    if (this.autoSpin) this.yaw += dt * 0.1; else { this.yaw += this.vy * 0.0001 * 0; }
    this.ex += (this.explode - this.ex) * Math.min(1, dt * 4);
    if (this.fanOn) this.fanAng -= dt * 10;
    this.t += dt; this.update(dt); this.render();
  }
}
