import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CheckCircle,
  Copy,
  Info,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/fee-estimator")({
  head: () => ({ meta: [{ title: "Fee Estimator — PracticeOS" }] }),
  component: FeeEstimatorPage,
});

type EntityType =
  | "Individual"
  | "Proprietorship"
  | "Partnership"
  | "LLP"
  | "Pvt Ltd"
  | "Public Ltd"
  | "Trust / NGO"
  | "HUF";
type ServiceGroup =
  | "GST Compliance"
  | "Income Tax"
  | "Audit"
  | "ROC / Company"
  | "Advisory";
type TurnoverBand =
  | "Below ₹10L"
  | "₹10L - ₹25L"
  | "₹25L - ₹1Cr"
  | "₹1Cr - ₹5Cr"
  | "₹5Cr - ₹10Cr"
  | "₹10Cr - ₹50Cr"
  | "₹50Cr - ₹100Cr"
  | "Above ₹100Cr";
type TransactionVolume = "Low" | "Medium" | "High" | "Very High";
type ComplexityLevel = "Simple" | "Medium" | "Complex";
type CityTier = "Metro" | "Tier-1" | "Tier-2" | "Tier-3";
type ExperienceBand = "0-2 yrs" | "2-5 yrs" | "5-10 yrs" | "10+ yrs";

type FeeForm = {
  serviceGroup: ServiceGroup;
  serviceType: string;
  entityType: EntityType;
  turnoverBand: TurnoverBand;
  transactionVolume: TransactionVolume;
  complexity: ComplexityLevel;
  cityTier: CityTier;
  experience: ExperienceBand;
  foreignTransactions: boolean;
  relatedParty: boolean;
  priorLitigation: boolean;
  messyBooks: boolean;
  multipleGstin: boolean;
  urgentDeadline: boolean;
};

type PriceRange = { min: number; max: number };
type PricingFactor = { label: string; value: number; direction: "up" | "down" };
type EligibilityAlert = { type: "warning" | "info" | "success"; title: string; message: string };

const FLAT_FEE_SERVICES = new Set([
  "GST LUT Filing", "GST Registration", "Form 16 / 16A",
  "Board Meeting / Minutes", "DIR / KYC Compliance", "Company Incorporation",
]);

const NO_VOLUME_SERVICES = new Set([
  "GST LUT Filing", "GST Registration", "Form 16 / 16A",
  "Board Meeting / Minutes", "DIR / KYC Compliance", "Company Incorporation",
  "Annual ROC Filing", "LLP Compliance", "Tax Planning", "Business Valuation",
  "Due Diligence", "CFO Advisory", "Startup Advisory", "FEMA / RBI Advisory",
  "ESOP / Payroll Advisory",
]);

const NO_COMPLEXITY_SERVICES = new Set([
  "GST LUT Filing", "GST Registration", "Form 16 / 16A",
  "Board Meeting / Minutes", "DIR / KYC Compliance", "Company Incorporation",
  "TDS Return Filing",
]);

const NO_TURNOVER_SERVICES = new Set([
  "GST LUT Filing", "Form 16 / 16A", "Board Meeting / Minutes",
  "DIR / KYC Compliance", "Company Incorporation",
]);

const AUDIT_FEE_SERVICES = new Set([
  "Tax Audit", "Statutory Audit", "Internal Audit", "GST Audit",
  "Stock Audit", "Bank Audit", "Branch Audit", "Secretarial Audit",
]);

const SERVICE_GROUPS: Record<ServiceGroup, string[]> = {
  "GST Compliance": [
    "GST Registration", "GST Return Filing", "GST Annual Return",
    "GST LUT Filing", "GST Amendment / Correction", "GST Refund",
  ],
  "Income Tax": [
    "ITR Filing", "Tax Audit", "TDS Return Filing",
    "Form 16 / 16A", "Tax Notice Reply", "Tax Planning",
  ],
  "Audit": [
    "Statutory Audit", "Internal Audit", "GST Audit",
    "Stock Audit", "Bank Audit", "Branch Audit",
  ],
  "ROC / Company": [
    "Company Incorporation", "Annual ROC Filing", "Board Meeting / Minutes",
    "Secretarial Audit", "LLP Compliance", "DIR / KYC Compliance",
  ],
  "Advisory": [
    "Business Valuation", "Due Diligence", "CFO Advisory",
    "Startup Advisory", "FEMA / RBI Advisory", "ESOP / Payroll Advisory",
  ],
};

const ENTITY_TYPES: EntityType[] = [
  "Individual", "Proprietorship", "Partnership", "LLP",
  "Pvt Ltd", "Public Ltd", "Trust / NGO", "HUF",
];

const TURNOVER_OPTIONS: TurnoverBand[] = [
  "Below ₹10L", "₹10L - ₹25L", "₹25L - ₹1Cr", "₹1Cr - ₹5Cr",
  "₹5Cr - ₹10Cr", "₹10Cr - ₹50Cr", "₹50Cr - ₹100Cr", "Above ₹100Cr",
];

const TRANSACTION_VOLUME_OPTIONS: TransactionVolume[] = ["Low", "Medium", "High", "Very High"];
const COMPLEXITY_OPTIONS: ComplexityLevel[] = ["Simple", "Medium", "Complex"];
const CITY_OPTIONS: CityTier[] = ["Metro", "Tier-1", "Tier-2", "Tier-3"];
const EXPERIENCE_OPTIONS: ExperienceBand[] = ["0-2 yrs", "2-5 yrs", "5-10 yrs", "10+ yrs"];

const FACTOR_OPTIONS = [
  { key: "foreignTransactions", label: "Foreign transactions", effect: 1.15 },
  { key: "relatedParty", label: "Related party", effect: 1.14 },
  { key: "priorLitigation", label: "Prior litigation", effect: 1.18 },
  { key: "messyBooks", label: "Messy books", effect: 1.2 },
  { key: "multipleGstin", label: "Multiple GSTINs", effect: 1.12 },
  { key: "urgentDeadline", label: "Urgent deadline", effect: 1.2 },
] as const;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

const TURNOVER_SCALE: Record<TurnoverBand, number> = {
  "Below ₹10L": 1, "₹10L - ₹25L": 1.2, "₹25L - ₹1Cr": 1.5,
  "₹1Cr - ₹5Cr": 2, "₹5Cr - ₹10Cr": 2.8, "₹10Cr - ₹50Cr": 4,
  "₹50Cr - ₹100Cr": 6, "Above ₹100Cr": 8,
};

const AUDIT_TURNOVER_SCALE: Record<TurnoverBand, number> = {
  "Below ₹10L": 1, "₹10L - ₹25L": 1.25, "₹25L - ₹1Cr": 1.6,
  "₹1Cr - ₹5Cr": 2.7, "₹5Cr - ₹10Cr": 4.8, "₹10Cr - ₹50Cr": 7.5,
  "₹50Cr - ₹100Cr": 11, "Above ₹100Cr": 15,
};

const buildFlatTurnoverRange = (min: number, max: number): Record<TurnoverBand, PriceRange> =>
  TURNOVER_OPTIONS.reduce((acc, band) => { acc[band] = { min, max }; return acc; }, {} as Record<TurnoverBand, PriceRange>);

const buildProgressiveRange = (
  min: number, max: number,
  scale: Record<TurnoverBand, number> = TURNOVER_SCALE,
): Record<TurnoverBand, PriceRange> =>
  TURNOVER_OPTIONS.reduce((acc, band) => {
    acc[band] = { min: Math.round(min * scale[band]), max: Math.round(max * scale[band]) };
    return acc;
  }, {} as Record<TurnoverBand, PriceRange>);

const SERVICE_BASE_RATES: Record<string, Record<EntityType, [number, number]>> = {
  "GST Registration": {
    Individual: [2000, 5000], Proprietorship: [2200, 5500], Partnership: [2500, 6000],
    LLP: [3000, 7500], "Pvt Ltd": [3500, 9000], "Public Ltd": [4500, 12000],
    "Trust / NGO": [2600, 6500], HUF: [2000, 5000],
  },
  "GST Return Filing": {
    Individual: [1500, 4000], Proprietorship: [1800, 4500], Partnership: [2500, 6500],
    LLP: [3000, 7500], "Pvt Ltd": [3500, 9000], "Public Ltd": [4200, 10000],
    "Trust / NGO": [2200, 5500], HUF: [1500, 4000],
  },
  "GST Annual Return": {
    Individual: [5000, 15000], Proprietorship: [5500, 16000], Partnership: [6500, 18000],
    LLP: [7000, 20000], "Pvt Ltd": [9000, 25000], "Public Ltd": [11000, 30000],
    "Trust / NGO": [5500, 16000], HUF: [5000, 15000],
  },
  "GST LUT Filing": {
    Individual: [1000, 3000], Proprietorship: [1000, 3000], Partnership: [1000, 3000],
    LLP: [1000, 3000], "Pvt Ltd": [1000, 3000], "Public Ltd": [1000, 3000],
    "Trust / NGO": [1000, 3000], HUF: [1000, 3000],
  },
  "GST Amendment / Correction": {
    Individual: [1500, 5000], Proprietorship: [1800, 5500], Partnership: [2000, 6000],
    LLP: [2200, 7000], "Pvt Ltd": [2600, 8000], "Public Ltd": [3000, 9000],
    "Trust / NGO": [1800, 6000], HUF: [1500, 5000],
  },
  "GST Refund": {
    Individual: [15000, 50000], Proprietorship: [18000, 55000], Partnership: [22000, 60000],
    LLP: [25000, 70000], "Pvt Ltd": [30000, 85000], "Public Ltd": [35000, 95000],
    "Trust / NGO": [20000, 60000], HUF: [15000, 50000],
  },
  "ITR Filing": {
    Individual: [1000, 2500], Proprietorship: [4000, 10000], Partnership: [8000, 20000],
    LLP: [9000, 22000], "Pvt Ltd": [12000, 30000], "Public Ltd": [18000, 40000],
    "Trust / NGO": [8000, 25000], HUF: [3000, 8000],
  },
  "Tax Audit": {
    Individual: [15000, 30000], Proprietorship: [17000, 34000], Partnership: [20000, 40000],
    LLP: [22000, 45000], "Pvt Ltd": [25000, 50000], "Public Ltd": [30000, 60000],
    "Trust / NGO": [12000, 25000], HUF: [12000, 25000],
  },
  "TDS Return Filing": {
    Individual: [2000, 5000], Proprietorship: [3000, 8000], Partnership: [5000, 12000],
    LLP: [5500, 13000], "Pvt Ltd": [6000, 15000], "Public Ltd": [7000, 17000],
    "Trust / NGO": [3500, 8500], HUF: [2000, 5000],
  },
  "Form 16 / 16A": {
    Individual: [1500, 4000], Proprietorship: [1500, 4000], Partnership: [1500, 4000],
    LLP: [1500, 4000], "Pvt Ltd": [1500, 4000], "Public Ltd": [1500, 4000],
    "Trust / NGO": [1500, 4000], HUF: [1500, 4000],
  },
  "Tax Notice Reply": {
    Individual: [5000, 15000], Proprietorship: [6000, 18000], Partnership: [15000, 50000],
    LLP: [18000, 55000], "Pvt Ltd": [20000, 65000], "Public Ltd": [22000, 70000],
    "Trust / NGO": [6000, 18000], HUF: [5000, 15000],
  },
  "Tax Planning": {
    Individual: [5000, 15000], Proprietorship: [12000, 35000], Partnership: [15000, 50000],
    LLP: [16000, 50000], "Pvt Ltd": [18000, 60000], "Public Ltd": [20000, 65000],
    "Trust / NGO": [12000, 35000], HUF: [5000, 15000],
  },
  "Statutory Audit": {
    Individual: [35000, 75000], Proprietorship: [38000, 80000], Partnership: [42000, 90000],
    LLP: [45000, 95000], "Pvt Ltd": [52000, 110000], "Public Ltd": [60000, 125000],
    "Trust / NGO": [28000, 65000], HUF: [30000, 70000],
  },
  "Internal Audit": {
    Individual: [50000, 100000], Proprietorship: [55000, 110000], Partnership: [100000, 250000],
    LLP: [110000, 280000], "Pvt Ltd": [200000, 500000], "Public Ltd": [220000, 600000],
    "Trust / NGO": [50000, 100000], HUF: [50000, 100000],
  },
  "GST Audit": {
    Individual: [15000, 30000], Proprietorship: [17000, 34000], Partnership: [20000, 40000],
    LLP: [22000, 45000], "Pvt Ltd": [25000, 50000], "Public Ltd": [30000, 60000],
    "Trust / NGO": [12000, 25000], HUF: [12000, 25000],
  },
  "Stock Audit": {
    Individual: [15000, 50000], Proprietorship: [17000, 55000], Partnership: [20000, 60000],
    LLP: [22000, 65000], "Pvt Ltd": [25000, 75000], "Public Ltd": [30000, 90000],
    "Trust / NGO": [18000, 55000], HUF: [15000, 50000],
  },
  "Bank Audit": {
    Individual: [20000, 65000], Proprietorship: [22000, 70000], Partnership: [25000, 80000],
    LLP: [28000, 85000], "Pvt Ltd": [32000, 100000], "Public Ltd": [37000, 120000],
    "Trust / NGO": [22000, 70000], HUF: [20000, 65000],
  },
  "Branch Audit": {
    Individual: [15000, 50000], Proprietorship: [17000, 55000], Partnership: [20000, 60000],
    LLP: [22000, 65000], "Pvt Ltd": [25000, 75000], "Public Ltd": [30000, 90000],
    "Trust / NGO": [18000, 55000], HUF: [15000, 50000],
  },
  "Company Incorporation": {
    Individual: [6000, 15000], Proprietorship: [6500, 16000], Partnership: [8000, 20000],
    LLP: [10000, 25000], "Pvt Ltd": [12000, 30000], "Public Ltd": [14000, 35000],
    "Trust / NGO": [15000, 40000], HUF: [6000, 15000],
  },
  "Annual ROC Filing": {
    Individual: [5000, 12000], Proprietorship: [5500, 13000], Partnership: [8000, 20000],
    LLP: [10000, 25000], "Pvt Ltd": [12000, 30000], "Public Ltd": [18000, 45000],
    "Trust / NGO": [5500, 13000], HUF: [5000, 12000],
  },
  "Board Meeting / Minutes": {
    Individual: [3000, 10000], Proprietorship: [3000, 10000], Partnership: [3000, 10000],
    LLP: [3000, 10000], "Pvt Ltd": [3000, 10000], "Public Ltd": [3000, 10000],
    "Trust / NGO": [3000, 10000], HUF: [3000, 10000],
  },
  "Secretarial Audit": {
    Individual: [30000, 100000], Proprietorship: [35000, 110000], Partnership: [40000, 120000],
    LLP: [45000, 130000], "Pvt Ltd": [50000, 150000], "Public Ltd": [60000, 180000],
    "Trust / NGO": [30000, 100000], HUF: [30000, 100000],
  },
  "LLP Compliance": {
    Individual: [8000, 25000], Proprietorship: [9000, 26000], Partnership: [10000, 30000],
    LLP: [12000, 35000], "Pvt Ltd": [15000, 42000], "Public Ltd": [17000, 48000],
    "Trust / NGO": [10000, 30000], HUF: [8000, 25000],
  },
  "DIR / KYC Compliance": {
    Individual: [750, 2000], Proprietorship: [750, 2000], Partnership: [750, 2000],
    LLP: [750, 2000], "Pvt Ltd": [750, 2000], "Public Ltd": [750, 2000],
    "Trust / NGO": [750, 2000], HUF: [750, 2000],
  },
  "Business Valuation": {
    Individual: [15000, 30000], Proprietorship: [17000, 35000], Partnership: [20000, 40000],
    LLP: [22000, 45000], "Pvt Ltd": [30000, 60000], "Public Ltd": [35000, 70000],
    "Trust / NGO": [17000, 35000], HUF: [15000, 30000],
  },
  "Due Diligence": {
    Individual: [50000, 100000], Proprietorship: [60000, 120000], Partnership: [75000, 150000],
    LLP: [80000, 160000], "Pvt Ltd": [100000, 200000], "Public Ltd": [120000, 250000],
    "Trust / NGO": [60000, 120000], HUF: [50000, 100000],
  },
  "CFO Advisory": {
    Individual: [25000, 100000], Proprietorship: [28000, 110000], Partnership: [35000, 140000],
    LLP: [40000, 160000], "Pvt Ltd": [50000, 200000], "Public Ltd": [60000, 240000],
    "Trust / NGO": [30000, 120000], HUF: [25000, 100000],
  },
  "Startup Advisory": {
    Individual: [15000, 50000], Proprietorship: [18000, 60000], Partnership: [22000, 70000],
    LLP: [26000, 80000], "Pvt Ltd": [30000, 100000], "Public Ltd": [35000, 120000],
    "Trust / NGO": [18000, 60000], HUF: [15000, 50000],
  },
  "FEMA / RBI Advisory": {
    Individual: [20000, 75000], Proprietorship: [22000, 80000], Partnership: [25000, 90000],
    LLP: [30000, 100000], "Pvt Ltd": [35000, 120000], "Public Ltd": [42000, 150000],
    "Trust / NGO": [22000, 80000], HUF: [20000, 75000],
  },
  "ESOP / Payroll Advisory": {
    Individual: [15000, 50000], Proprietorship: [17000, 55000], Partnership: [22000, 70000],
    LLP: [26000, 80000], "Pvt Ltd": [30000, 100000], "Public Ltd": [35000, 120000],
    "Trust / NGO": [18000, 60000], HUF: [15000, 50000],
  },
};

const FEE_DATA: Record<string, Record<string, Record<TurnoverBand, PriceRange>>> =
  Object.fromEntries(
    Object.entries(SERVICE_BASE_RATES).map(([service, entityRates]) => [
      service,
      Object.fromEntries(
        Object.entries(entityRates).map(([entity, [min, max]]) => [
          entity,
          FLAT_FEE_SERVICES.has(service)
            ? buildFlatTurnoverRange(min, max)
            : buildProgressiveRange(
                min, max,
                AUDIT_FEE_SERVICES.has(service) ? AUDIT_TURNOVER_SCALE : TURNOVER_SCALE,
              ),
        ]),
      ),
    ]),
  );

const getFeeRange = (serviceType: string, entityType: EntityType, turnoverBand: TurnoverBand): PriceRange =>
  FEE_DATA[serviceType]?.[entityType]?.[turnoverBand] ?? { min: 3000, max: 12000 };

const getMultipliers = (form: FeeForm) => {
  const showVolume = !NO_VOLUME_SERVICES.has(form.serviceType);
  const showComplexity = !NO_COMPLEXITY_SERVICES.has(form.serviceType);

  const volumeMultiplier: Record<TransactionVolume, number> = { Low: 0.9, Medium: 1, High: 1.18, "Very High": 1.35 };
  const complexityMultiplier: Record<ComplexityLevel, number> = { Simple: 0.88, Medium: 1, Complex: 1.26 };
  const cityMultiplier: Record<CityTier, number> = { Metro: 1.22, "Tier-1": 1.12, "Tier-2": 1, "Tier-3": 0.92 };
  const experienceMultiplier: Record<ExperienceBand, number> = { "0-2 yrs": 0.92, "2-5 yrs": 1, "5-10 yrs": 1.12, "10+ yrs": 1.22 };

  let factor = 1;
  for (const item of FACTOR_OPTIONS) {
    if (form[item.key as keyof FeeForm] === true) factor *= item.effect;
  }

  const baseMultiplier =
    (showVolume ? volumeMultiplier[form.transactionVolume] : 1) *
    (showComplexity ? complexityMultiplier[form.complexity] : 1) *
    cityMultiplier[form.cityTier] *
    experienceMultiplier[form.experience] *
    factor;

  return { baseMultiplier };
};

const getEligibilityAlerts = (
  serviceType: string,
  entityType: EntityType,
  turnoverBand: TurnoverBand,
): EligibilityAlert[] => {
  const alerts: EligibilityAlert[] = [];
  const highTurnover = ["₹5Cr - ₹10Cr", "₹10Cr - ₹50Cr", "₹50Cr - ₹100Cr", "Above ₹100Cr"].includes(turnoverBand);
  const aboveTwoCr = ["₹1Cr - ₹5Cr", "₹5Cr - ₹10Cr", "₹10Cr - ₹50Cr", "₹50Cr - ₹100Cr", "Above ₹100Cr"].includes(turnoverBand);
  const aboveTwentyL = turnoverBand !== "Below ₹10L";
  const isCompanyLLP = ["Pvt Ltd", "Public Ltd", "LLP"].includes(entityType);
  const isBusinessEntity = !["Individual", "HUF", "Trust / NGO"].includes(entityType);

  if (serviceType === "GST Registration") {
    if (!aboveTwentyL && isBusinessEntity) {
      alerts.push({
        type: "info",
        title: "GST Registration may not be mandatory",
        message: "Turnover below ₹10L is likely under the GST threshold (₹20L for services, ₹40L for goods). Voluntary registration may still be advisable for ITC benefits.",
      });
    } else if (aboveTwentyL) {
      alerts.push({
        type: "success",
        title: "GST Registration applicable",
        message: "Turnover above threshold — GST registration is mandatory. Penalty for non-registration: 10% of tax due (min ₹10,000) or 100% if intentional fraud.",
      });
    }
  }

  if (serviceType === "GST Return Filing" || serviceType === "GST Annual Return") {
    if (highTurnover && isBusinessEntity) {
      alerts.push({
        type: "warning",
        title: "⚡ E-Invoicing mandatory",
        message: "Turnover above ₹5 Cr — E-invoicing is mandatory under GST. Non-compliance means invoices are invalid for ITC claim. Penalty: ₹10,000 per invoice or 100% of tax, whichever is higher.",
      });
    } else if (aboveTwoCr && isBusinessEntity) {
      alerts.push({
        type: "info",
        title: "E-Invoicing — verify threshold",
        message: "Turnover between ₹1–5 Cr: verify if client's aggregate turnover exceeded ₹5 Cr in any previous FY. If yes, e-invoicing is mandatory.",
      });
    }
  }

  if (serviceType === "Tax Audit" && !aboveTwoCr && entityType === "Individual") {
    alerts.push({
      type: "info",
      title: "Tax Audit may not be applicable",
      message: "For individuals, tax audit is mandatory only if business turnover exceeds ₹1 Cr (or ₹10 Cr if 95%+ transactions are digital). Verify before engagement.",
    });
  }

  if (serviceType === "GST Annual Return" && !aboveTwoCr) {
    alerts.push({
      type: "success",
      title: "GSTR-9 filing may be optional",
      message: "Taxpayers with aggregate turnover up to ₹2 Cr are exempt from mandatory GSTR-9 filing. Filing is still recommended for reconciliation.",
    });
  }

  if (serviceType === "Secretarial Audit" && !isCompanyLLP) {
    alerts.push({
      type: "info",
      title: "Secretarial Audit — entity check",
      message: "Mandatory only for listed companies, companies with paid-up capital ≥ ₹50 Cr, or turnover ≥ ₹250 Cr.",
    });
  }

  return alerts;
};

const getFallbackReasoning = (form: FeeForm, range: PriceRange, recommendedFee: number) => {
  const selectedFactors = FACTOR_OPTIONS.filter((o) => form[o.key as keyof FeeForm] === true).map((o) => o.label);
  const factorText = selectedFactors.length ? selectedFactors.join(", ") : "standard scope";
  return `This estimate for ${form.serviceType} for a ${form.entityType} entity is priced within a typical range of ${formatCurrency(range.min)} to ${formatCurrency(range.max)}. The recommended engagement fee of ${formatCurrency(recommendedFee)} reflects the turnover band, city tier, and professional experience level. Additional factors such as ${factorText} can materially affect the final fee. GST is charged separately at 18% where applicable.`;
};

async function getGroqReasoning(form: FeeForm, range: PriceRange, recommendedFee: number): Promise<string> {
  const prompt = `You are a senior CA pricing advisor. Explain the pricing logic for this engagement in a concise but professional, client-friendly style. Use Indian CA firm context. Keep the response under 180 words, no markdown tables. Use the inputs below to justify the estimate. Inputs: serviceType=${form.serviceType}; entityType=${form.entityType}; turnoverBand=${form.turnoverBand}; transactionVolume=${form.transactionVolume}; complexity=${form.complexity}; cityTier=${form.cityTier}; experience=${form.experience}; foreignTransactions=${form.foreignTransactions}; relatedParty=${form.relatedParty}; priorLitigation=${form.priorLitigation}; messyBooks=${form.messyBooks}; multipleGstin=${form.multipleGstin}; urgentDeadline=${form.urgentDeadline}; priceRange=${range.min}-${range.max}; recommendedFee=${recommendedFee}.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer GROQ_API_KEY_PLACEHOLDER`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Groq error ${response.status}`);
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return text.trim() || getFallbackReasoning(form, range, recommendedFee);
  } catch {
    return getFallbackReasoning(form, range, recommendedFee);
  }
}

function FeeEstimatorPage() {
  const [form, setForm] = useState<FeeForm>({
    serviceGroup: "GST Compliance",
    serviceType: "GST Registration",
    entityType: "Proprietorship",
    turnoverBand: "₹1Cr - ₹5Cr",
    transactionVolume: "Medium",
    complexity: "Medium",
    cityTier: "Tier-1",
    experience: "2-5 yrs",
    foreignTransactions: false,
    relatedParty: false,
    priorLitigation: false,
    messyBooks: false,
    multipleGstin: false,
    urgentDeadline: false,
  });

  const [reasoning, setReasoning] = useState<string>("");
  const [isLoadingReasoning, setIsLoadingReasoning] = useState(false);
  const [copyState, setCopyState] = useState<string>("Copy details");
  const [showResult, setShowResult] = useState(false);

  const showVolume = !NO_VOLUME_SERVICES.has(form.serviceType);
  const showComplexity = !NO_COMPLEXITY_SERVICES.has(form.serviceType);
  const showTurnover = !NO_TURNOVER_SERVICES.has(form.serviceType);

  const availableServices = useMemo(
    () => SERVICE_GROUPS[form.serviceGroup] ?? SERVICE_GROUPS["GST Compliance"],
    [form.serviceGroup],
  );

  const range = useMemo(
    () => getFeeRange(form.serviceType, form.entityType, form.turnoverBand),
    [form.serviceType, form.entityType, form.turnoverBand],
  );

  const { baseMultiplier } = getMultipliers(form);

  const computedFee = useMemo(() => {
    const min = Math.round(range.min * baseMultiplier);
    const max = Math.round(range.max * baseMultiplier);
    const recommended = Math.round((min + max) / 2);
    return { min, max, recommended };
  }, [baseMultiplier, range]);

  const gstAmount = Math.round(computedFee.recommended * 0.18);

  const eligibilityAlerts = useMemo(
    () => getEligibilityAlerts(form.serviceType, form.entityType, form.turnoverBand),
    [form.serviceType, form.entityType, form.turnoverBand],
  );

  const pricingFactors = useMemo<PricingFactor[]>(() => {
    const factors: PricingFactor[] = [];
    if (showVolume) {
      factors.push({
        label: `Transaction volume: ${form.transactionVolume}`,
        value: form.transactionVolume === "Low" ? 0.9 : 1.12,
        direction: form.transactionVolume === "Low" ? "down" : "up",
      });
    }
    if (showComplexity) {
      factors.push({
        label: `Complexity: ${form.complexity}`,
        value: form.complexity === "Simple" ? 0.88 : form.complexity === "Complex" ? 1.26 : 1,
        direction: form.complexity === "Simple" ? "down" : "up",
      });
    }
    factors.push({
      label: `City tier: ${form.cityTier}`,
      value: form.cityTier === "Metro" ? 1.22 : form.cityTier === "Tier-3" ? 0.92 : 1,
      direction: form.cityTier === "Tier-3" ? "down" : "up",
    });
    factors.push({
      label: `Experience: ${form.experience}`,
      value: form.experience === "10+ yrs" ? 1.22 : form.experience === "0-2 yrs" ? 0.92 : 1,
      direction: form.experience === "0-2 yrs" ? "down" : "up",
    });
    for (const item of FACTOR_OPTIONS) {
      if (form[item.key as keyof FeeForm] === true) {
        factors.push({ label: item.label, value: item.effect, direction: "up" });
      }
    }
    return factors;
  }, [baseMultiplier, form, showVolume, showComplexity]);

  const updateFormValue = <K extends keyof FeeForm>(key: K, value: FeeForm[K]) => {
    setShowResult(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleServiceGroupChange = (group: ServiceGroup) => {
    const nextService = SERVICE_GROUPS[group][0];
    setShowResult(false);
    setForm((prev) => ({ ...prev, serviceGroup: group, serviceType: nextService }));
  };

  const handleGenerateAnalysis = async () => {
    setIsLoadingReasoning(true);
    try {
      const text = await getGroqReasoning(form, range, computedFee.recommended);
      setReasoning(text);
    } finally {
      setIsLoadingReasoning(false);
    }
  };

  const handleCopy = async () => {
    const text = [
      `Service: ${form.serviceType}`,
      `Entity: ${form.entityType}`,
      `Fee range: ${formatCurrency(computedFee.min)} - ${formatCurrency(computedFee.max)}`,
      `Recommended fee: ${formatCurrency(computedFee.recommended)}`,
      `GST extra: ${formatCurrency(gstAmount)}`,
      `AI analysis: ${reasoning || "Not generated yet"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Copied");
      window.setTimeout(() => setCopyState("Copy details"), 1500);
    } catch {
      setCopyState("Clipboard blocked");
      window.setTimeout(() => setCopyState("Copy details"), 1500);
    }
  };

  const selectClass = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const naClass = "w-full border border-dashed border-slate-200 rounded-md px-3 py-2 text-sm text-slate-400 bg-slate-50";

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
          <Calculator size={14} />
          Pricing engine
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Fee Estimator</h1>
        <p className="text-sm text-slate-500 mt-1">Market-rate pricing for Indian CA services — with eligibility checks.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Eligibility Alerts */}
          {eligibilityAlerts.length > 0 && (
            <div className="space-y-3">
              {eligibilityAlerts.map((alert, i) => (
                <div key={i} className={`rounded-xl border p-4 flex gap-3 ${
                  alert.type === "warning" ? "bg-amber-50 border-amber-200"
                  : alert.type === "success" ? "bg-green-50 border-green-200"
                  : "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {alert.type === "warning" ? <AlertTriangle size={18} className="text-amber-500" />
                    : alert.type === "success" ? <CheckCircle size={18} className="text-green-500" />
                    : <Info size={18} className="text-blue-500" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${
                      alert.type === "warning" ? "text-amber-800"
                      : alert.type === "success" ? "text-green-800"
                      : "text-blue-800"
                    }`}>{alert.title}</p>
                    <p className={`text-sm mt-0.5 ${
                      alert.type === "warning" ? "text-amber-700"
                      : alert.type === "success" ? "text-green-700"
                      : "text-blue-700"
                    }`}>{alert.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Group</label>
                <select value={form.serviceGroup} onChange={(e) => handleServiceGroupChange(e.target.value as ServiceGroup)} className={selectClass}>
                  {Object.keys(SERVICE_GROUPS).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Type</label>
                <select value={form.serviceType} onChange={(e) => updateFormValue("serviceType", e.target.value)} className={selectClass}>
                  {availableServices.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entity Type</label>
                <select value={form.entityType} onChange={(e) => updateFormValue("entityType", e.target.value as EntityType)} className={selectClass}>
                  {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${showTurnover ? "text-slate-700" : "text-slate-400"}`}>Annual Turnover</label>
                {showTurnover ? (
                  <select value={form.turnoverBand} onChange={(e) => updateFormValue("turnoverBand", e.target.value as TurnoverBand)} className={selectClass}>
                    {TURNOVER_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : <div className={naClass}>Not applicable for this service</div>}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${showVolume ? "text-slate-700" : "text-slate-400"}`}>Monthly Transaction Volume</label>
                {showVolume ? (
                  <select value={form.transactionVolume} onChange={(e) => updateFormValue("transactionVolume", e.target.value as TransactionVolume)} className={selectClass}>
                    {TRANSACTION_VOLUME_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : <div className={naClass}>Not applicable for this service</div>}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${showComplexity ? "text-slate-700" : "text-slate-400"}`}>Complexity</label>
                {showComplexity ? (
                  <select value={form.complexity} onChange={(e) => updateFormValue("complexity", e.target.value as ComplexityLevel)} className={selectClass}>
                    {COMPLEXITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : <div className={naClass}>Not applicable for this service</div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CA City</label>
                <select value={form.cityTier} onChange={(e) => updateFormValue("cityTier", e.target.value as CityTier)} className={selectClass}>
                  {CITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CA Experience</label>
                <select value={form.experience} onChange={(e) => updateFormValue("experience", e.target.value as ExperienceBand)} className={selectClass}>
                  {EXPERIENCE_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Complexity Factors */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Additional complexity factors</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {FACTOR_OPTIONS.map((option) => (
                <label key={option.key} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={Boolean(form[option.key as keyof FeeForm])}
                    onChange={(e) => updateFormValue(option.key as keyof FeeForm, e.target.checked as never)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowResult(true)}
                className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors"
              >
                Calculate Fee
              </button>
              <button
                type="button"
                onClick={() => { setShowResult(false); setReasoning(""); }}
                className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        {showResult && (
          <aside className="space-y-5">
            {/* Fee Card */}
            <div className="bg-slate-900 text-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-green-500 rounded-lg p-2">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Fee range</p>
                  <h2 className="text-3xl font-bold mt-1">
                    {formatCurrency(computedFee.min)} – {formatCurrency(computedFee.max)}
                  </h2>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Recommended fee</p>
                <p className="mt-2 text-3xl font-bold text-emerald-300">{formatCurrency(computedFee.recommended)}</p>
              </div>
              <div className="mt-4 rounded-lg bg-yellow-500/10 border border-yellow-400/30 px-3 py-2 text-sm text-yellow-100">
                GST note: +18% extra on recommended fee ({formatCurrency(gstAmount)})
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <Copy size={16} />
                  {copyState}
                </button>
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-semibold text-slate-900">AI Market Analysis</h3>
                <button
                  type="button"
                  onClick={handleGenerateAnalysis}
                  disabled={isLoadingReasoning}
                  className="rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-70 transition-colors"
                >
                  {isLoadingReasoning ? "Generating..." : "Generate Analysis"}
                </button>
              </div>
              {reasoning ? (
                <p className="text-sm leading-7 text-slate-700 whitespace-pre-line">{reasoning}</p>
              ) : (
                <p className="text-sm leading-6 text-slate-400 italic">
                  Click &apos;Generate Analysis&apos; to get AI market context for this fee estimate.
                </p>
              )}
            </div>

            {/* Pricing Factors */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Pricing factors</h3>
              <div className="space-y-2">
                {pricingFactors.map((factor, index) => (
                  <div key={`${factor.label}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="text-slate-600">{factor.label}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      {factor.direction === "up"
                        ? <ArrowUpRight size={16} className="text-amber-500" />
                        : <ArrowDownRight size={16} className="text-emerald-500" />}
                      {factor.direction === "up" ? "+" : "-"}
                      {factor.value > 1
                        ? `${Math.round((factor.value - 1) * 100)}%`
                        : `${Math.round((1 - factor.value) * 100)}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
