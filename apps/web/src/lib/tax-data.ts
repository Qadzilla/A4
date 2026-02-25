// ─── Tax Data Constants ────────────────────────────────────────────
// Federal brackets, FICA, SE, and state tax configs for 2025 & 2026.
// Data-driven: computation logic in tax-estimator-utils.ts is generic.

export type TaxFilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';

export interface TaxBracket {
  min: number;
  max: number; // Infinity for the top bracket
  rate: number; // decimal, e.g. 0.10 for 10%
}

export interface FederalYearData {
  brackets: Record<TaxFilingStatus, TaxBracket[]>;
  standardDeduction: Record<TaxFilingStatus, number>;
  ssWageBase: number;
  ssRate: number; // employee portion (6.2%)
  medicareRate: number; // 1.45%
  additionalMedicareRate: number; // 0.9%
  additionalMedicareThreshold: Record<TaxFilingStatus, number>;
  seRate: number; // 15.3% total (12.4% SS + 2.9% Medicare)
  seSSTaxRate: number; // 12.4%
  seMedicareTaxRate: number; // 2.9%
  seMultiplier: number; // 0.9235 (92.35% of SE income subject to SE tax)
  childTaxCredit: number; // per child
  saltCap: number; // TCJA $10,000 cap
}

export interface StateTaxConfig {
  type: 'none' | 'flat' | 'progressive';
  rate?: number;
  brackets?: {
    single: TaxBracket[];
    mfj?: TaxBracket[];
  };
  standardDeduction?: {
    single: number;
    mfj: number;
    mfs: number;
    hoh: number;
  };
}

// ─── Filing Status Labels ──────────────────────────────────────────

export const FILING_STATUS_LABELS: Record<TaxFilingStatus, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
  mfs: 'Married Filing Separately',
  hoh: 'Head of Household',
};

export const FILING_STATUS_OPTIONS: { value: TaxFilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
  { value: 'hoh', label: 'Head of Household' },
];

// ─── Tax Year Options ──────────────────────────────────────────────

export const TAX_YEAR_OPTIONS = [2025, 2026];

// ─── Federal Tax Data ──────────────────────────────────────────────

export const FEDERAL_TAX_DATA: Record<number, FederalYearData> = {
  2025: {
    brackets: {
      single: [
        { min: 0, max: 11925, rate: 0.1 },
        { min: 11925, max: 48475, rate: 0.12 },
        { min: 48475, max: 103350, rate: 0.22 },
        { min: 103350, max: 197300, rate: 0.24 },
        { min: 197300, max: 250525, rate: 0.32 },
        { min: 250525, max: 626350, rate: 0.35 },
        { min: 626350, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      mfj: [
        { min: 0, max: 23850, rate: 0.1 },
        { min: 23850, max: 96950, rate: 0.12 },
        { min: 96950, max: 206700, rate: 0.22 },
        { min: 206700, max: 394600, rate: 0.24 },
        { min: 394600, max: 501050, rate: 0.32 },
        { min: 501050, max: 751600, rate: 0.35 },
        { min: 751600, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      mfs: [
        { min: 0, max: 11925, rate: 0.1 },
        { min: 11925, max: 48475, rate: 0.12 },
        { min: 48475, max: 103350, rate: 0.22 },
        { min: 103350, max: 197300, rate: 0.24 },
        { min: 197300, max: 250525, rate: 0.32 },
        { min: 250525, max: 375800, rate: 0.35 },
        { min: 375800, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      hoh: [
        { min: 0, max: 17000, rate: 0.1 },
        { min: 17000, max: 64850, rate: 0.12 },
        { min: 64850, max: 103350, rate: 0.22 },
        { min: 103350, max: 197300, rate: 0.24 },
        { min: 197300, max: 250500, rate: 0.32 },
        { min: 250500, max: 626350, rate: 0.35 },
        { min: 626350, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
    },
    standardDeduction: { single: 15000, mfj: 30000, mfs: 15000, hoh: 22500 },
    ssWageBase: 176100,
    ssRate: 0.062,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
    seRate: 0.153,
    seSSTaxRate: 0.124,
    seMedicareTaxRate: 0.029,
    seMultiplier: 0.9235,
    childTaxCredit: 2000,
    saltCap: 10000,
  },
  2026: {
    brackets: {
      single: [
        { min: 0, max: 12250, rate: 0.1 },
        { min: 12250, max: 49825, rate: 0.12 },
        { min: 49825, max: 106250, rate: 0.22 },
        { min: 106250, max: 202850, rate: 0.24 },
        { min: 202850, max: 257600, rate: 0.32 },
        { min: 257600, max: 644000, rate: 0.35 },
        { min: 644000, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      mfj: [
        { min: 0, max: 24500, rate: 0.1 },
        { min: 24500, max: 99650, rate: 0.12 },
        { min: 99650, max: 212500, rate: 0.22 },
        { min: 212500, max: 405700, rate: 0.24 },
        { min: 405700, max: 515200, rate: 0.32 },
        { min: 515200, max: 772700, rate: 0.35 },
        { min: 772700, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      mfs: [
        { min: 0, max: 12250, rate: 0.1 },
        { min: 12250, max: 49825, rate: 0.12 },
        { min: 49825, max: 106250, rate: 0.22 },
        { min: 106250, max: 202850, rate: 0.24 },
        { min: 202850, max: 257600, rate: 0.32 },
        { min: 257600, max: 386350, rate: 0.35 },
        { min: 386350, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
      hoh: [
        { min: 0, max: 17500, rate: 0.1 },
        { min: 17500, max: 66700, rate: 0.12 },
        { min: 66700, max: 106250, rate: 0.22 },
        { min: 106250, max: 202850, rate: 0.24 },
        { min: 202850, max: 257600, rate: 0.32 },
        { min: 257600, max: 644000, rate: 0.35 },
        { min: 644000, max: Number.POSITIVE_INFINITY, rate: 0.37 },
      ],
    },
    standardDeduction: { single: 15400, mfj: 30800, mfs: 15400, hoh: 23150 },
    ssWageBase: 181200,
    ssRate: 0.062,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
    seRate: 0.153,
    seSSTaxRate: 0.124,
    seMedicareTaxRate: 0.029,
    seMultiplier: 0.9235,
    childTaxCredit: 2000,
    saltCap: 10000,
  },
};

// ─── State Options ─────────────────────────────────────────────────

export const STATE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No State' },
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// ─── State Tax Data ────────────────────────────────────────────────
// Keyed by year, then 2-letter state code.
// Progressive brackets are for 'single' filers; MFJ provided where materially different.

const STATES_2025: Record<string, StateTaxConfig> = {
  // ── No income tax ──
  AK: { type: 'none' },
  FL: { type: 'none' },
  NV: { type: 'none' },
  NH: { type: 'none' },
  SD: { type: 'none' },
  TN: { type: 'none' },
  TX: { type: 'none' },
  WA: { type: 'none' },
  WY: { type: 'none' },

  // ── Flat tax states ──
  AZ: { type: 'flat', rate: 0.025 },
  CO: { type: 'flat', rate: 0.044 },
  GA: { type: 'flat', rate: 0.0549 },
  ID: { type: 'flat', rate: 0.058 },
  IL: { type: 'flat', rate: 0.0495 },
  IN: { type: 'flat', rate: 0.0305 },
  KY: { type: 'flat', rate: 0.04 },
  MA: { type: 'flat', rate: 0.05 },
  MI: { type: 'flat', rate: 0.0425 },
  MS: { type: 'flat', rate: 0.05 },
  NC: { type: 'flat', rate: 0.045 },
  PA: { type: 'flat', rate: 0.0307 },
  UT: { type: 'flat', rate: 0.0465 },

  // ── Progressive tax states ──
  AL: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 500, rate: 0.02 },
        { min: 500, max: 3000, rate: 0.04 },
        { min: 3000, max: Number.POSITIVE_INFINITY, rate: 0.05 },
      ],
      mfj: [
        { min: 0, max: 1000, rate: 0.02 },
        { min: 1000, max: 6000, rate: 0.04 },
        { min: 6000, max: Number.POSITIVE_INFINITY, rate: 0.05 },
      ],
    },
    standardDeduction: { single: 3000, mfj: 8500, mfs: 3000, hoh: 3000 },
  },
  AR: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 4400, rate: 0.02 },
        { min: 4400, max: 8800, rate: 0.04 },
        { min: 8800, max: Number.POSITIVE_INFINITY, rate: 0.039 },
      ],
    },
    standardDeduction: { single: 2340, mfj: 4680, mfs: 2340, hoh: 2340 },
  },
  CA: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 10412, rate: 0.01 },
        { min: 10412, max: 24684, rate: 0.02 },
        { min: 24684, max: 38959, rate: 0.04 },
        { min: 38959, max: 54081, rate: 0.06 },
        { min: 54081, max: 68350, rate: 0.08 },
        { min: 68350, max: 349137, rate: 0.093 },
        { min: 349137, max: 418961, rate: 0.103 },
        { min: 418961, max: 698271, rate: 0.113 },
        { min: 698271, max: 1000000, rate: 0.123 },
        { min: 1000000, max: Number.POSITIVE_INFINITY, rate: 0.133 },
      ],
      mfj: [
        { min: 0, max: 20824, rate: 0.01 },
        { min: 20824, max: 49368, rate: 0.02 },
        { min: 49368, max: 77918, rate: 0.04 },
        { min: 77918, max: 108162, rate: 0.06 },
        { min: 108162, max: 136700, rate: 0.08 },
        { min: 136700, max: 698274, rate: 0.093 },
        { min: 698274, max: 837922, rate: 0.103 },
        { min: 837922, max: 1396542, rate: 0.113 },
        { min: 1396542, max: 2000000, rate: 0.123 },
        { min: 2000000, max: Number.POSITIVE_INFINITY, rate: 0.133 },
      ],
    },
    standardDeduction: { single: 5540, mfj: 11080, mfs: 5540, hoh: 11080 },
  },
  CT: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 10000, rate: 0.03 },
        { min: 10000, max: 50000, rate: 0.05 },
        { min: 50000, max: 100000, rate: 0.055 },
        { min: 100000, max: 200000, rate: 0.06 },
        { min: 200000, max: 250000, rate: 0.065 },
        { min: 250000, max: 500000, rate: 0.069 },
        { min: 500000, max: Number.POSITIVE_INFINITY, rate: 0.0699 },
      ],
    },
  },
  DE: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 2000, rate: 0.0 },
        { min: 2000, max: 5000, rate: 0.022 },
        { min: 5000, max: 10000, rate: 0.039 },
        { min: 10000, max: 20000, rate: 0.048 },
        { min: 20000, max: 25000, rate: 0.052 },
        { min: 25000, max: 60000, rate: 0.0555 },
        { min: 60000, max: Number.POSITIVE_INFINITY, rate: 0.066 },
      ],
    },
    standardDeduction: { single: 3250, mfj: 6500, mfs: 3250, hoh: 3250 },
  },
  DC: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 10000, rate: 0.04 },
        { min: 10000, max: 40000, rate: 0.06 },
        { min: 40000, max: 60000, rate: 0.065 },
        { min: 60000, max: 250000, rate: 0.085 },
        { min: 250000, max: 500000, rate: 0.0925 },
        { min: 500000, max: 1000000, rate: 0.0975 },
        { min: 1000000, max: Number.POSITIVE_INFINITY, rate: 0.1075 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  HI: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 2400, rate: 0.014 },
        { min: 2400, max: 4800, rate: 0.032 },
        { min: 4800, max: 9600, rate: 0.055 },
        { min: 9600, max: 14400, rate: 0.064 },
        { min: 14400, max: 19200, rate: 0.068 },
        { min: 19200, max: 24000, rate: 0.072 },
        { min: 24000, max: 36000, rate: 0.076 },
        { min: 36000, max: 48000, rate: 0.079 },
        { min: 48000, max: 150000, rate: 0.0825 },
        { min: 150000, max: 175000, rate: 0.09 },
        { min: 175000, max: 200000, rate: 0.1 },
        { min: 200000, max: Number.POSITIVE_INFINITY, rate: 0.11 },
      ],
    },
    standardDeduction: { single: 2200, mfj: 4400, mfs: 2200, hoh: 3212 },
  },
  IA: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 6210, rate: 0.044 },
        { min: 6210, max: 31050, rate: 0.0482 },
        { min: 31050, max: Number.POSITIVE_INFINITY, rate: 0.057 },
      ],
    },
    standardDeduction: { single: 2210, mfj: 5450, mfs: 2210, hoh: 2210 },
  },
  KS: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 15000, rate: 0.031 },
        { min: 15000, max: 30000, rate: 0.0525 },
        { min: 30000, max: Number.POSITIVE_INFINITY, rate: 0.057 },
      ],
      mfj: [
        { min: 0, max: 30000, rate: 0.031 },
        { min: 30000, max: 60000, rate: 0.0525 },
        { min: 60000, max: Number.POSITIVE_INFINITY, rate: 0.057 },
      ],
    },
    standardDeduction: { single: 3500, mfj: 8000, mfs: 3500, hoh: 3500 },
  },
  LA: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 12500, rate: 0.0185 },
        { min: 12500, max: 50000, rate: 0.035 },
        { min: 50000, max: Number.POSITIVE_INFINITY, rate: 0.0425 },
      ],
      mfj: [
        { min: 0, max: 25000, rate: 0.0185 },
        { min: 25000, max: 100000, rate: 0.035 },
        { min: 100000, max: Number.POSITIVE_INFINITY, rate: 0.0425 },
      ],
    },
  },
  ME: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 26050, rate: 0.058 },
        { min: 26050, max: 61600, rate: 0.0675 },
        { min: 61600, max: Number.POSITIVE_INFINITY, rate: 0.0715 },
      ],
      mfj: [
        { min: 0, max: 52100, rate: 0.058 },
        { min: 52100, max: 123200, rate: 0.0675 },
        { min: 123200, max: Number.POSITIVE_INFINITY, rate: 0.0715 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  MD: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 1000, rate: 0.02 },
        { min: 1000, max: 2000, rate: 0.03 },
        { min: 2000, max: 3000, rate: 0.04 },
        { min: 3000, max: 100000, rate: 0.0475 },
        { min: 100000, max: 125000, rate: 0.05 },
        { min: 125000, max: 150000, rate: 0.0525 },
        { min: 150000, max: 250000, rate: 0.055 },
        { min: 250000, max: Number.POSITIVE_INFINITY, rate: 0.0575 },
      ],
    },
    standardDeduction: { single: 2550, mfj: 5150, mfs: 2550, hoh: 2550 },
  },
  MN: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 31690, rate: 0.0535 },
        { min: 31690, max: 104090, rate: 0.068 },
        { min: 104090, max: 193240, rate: 0.0785 },
        { min: 193240, max: Number.POSITIVE_INFINITY, rate: 0.0985 },
      ],
      mfj: [
        { min: 0, max: 46330, rate: 0.0535 },
        { min: 46330, max: 184040, rate: 0.068 },
        { min: 184040, max: 321450, rate: 0.0785 },
        { min: 321450, max: Number.POSITIVE_INFINITY, rate: 0.0985 },
      ],
    },
    standardDeduction: { single: 14575, mfj: 29150, mfs: 14575, hoh: 21850 },
  },
  MO: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 1207, rate: 0.02 },
        { min: 1207, max: 2414, rate: 0.025 },
        { min: 2414, max: 3621, rate: 0.03 },
        { min: 3621, max: 4828, rate: 0.035 },
        { min: 4828, max: 6035, rate: 0.04 },
        { min: 6035, max: 7242, rate: 0.045 },
        { min: 7242, max: Number.POSITIVE_INFINITY, rate: 0.048 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  MT: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 20500, rate: 0.047 },
        { min: 20500, max: Number.POSITIVE_INFINITY, rate: 0.059 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  NE: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 3700, rate: 0.0246 },
        { min: 3700, max: 22170, rate: 0.0351 },
        { min: 22170, max: 35730, rate: 0.0501 },
        { min: 35730, max: Number.POSITIVE_INFINITY, rate: 0.0584 },
      ],
      mfj: [
        { min: 0, max: 7390, rate: 0.0246 },
        { min: 7390, max: 44350, rate: 0.0351 },
        { min: 44350, max: 71460, rate: 0.0501 },
        { min: 71460, max: Number.POSITIVE_INFINITY, rate: 0.0584 },
      ],
    },
    standardDeduction: { single: 7900, mfj: 15800, mfs: 7900, hoh: 11600 },
  },
  NJ: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 20000, rate: 0.014 },
        { min: 20000, max: 35000, rate: 0.0175 },
        { min: 35000, max: 40000, rate: 0.035 },
        { min: 40000, max: 75000, rate: 0.05525 },
        { min: 75000, max: 500000, rate: 0.0637 },
        { min: 500000, max: 1000000, rate: 0.0897 },
        { min: 1000000, max: Number.POSITIVE_INFINITY, rate: 0.1075 },
      ],
      mfj: [
        { min: 0, max: 20000, rate: 0.014 },
        { min: 20000, max: 50000, rate: 0.0175 },
        { min: 50000, max: 70000, rate: 0.0245 },
        { min: 70000, max: 80000, rate: 0.035 },
        { min: 80000, max: 150000, rate: 0.05525 },
        { min: 150000, max: 500000, rate: 0.0637 },
        { min: 500000, max: 1000000, rate: 0.0897 },
        { min: 1000000, max: Number.POSITIVE_INFINITY, rate: 0.1075 },
      ],
    },
  },
  NM: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 5500, rate: 0.017 },
        { min: 5500, max: 11000, rate: 0.032 },
        { min: 11000, max: 16000, rate: 0.047 },
        { min: 16000, max: 210000, rate: 0.049 },
        { min: 210000, max: Number.POSITIVE_INFINITY, rate: 0.059 },
      ],
      mfj: [
        { min: 0, max: 8000, rate: 0.017 },
        { min: 8000, max: 16000, rate: 0.032 },
        { min: 16000, max: 24000, rate: 0.047 },
        { min: 24000, max: 315000, rate: 0.049 },
        { min: 315000, max: Number.POSITIVE_INFINITY, rate: 0.059 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  NY: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 8500, rate: 0.04 },
        { min: 8500, max: 11700, rate: 0.045 },
        { min: 11700, max: 13900, rate: 0.0525 },
        { min: 13900, max: 80650, rate: 0.055 },
        { min: 80650, max: 215400, rate: 0.06 },
        { min: 215400, max: 1077550, rate: 0.0685 },
        { min: 1077550, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
      mfj: [
        { min: 0, max: 17150, rate: 0.04 },
        { min: 17150, max: 23600, rate: 0.045 },
        { min: 23600, max: 27900, rate: 0.0525 },
        { min: 27900, max: 161550, rate: 0.055 },
        { min: 161550, max: 323200, rate: 0.06 },
        { min: 323200, max: 2155350, rate: 0.0685 },
        { min: 2155350, max: 5000000, rate: 0.0965 },
        { min: 5000000, max: 25000000, rate: 0.103 },
        { min: 25000000, max: Number.POSITIVE_INFINITY, rate: 0.109 },
      ],
    },
    standardDeduction: { single: 8000, mfj: 16050, mfs: 8000, hoh: 11200 },
  },
  ND: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 44725, rate: 0.0 },
        { min: 44725, max: 225975, rate: 0.0195 },
        { min: 225975, max: Number.POSITIVE_INFINITY, rate: 0.025 },
      ],
    },
  },
  OH: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 26050, rate: 0.0 },
        { min: 26050, max: 100000, rate: 0.0275 },
        { min: 100000, max: Number.POSITIVE_INFINITY, rate: 0.035 },
      ],
    },
  },
  OK: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 1000, rate: 0.0025 },
        { min: 1000, max: 2500, rate: 0.0075 },
        { min: 2500, max: 3750, rate: 0.0175 },
        { min: 3750, max: 4900, rate: 0.0275 },
        { min: 4900, max: 7200, rate: 0.0375 },
        { min: 7200, max: Number.POSITIVE_INFINITY, rate: 0.0475 },
      ],
      mfj: [
        { min: 0, max: 2000, rate: 0.0025 },
        { min: 2000, max: 5000, rate: 0.0075 },
        { min: 5000, max: 7500, rate: 0.0175 },
        { min: 7500, max: 9800, rate: 0.0275 },
        { min: 9800, max: 12200, rate: 0.0375 },
        { min: 12200, max: Number.POSITIVE_INFINITY, rate: 0.0475 },
      ],
    },
    standardDeduction: { single: 6350, mfj: 12700, mfs: 6350, hoh: 9350 },
  },
  OR: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 4050, rate: 0.0475 },
        { min: 4050, max: 10200, rate: 0.0675 },
        { min: 10200, max: 125000, rate: 0.0875 },
        { min: 125000, max: Number.POSITIVE_INFINITY, rate: 0.099 },
      ],
      mfj: [
        { min: 0, max: 8100, rate: 0.0475 },
        { min: 8100, max: 20400, rate: 0.0675 },
        { min: 20400, max: 250000, rate: 0.0875 },
        { min: 250000, max: Number.POSITIVE_INFINITY, rate: 0.099 },
      ],
    },
    standardDeduction: { single: 2745, mfj: 5495, mfs: 2745, hoh: 4420 },
  },
  RI: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 73450, rate: 0.0375 },
        { min: 73450, max: 166950, rate: 0.0475 },
        { min: 166950, max: Number.POSITIVE_INFINITY, rate: 0.0599 },
      ],
    },
    standardDeduction: { single: 10550, mfj: 21150, mfs: 10550, hoh: 15825 },
  },
  SC: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 3460, rate: 0.0 },
        { min: 3460, max: 17330, rate: 0.03 },
        { min: 17330, max: Number.POSITIVE_INFINITY, rate: 0.062 },
      ],
    },
    standardDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900 },
  },
  VT: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 45400, rate: 0.0335 },
        { min: 45400, max: 110050, rate: 0.066 },
        { min: 110050, max: 229550, rate: 0.076 },
        { min: 229550, max: Number.POSITIVE_INFINITY, rate: 0.0875 },
      ],
      mfj: [
        { min: 0, max: 75850, rate: 0.0335 },
        { min: 75850, max: 183600, rate: 0.066 },
        { min: 183600, max: 279450, rate: 0.076 },
        { min: 279450, max: Number.POSITIVE_INFINITY, rate: 0.0875 },
      ],
    },
    standardDeduction: { single: 7000, mfj: 14600, mfs: 7000, hoh: 10700 },
  },
  VA: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 3000, rate: 0.02 },
        { min: 3000, max: 5000, rate: 0.03 },
        { min: 5000, max: 17000, rate: 0.05 },
        { min: 17000, max: Number.POSITIVE_INFINITY, rate: 0.0575 },
      ],
    },
    standardDeduction: { single: 8000, mfj: 16000, mfs: 8000, hoh: 8000 },
  },
  WI: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 14320, rate: 0.035 },
        { min: 14320, max: 28640, rate: 0.044 },
        { min: 28640, max: 315310, rate: 0.053 },
        { min: 315310, max: Number.POSITIVE_INFINITY, rate: 0.0765 },
      ],
      mfj: [
        { min: 0, max: 19090, rate: 0.035 },
        { min: 19090, max: 38190, rate: 0.044 },
        { min: 38190, max: 420420, rate: 0.053 },
        { min: 420420, max: Number.POSITIVE_INFINITY, rate: 0.0765 },
      ],
    },
    standardDeduction: { single: 12760, mfj: 23620, mfs: 12760, hoh: 16320 },
  },
  WV: {
    type: 'progressive',
    brackets: {
      single: [
        { min: 0, max: 10000, rate: 0.0236 },
        { min: 10000, max: 25000, rate: 0.0315 },
        { min: 25000, max: 40000, rate: 0.0354 },
        { min: 40000, max: 60000, rate: 0.0472 },
        { min: 60000, max: Number.POSITIVE_INFINITY, rate: 0.0512 },
      ],
    },
  },
};

// 2026 uses the same state configs as 2025 (states update independently)
const STATES_2026: Record<string, StateTaxConfig> = { ...STATES_2025 };

export const STATE_TAX_DATA: Record<number, Record<string, StateTaxConfig>> = {
  2025: STATES_2025,
  2026: STATES_2026,
};
