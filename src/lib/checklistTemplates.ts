// src/lib/checklistTemplates.ts
// Service-wise document checklists (Phase 1).
// Edit these lists anytime — changes apply to NEW checklists only.

export type Requirement = "mandatory" | "optional";

export type ChecklistTemplateItem = {
  name: string;
  requirement: Requirement;
};

const m = (name: string): ChecklistTemplateItem => ({ name, requirement: "mandatory" });
const o = (name: string): ChecklistTemplateItem => ({ name, requirement: "optional" });

// Single source of truth for engagement types (engagements.tsx imports this)
export const ENGAGEMENT_TYPES = [
  "GST Return",
  "ITR Filing",
  "ITR Filing - Business",
  "TDS Return",
  "Tax Audit",
  "Statutory Audit",
  "ROC Filing",
  "MCA Compliance",
  "Other",
];

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplateItem[]> = {
  "GST Return": [
    m("Sales register / sales invoices for the period"),
    m("Purchase register / purchase invoices"),
    m("Expense bills with GST"),
    m("Bank statement for the period"),
    o("Credit notes and debit notes"),
    o("Export / SEZ invoices and LUT details"),
    o("E-commerce operator sales statement"),
    o("Import documents (Bill of Entry)"),
    o("Reverse charge (RCM) transaction details"),
    o("Client confirmation on missing invoices / ITC mismatch"),
  ],

  "ITR Filing": [
    m("PAN and Aadhaar"),
    m("Form 16 (Part A and Part B)"),
    m("Form 26AS / AIS / TIS"),
    m("Bank statements (all accounts)"),
    m("Interest certificates (bank / post office)"),
    m("Tax regime confirmation (old / new)"),
    o("Investment proofs (80C / 80D etc.)"),
    o("Rent receipts and rent agreement (HRA)"),
    o("Home loan interest certificate"),
    o("Capital gains statement (broker / mutual fund)"),
    o("Dividend income details"),
    o("Rental income details"),
    o("Previous year ITR acknowledgement"),
    o("Advance tax / self-assessment tax challans"),
  ],

  "ITR Filing - Business": [
    m("PAN and Aadhaar"),
    m("Trial balance, P&L and balance sheet"),
    m("Bank statements (all business accounts)"),
    m("Sales and purchase registers"),
    m("Expense ledger with key invoices"),
    m("Form 26AS / AIS / TIS"),
    m("GST returns filed for the year"),
    m("Previous year ITR and computation"),
    o("Cash book"),
    o("Debtors and creditors list"),
    o("Fixed asset additions / sale details"),
    o("Closing stock details"),
    o("Loan statements and interest certificates"),
    o("Capital introduced / drawings details"),
    o("Advance tax challans"),
  ],

  "TDS Return": [
    m("TAN and deductor details"),
    m("TDS challans with payment dates"),
    m("Vendor payment register with PAN (26Q)"),
    m("Previous return acknowledgement / token number"),
    o("Salary register (24Q)"),
    o("Non-resident payment details (27Q)"),
    o("Lower / nil deduction certificates"),
    o("Employee investment declarations (Q4)"),
  ],

  "Tax Audit": [
    m("Trial balance and complete ledger"),
    m("Draft financial statements"),
    m("Bank statements and BRS"),
    m("Sales and purchase registers"),
    m("Fixed asset register and depreciation"),
    m("Stock records and valuation"),
    m("GST returns and turnover reconciliation"),
    m("TDS / TCS returns and challans"),
    m("Debtors and creditors ageing"),
    m("Related party details"),
    m("Cash transaction details (Sec 40A(3) / 269ST)"),
    m("Outstanding statutory dues (GST, TDS, PF, ESIC)"),
    o("Loan confirmations and interest schedule"),
    o("Previous year tax audit report"),
  ],

  "Statutory Audit": [
    m("Trial balance and general ledger"),
    m("Draft financial statements with schedules"),
    m("Bank statements and BRS"),
    m("Debtors and creditors ageing with confirmations"),
    m("Fixed asset register"),
    m("Board and AGM minutes"),
    m("Related party transactions"),
    m("Statutory dues records (GST, TDS, PF, ESIC)"),
    m("Previous year audited financial statements"),
    m("Management representation letter"),
    o("Inventory records and physical verification"),
    o("Loan agreements and confirmations"),
    o("Contingent liabilities / litigation details"),
  ],

  "ROC Filing": [
    m("Audited financial statements and audit report"),
    m("Board's report"),
    m("AGM date, notice and minutes"),
    m("Shareholding pattern and changes"),
    m("Directors' details and DIN KYC status"),
    m("Previous year AOC-4 and MGT-7 / MGT-7A"),
    o("Related party transactions (AOC-2)"),
    o("Loans, investments and guarantees details"),
    o("Auditor appointment details (ADT-1)"),
  ],
};

export function getTemplate(type: string): ChecklistTemplateItem[] {
  return CHECKLIST_TEMPLATES[type] ?? [];
}