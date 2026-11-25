// Radiator thermal-hydraulic model. Units: SI inside, mm for geometry inputs.
function airProps(Tc, P) {
  const T = Tc + 273.15;
  const rho = P / (287.05 * T);
  const mu = 1.716e-5 * Math.pow(T / 273.15, 1.5) * (273.15 + 110.4) / (T + 110.4);
  const k = 0.0241 * Math.pow(T / 273.15, 0.81);
  const cp = 1006 + 0.0004 * (T - 300) ** 2 * 0;
  return { rho, mu, k, cp, Pr: mu * cp / k };
}
function coolantProps(Tc, type) {
  const muW = 2.414e-5 * Math.pow(10, 247.8 / (Tc + 273.15 - 140));
  if (type === 'eg50') {
    return { rho: 1082 - 0.45 * Tc, cp: 3300 + 3.0 * Tc, mu: muW * 3.1, k: 0.38 + 0.0003 * Tc };
  }
  return { rho: 1000 - 0.0178 * Math.pow(Math.abs(Tc - 4), 1.7), cp: 4180 + 0.0 * Tc, mu: muW, k: 0.569 + 0.00188 * Tc - 7.9e-6 * Tc * Tc };
}
function pressureAt(alt) { return 101325 * Math.pow(1 - 2.25577e-5 * alt, 5.25588); }

function solveRadiator(p) {
  // geometry (m)
  const W = p.W / 1000, H = p.H / 1000, D = p.D / 1000;
  const Fp = p.Fp / 1000, Lp = p.Lp / 1000, Fl = p.Fl / 1000, df = p.df / 1000, Th = p.Th / 1000, tw = p.tw / 1000;
  const theta = p.theta;
  const Tp = Fl + Th;                       // tube pitch
  const N = Math.max(1, Math.floor((H - Fl) / Tp)); // tubes (fin row above and below each)
  const rows = N + 1;                       // fin rows incl. top/bottom against side plates
  const Ll = 0.85 * Fl;                     // louver length
  const nf = Math.floor(W / Fp);            // fins per row
  const Afr = W * H;
  const finFrontal = rows * Fl * W;         // open frontal band
  const Ac = rows * Fl * W * (1 - df / Fp); // minimum free-flow area
  const sigma = Ac / Afr;
  const Afin = rows * nf * 2 * Fl * D;
  const Atube = N * 2 * W * D * (1 - df / Fp);
  const A = Afin + Atube;
  const Dh = 4 * Ac * D / A;
  // air
  const P = pressureAt(p.alt);
  const Tfilm = (p.TaIn + p.TcIn) / 2 * 0.5 + p.TaIn * 0.5;
  const air = airProps(Tfilm, P);
  const airIn = airProps(p.TaIn, P);
  const Vf = p.Vface;  // face velocity (m/s), supplied or solved by operatingPoint()
  const mA = airIn.rho * Vf * Afr;
  const Vc = mA / (air.rho * Ac);
  const ReLp = air.rho * Vc * Lp / air.mu;
  // Chang & Wang (1997) j
  const r = (x) => x / Lp;
  const j = Math.pow(ReLp, -0.49) * Math.pow(theta / 90, 0.27) * Math.pow(r(Fp), -0.14) * Math.pow(r(Fl), -0.29)
    * Math.pow(r(D), -0.23) * Math.pow(r(Ll), 0.68) * Math.pow(r(Tp), -0.28) * Math.pow(r(df), -0.05);
  // Kim & Bullard (2002) f
  const f = Math.pow(ReLp, -0.781) * Math.pow(theta / 90, 0.444) * Math.pow(r(Fp), -1.682) * Math.pow(r(Fl), -1.22)
    * Math.pow(r(D), 0.818) * Math.pow(r(Ll), 1.97);
  const G = mA / Ac;
  const hA = j * G * air.cp * Math.pow(air.Pr, -2 / 3);
  const kAl = 190;
  const m = Math.sqrt(2 * hA / (kAl * df));
  const Lf = Fl / 2;
  const etaF = Math.tanh(m * Lf) / (m * Lf);
  const eta0 = 1 - (Afin / A) * (1 - etaF);
  // core friction (Kim & Bullard) + entrance/exit losses (Kays & London form)
  const dPair = G * G / (2 * airIn.rho) * ((1 - sigma * sigma + 0.4) + f * (A / Ac) * (airIn.rho / air.rho) - (1 - sigma * sigma - 0.1));
  // coolant
  const cool = coolantProps(p.TcIn - 3, p.cool);
  const Q = p.flow / 60000; // m3/s
  const wi = D - 2 * tw, hi = Math.max(0.2e-3, Th - 2 * tw);
  const Ai1 = wi * hi, Pi1 = 2 * (wi + hi);
  const Dhi = 4 * Ai1 / Pi1;
  const Vi = Q / (N * Ai1);
  const Rei = cool.rho * Vi * Dhi / cool.mu;
  const Pri = cool.mu * cool.cp / cool.k;
  const Gz = Dhi * Rei * Pri / W;
  const NuLam = 7.54 + 0.03 * Gz / (1 + 0.016 * Math.pow(Gz, 2 / 3));
  let NuTurb = 0, fD;
  if (Rei > 2300) {
    const fd = Math.pow(0.790 * Math.log(Rei) - 1.64, -2);
    NuTurb = (fd / 8) * (Rei - 1000) * Pri / (1 + 12.7 * Math.sqrt(fd / 8) * (Math.pow(Pri, 2 / 3) - 1));
  }
  let Nui;
  if (Rei < 2300) Nui = NuLam;
  else if (Rei < 4000) { const w = (Rei - 2300) / 1700; Nui = NuLam * (1 - w) + Math.max(NuLam, NuTurb) * w; }
  else Nui = Math.max(NuLam, NuTurb);
  const fLam = 96 / Rei * 0.86; // flat duct, aspect ~ 0.025 -> fRe ~ 89
  const fTurb = Rei > 2300 ? Math.pow(0.790 * Math.log(Rei) - 1.64, -2) : 0;
  fD = Rei < 2300 ? fLam : (Rei < 4000 ? fLam + (fTurb - fLam) * (Rei - 2300) / 1700 : fTurb);
  const hi_ = Nui * cool.k / Dhi;
  const Ai = N * Pi1 * W;
  const dPcoreC = fD * (W / Dhi) * cool.rho * Vi * Vi / 2;
  const dPtanks = 1.5 * cool.rho * Vi * Vi / 2 * 2; // contraction + expansion at tube ends
  const dPcool = dPcoreC + dPtanks;
  // overall
  const Rw = tw / (kAl * N * 2 * D * W);
  const UA = 1 / (1 / (eta0 * hA * A) + 1 / (hi_ * Ai) + Rw);
  const Ca = mA * air.cp, mC = Q * cool.rho, Cc = mC * cool.cp;
  const Cmin = Math.min(Ca, Cc), Cmax = Math.max(Ca, Cc), Cr = Cmin / Cmax;
  const NTU = UA / Cmin;
  const eps = 1 - Math.exp((1 / Cr) * Math.pow(NTU, 0.22) * (Math.exp(-Cr * Math.pow(NTU, 0.78)) - 1));
  const Qw = eps * Cmin * (p.TcIn - p.TaIn);
  const TcOut = p.TcIn - Qw / Cc, TaOut = p.TaIn + Qw / Ca;
  const airPower = dPair * mA / airIn.rho;
  // local face map: nx cells along tubes, rows of tubes; coolant flows +x
  const nx = p.quick ? 1 : 48;
  const UAc = UA / (nx * N), Cac = Ca / (nx * N), Cct = Cc / N;
  const mapC = [], mapA = [];
  for (let t = 0; t < N; t++) {
    let Tc = p.TcIn; const rc = [], ra = [];
    for (let i = 0; i < nx; i++) {
      const e = 1 - Math.exp(-UAc / Cac);
      const q = e * Cac * (Tc - p.TaIn);
      ra.push(p.TaIn + q / Cac); rc.push(Tc - q / (2 * Cct));
      Tc -= q / Cct;
    }
    mapC.push(rc); mapA.push(ra);
  }
  return { N, rows, nf, Tp, Ll, Afr, Ac, sigma, Afin, Atube, A, Dh, P, air, mA, Vc, ReLp, j, f, hA, etaF, eta0, dPair,
    Vi, Rei, Dhi, Nui, hi: hi_, Ai, dPcool, UA, Ca, Cc, Cr, NTU, eps, Q: Qw, TcOut, TaOut, airPower, mapC, mapA, nx, rhoC: cool.rho };
}
// Air-side operating point: duct recovery of vehicle dynamic pressure + optional fan (linear curve) = core dP
function operatingPoint(p) {
  if (p.mode === 'tunnel') return p.Vface;
  const P = pressureAt(p.alt), rho = P / (287.05 * (p.TaIn + 273.15));
  const v = p.speed / 3.6;
  const ram = p.Cp * 0.5 * rho * v * v;
  const Afr = p.W * p.H / 1e6;
  const avail = (V) => ram + (p.fan ? Math.max(0, p.fanP * (1 - V * Afr / p.fanQ)) : 0);
  let lo = 0.01, hi = 40;
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    const dp = solveRadiator({ ...p, Vface: mid, quick: true }).dPair;
    if (dp > avail(mid)) hi = mid; else lo = mid;
  }
  return Math.max(0.05, (lo + hi) / 2);
}
if (typeof module !== 'undefined') module.exports = { solveRadiator, pressureAt, operatingPoint };
