/**
 * Pure-TypeScript OLS (Ordinary Least Squares) regression engine.
 *
 * Handles 1–3 independent variables plus an intercept — sufficient for
 * single-factor (CAPM) and Fama-French 3-factor regressions.
 *
 * All matrix operations are inlined for small dimensions rather than
 * pulling in a large numeric library.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OlsResult {
  coefficients: number[];
  standardErrors: number[];
  tStats: number[];
  pValues: number[];
  rSquared: number;
  adjRSquared: number;
  nObservations: number;
}

export interface RegressionInput {
  portfolioReturns: number[];
  mktRf: number[];
  smb: number[];
  hml: number[];
  rf: number[];
}

export interface RegressionResult {
  type: 'single' | 'multi';
  alpha: number;
  alphaSe: number;
  alphaPvalue: number;
  betaMkt: number;
  betaMktSe: number;
  betaMktPvalue: number;
  betaSmb: number | null;
  betaSmbSe: number | null;
  betaSmbPvalue: number | null;
  betaHml: number | null;
  betaHmlSe: number | null;
  betaHmlPvalue: number | null;
  rSquared: number;
  adjRSquared: number;
  nObservations: number;
}

// ---------------------------------------------------------------------------
// Matrix helpers (column-major arrays of arrays)
// ---------------------------------------------------------------------------

type Vec = number[];
type Mat = number[][];

function transpose(A: Mat): Mat {
  const rows = A.length;
  const cols = A[0].length;
  const T: Mat = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) T[j][i] = A[i][j];
  return T;
}

function matMul(A: Mat, B: Mat): Mat {
  const rA = A.length, cA = A[0].length, cB = B[0].length;
  const C: Mat = Array.from({ length: rA }, () => new Array(cB).fill(0));
  for (let i = 0; i < rA; i++)
    for (let j = 0; j < cB; j++)
      for (let k = 0; k < cA; k++) C[i][j] += A[i][k] * B[k][j];
  return C;
}

function matVecMul(A: Mat, v: Vec): Vec {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Invert a small square matrix using Gauss-Jordan elimination.
 * Throws if singular.
 */
function invertMatrix(M: Mat): Mat {
  const n = M.length;
  const aug: Mat = M.map((row, i) => {
    const id = new Array(n).fill(0);
    id[i] = 1;
    return [...row, ...id];
  });

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) throw new Error('Singular matrix — cannot invert');
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

// ---------------------------------------------------------------------------
// t-distribution CDF approximation (two-tailed p-value)
// Uses the regularised incomplete beta function via continued-fraction
// expansion — accurate to ~8 significant digits for typical df values.
// ---------------------------------------------------------------------------

function lnGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 1.208650973866179e-3, -5.395239384953e-6,
  ];
  let x = z, y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * Regularised incomplete beta function I_x(a,b) via continued fraction
 * (Lentz's method). Used to compute the CDF of the t-distribution.
 */
function betaIncomplete(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  // use symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) return 1 - betaIncomplete(1 - x, b, a);

  const TINY = 1e-30;
  const EPS = 1e-12;
  const MAX_ITER = 200;

  let f = TINY, c = TINY, d = 0;

  for (let m = 0; m <= MAX_ITER; m++) {
    let numerator: number;
    if (m === 0) {
      numerator = 1;
    } else {
      const m2 = 2 * m;
      if (m2 % 2 === 0) {
        // even index
        const k = m;
        numerator = (k * (b - k) * x) / ((a + m2 - 1) * (a + m2));
      } else {
        // odd index
        const k = m;
        numerator = -((a + k) * (a + b + k) * x) / ((a + m2) * (a + m2 + 1));
      }
    }

    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }

  return (front * f) / a;
}

function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * betaIncomplete(x, df / 2, 0.5);
}

function twoTailedPValue(tStat: number, df: number): number {
  return 2 * (1 - tCdf(Math.abs(tStat), df));
}

// ---------------------------------------------------------------------------
// Core OLS solver
// ---------------------------------------------------------------------------

/**
 * Run OLS regression: y = X * beta + epsilon.
 * X should already include a column of 1s for the intercept (first column).
 */
export function runOls(y: Vec, X: Mat): OlsResult {
  const n = y.length;
  const k = X[0].length; // number of coefficients (including intercept)

  if (n < k + 1) {
    throw new Error(`Not enough observations (${n}) for ${k} coefficients`);
  }

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXinv = invertMatrix(XtX);
  const Xty = matVecMul(Xt, y);
  const beta = matVecMul(XtXinv, Xty);

  // Residuals
  const yHat = matVecMul(X, beta);
  const residuals = y.map((yi, i) => yi - yHat[i]);

  // Residual sum of squares
  const ssRes = dot(residuals, residuals);
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const adjRSquared = 1 - ((1 - rSquared) * (n - 1)) / (n - k);

  // Variance of residuals
  const s2 = ssRes / (n - k);

  // Covariance matrix of coefficients
  const covBeta = XtXinv.map((row) => row.map((v) => v * s2));

  const df = n - k;
  const standardErrors = covBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));
  const tStats = beta.map((b, i) => (standardErrors[i] > 0 ? b / standardErrors[i] : 0));
  const pValues = tStats.map((t) => twoTailedPValue(t, df));

  return {
    coefficients: beta,
    standardErrors,
    tStats,
    pValues,
    rSquared,
    adjRSquared,
    nObservations: n,
  };
}

// ---------------------------------------------------------------------------
// Fama-French wrappers
// ---------------------------------------------------------------------------

/**
 * Single-factor (CAPM): Portfolio_Excess = alpha + beta1 * Mkt-RF + epsilon
 */
export function runSingleFactor(input: RegressionInput): RegressionResult {
  const n = input.portfolioReturns.length;
  const y: Vec = [];
  const X: Mat = [];

  for (let i = 0; i < n; i++) {
    y.push(input.portfolioReturns[i] - input.rf[i]);
    X.push([1, input.mktRf[i]]);
  }

  const ols = runOls(y, X);

  return {
    type: 'single',
    alpha: ols.coefficients[0] * 12,
    alphaSe: ols.standardErrors[0] * Math.sqrt(12),
    alphaPvalue: ols.pValues[0],
    betaMkt: ols.coefficients[1],
    betaMktSe: ols.standardErrors[1],
    betaMktPvalue: ols.pValues[1],
    betaSmb: null,
    betaSmbSe: null,
    betaSmbPvalue: null,
    betaHml: null,
    betaHmlSe: null,
    betaHmlPvalue: null,
    rSquared: ols.rSquared,
    adjRSquared: ols.adjRSquared,
    nObservations: ols.nObservations,
  };
}

/**
 * Multi-factor (FF3): Portfolio_Excess = alpha + b1*Mkt-RF + b2*SMB + b3*HML + epsilon
 */
export function runMultiFactor(input: RegressionInput): RegressionResult {
  const n = input.portfolioReturns.length;
  const y: Vec = [];
  const X: Mat = [];

  for (let i = 0; i < n; i++) {
    y.push(input.portfolioReturns[i] - input.rf[i]);
    X.push([1, input.mktRf[i], input.smb[i], input.hml[i]]);
  }

  const ols = runOls(y, X);

  return {
    type: 'multi',
    alpha: ols.coefficients[0] * 12,
    alphaSe: ols.standardErrors[0] * Math.sqrt(12),
    alphaPvalue: ols.pValues[0],
    betaMkt: ols.coefficients[1],
    betaMktSe: ols.standardErrors[1],
    betaMktPvalue: ols.pValues[1],
    betaSmb: ols.coefficients[2],
    betaSmbSe: ols.standardErrors[2],
    betaSmbPvalue: ols.pValues[2],
    betaHml: ols.coefficients[3],
    betaHmlSe: ols.standardErrors[3],
    betaHmlPvalue: ols.pValues[3],
    rSquared: ols.rSquared,
    adjRSquared: ols.adjRSquared,
    nObservations: ols.nObservations,
  };
}
