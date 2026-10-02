// src/lib/checklistTemplates.ts
export type Requirement = "mandatory" | "optional";
export type ConditionKey =
  | "always"
  | "has_capital_gains"
  | "has_house_property"
  | "has_foreign_income"
  | "has_exports"
  | "has_employees"
  | "is_listed_company"
  | "gst_registered"
  | "tds_applicable"
  | "pf_applicable";

export type ChecklistTemplateItem = {
  name: string;
  requirement: Requirement;
  condition?: ConditionKey;
};

const m = (name: string, condition: ConditionKey = "always"): ChecklistTemplateItem => ({ name, requirement: "mandatory", condition });
const o = (name: string, condition: ConditionKey = "always"): ChecklistTemplateItem => ({ name, requirement: "optional", condition });

export const ENGAGEMENT_TYPES = [
  // GST
  "GST Return",
  "GST Registration",
  "GST Annual Return (GSTR-9)",
  "GST Audit (GSTR-9C)",
  "GST Notice Reply",
  "GST Refund Application",
  "GST Amendment",
  "LUT Filing",
  // Income Tax
  "ITR Filing",
  "ITR Filing - Business",
  "ITR Filing - Company",
  "Tax Audit",
  "Transfer Pricing Audit",
  "Income Tax Notice Reply",
  "Tax Planning",
  "Advance Tax Calculation",
  // TDS
  "TDS Return",
  "TDS Rectification",
  // Audit
  "Statutory Audit",
  "Internal Audit",
  "Stock Audit",
  "Bank Audit",
  "Concurrent Audit",
  "Secretarial Audit",
  // ROC / MCA
  "ROC Filing",
  "MCA Compliance",
  "Company Incorporation",
  "LLP Incorporation",
  "DIR-3 KYC",
  "DPT-3",
  "MSME-1",
  "INC-20A",
  // Payroll & Labour
  "PF Return",
  "ESI Return",
  "Professional Tax Return",
  "Payroll Processing",
  // Registrations
  "MSME / Udyam Registration",
  "FSSAI Registration",
  "Trademark Registration",
  "IEC Registration",
  "Shop & Establishment Registration",
  "DSC Renewal",
  // Advisory
  "Business Valuation",
  "Due Diligence",
  "CFO Advisory",
  "Project Report / CMA",
  "FEMA Compliance",
  "Startup Advisory",
  "Bookkeeping / Accounting",
  "Management Reporting / MIS",
  // Other
  "Other",
];

export type EngagementConditions = {
  has_capital_gains?: boolean;
  has_house_property?: boolean;
  has_foreign_income?: boolean;
  has_exports?: boolean;
  has_employees?: boolean;
  is_listed_company?: boolean;
  gst_registered?: boolean;
  tds_applicable?: boolean;
  pf_applicable?: boolean;
};

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplateItem[]> = {
  "GST Return": [
    m("Sales register / sales invoices for the period"),
    m("Purchase register / purchase invoices"),
    m("Expense bills with GST"),
    m("Bank statement for the period"),
    o("Credit notes and debit notes"),
    o("Previous month ITC / liability carry-forward"),
    o("Turnover reconciliation with books"),
    o("RCM transaction details", "always"),
    m("Export invoices and LUT details", "has_exports"),
    m("SEZ supply invoices and details", "has_exports"),
    o("E-commerce operator sales statement"),
    o("Import documents (Bill of Entry)"),
    o("Client confirmation on ITC mismatch"),
  ],

  "GST Registration": [
    m("PAN of proprietor / entity"),
    m("Aadhaar of proprietor / directors / partners"),
    m("Proof of principal place of business (electricity bill / property tax)"),
    m("Rent agreement / NOC from property owner (if rented)"),
    m("Photograph of proprietor / authorised signatory"),
    m("Bank account statement or cancelled cheque"),
    o("Partnership deed / MOA & AOA / LLP agreement"),
    o("Authorization letter / board resolution"),
    o("Additional place of business proof"),
    o("Existing GSTINs if any"),
  ],

  "GST Annual Return (GSTR-9)": [
    m("All GSTR-1 and GSTR-3B filed for FY"),
    m("Annual turnover as per books"),
    m("ITC reconciliation with GSTR-2B and books"),
    m("HSN-wise summary of outward supplies"),
    m("Tax paid reconciliation"),
    o("Credit notes / debit notes details"),
    o("Amendments made in subsequent year"),
    o("Export / LUT details for the year", "has_exports"),
    o("RCM liability reconciliation"),
  ],

  "GST Notice Reply": [
    m("Copy of GST notice / SCN"),
    m("GSTIN and registration details"),
    m("GST returns for the relevant period"),
    m("Bank statements for the period"),
    m("Invoices related to the notice"),
    m("ITC reconciliation workings"),
    o("Previous correspondence with department"),
    o("LUT / export documentation", "has_exports"),
    o("RCM transaction details"),
  ],

  "ITR Filing": [
    m("PAN and Aadhaar"),
    m("Form 16 — Part A and Part B"),
    m("Form 26AS / AIS / TIS"),
    m("Bank statements — all accounts"),
    m("Interest certificates (bank / post office)"),
    m("Tax regime confirmation (old / new)"),
    o("Investment proofs — 80C / 80D / 80G etc."),
    o("Rent receipts and rent agreement — HRA", "has_house_property"),
    o("Home loan interest certificate", "has_house_property"),
    o("Rental income details and rent agreement", "has_house_property"),
    m("Capital gains statement — broker / mutual fund / property", "has_capital_gains"),
    m("Sale deed / purchase deed for property gain", "has_capital_gains"),
    m("Foreign income details and tax paid abroad", "has_foreign_income"),
    m("Foreign asset schedule — bank accounts, investments, property", "has_foreign_income"),
    m("Form 67 (foreign tax credit)", "has_foreign_income"),
    o("Dividend income details"),
    o("Previous year ITR acknowledgement"),
    o("Advance tax / self-assessment tax challans"),
  ],

  "ITR Filing - Business": [
    m("PAN and Aadhaar"),
    m("Trial balance, P&L and balance sheet"),
    m("Bank statements — all business accounts"),
    m("Sales and purchase registers"),
    m("Expense ledger with key invoices"),
    m("Form 26AS / AIS / TIS"),
    m("GST returns filed for the year", "gst_registered"),
    m("TDS returns and challans", "tds_applicable"),
    m("Previous year ITR and computation"),
    m("Capital gains statement", "has_capital_gains"),
    m("Foreign income / foreign assets details", "has_foreign_income"),
    m("Export invoices and LUT", "has_exports"),
    m("Employee salary register and PF/ESI details", "has_employees"),
    o("Cash book"),
    o("Debtors and creditors list"),
    o("Fixed asset additions / sale details"),
    o("Closing stock details"),
    o("Loan statements and interest certificates"),
    o("Capital introduced / drawings details"),
    o("Advance tax challans"),
  ],

  "ITR Filing - Company": [
    m("Audited financial statements"),
    m("Tax audit report (Form 3CA/3CB + 3CD)"),
    m("Form 26AS / AIS / TIS"),
    m("MAT computation (if applicable)"),
    m("Depreciation as per Companies Act and IT Act"),
    m("Related party transactions schedule"),
    m("Deferred tax workings"),
    m("GST returns and turnover reconciliation", "gst_registered"),
    m("TDS certificates and challans", "tds_applicable"),
    m("Transfer pricing documentation", "has_foreign_income"),
    m("Foreign asset / income details", "has_foreign_income"),
    m("SEBI disclosures and filings", "is_listed_company"),
    o("Advance tax challans"),
    o("Previous year ITR and computation"),
  ],

  "TDS Return": [
    m("TAN and deductor details"),
    m("TDS challans with payment dates"),
    m("Vendor payment register with PAN (26Q)"),
    m("Previous return acknowledgement / token number"),
    o("Salary register (24Q)", "has_employees"),
    o("Non-resident payment details (27Q)", "has_foreign_income"),
    o("Lower / nil deduction certificates"),
    o("Employee investment declarations (Q4)", "has_employees"),
  ],

  "Tax Audit": [
    m("Trial balance and complete ledger"),
    m("Draft financial statements"),
    m("Bank statements and BRS"),
    m("Sales and purchase registers"),
    m("Fixed asset register and depreciation"),
    m("Stock records and valuation"),
    m("GST returns and turnover reconciliation", "gst_registered"),
    m("TDS / TCS returns and challans", "tds_applicable"),
    m("Debtors and creditors ageing"),
    m("Related party details"),
    m("Cash transaction details (Sec 40A(3) / 269ST)"),
    m("Outstanding statutory dues"),
    m("Export documentation and LUT", "has_exports"),
    m("Employee records and PF/ESI compliance", "has_employees"),
    m("Transfer pricing documentation", "has_foreign_income"),
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
    m("Statutory dues records — GST, TDS, PF, ESIC"),
    m("Previous year audited financial statements"),
    m("Management representation letter"),
    m("Employee payroll and HR records", "has_employees"),
    m("Export and forex transaction records", "has_exports"),
    m("SEBI filings and disclosures", "is_listed_company"),
    m("Transfer pricing and foreign transaction records", "has_foreign_income"),
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
    m("SEBI quarterly filings and disclosures", "is_listed_company"),
    m("Employee headcount and CSR report", "has_employees"),
    o("Related party transactions (AOC-2)"),
    o("Loans, investments and guarantees details"),
    o("Auditor appointment details (ADT-1)"),
  ],

  "Company Incorporation": [
    m("PAN and Aadhaar of all directors"),
    m("Passport size photograph of all directors"),
    m("Address proof of all directors"),
    m("Proof of registered office"),
    m("NOC from property owner"),
    m("Proposed company name options (3-4)"),
    m("MOA and AOA draft / object clause"),
    o("DIN if already allotted"),
    o("DSC of directors"),
    o("Details of corporate shareholder if any"),
  ],

  "LLP Incorporation": [
    m("PAN and Aadhaar of all partners"),
    m("Address proof of all partners"),
    m("Proof of registered office"),
    m("NOC from property owner"),
    m("Proposed LLP name options"),
    m("Nature of business and main objects"),
    m("Contribution amount and profit-sharing ratio"),
    o("LLP agreement draft"),
    o("Details of corporate partners if any"),
  ],

  "DIR-3 KYC": [
    m("DIN number"),
    m("PAN of director"),
    m("Aadhaar of director"),
    m("Personal mobile number and email"),
    m("DSC of director"),
    o("Address proof if changed"),
  ],

  "PF Return": [
    m("Salary register for the month"),
    m("PF challan details"),
    m("Employee UAN list"),
    m("New joinees / exitees details"),
    o("ECR file from previous month"),
  ],

  "ESI Return": [
    m("Salary register for the period"),
    m("ESIC challan payment details"),
    m("Employee IP number list"),
    m("New joinees / exitees with salary details"),
  ],

  "Payroll Processing": [
    m("Employee master and attendance for the month"),
    m("Salary structure and revision details"),
    m("New joinee / exit details"),
    m("Leave and deduction records"),
    m("Reimbursement claims"),
    m("PF / ESI / PT applicability details"),
    m("TDS declarations and investment proofs"),
    o("Previous month payroll for reference"),
    o("Bonus / incentive details"),
  ],

  "Bookkeeping / Accounting": [
    m("Bank statements for the period"),
    m("Sales and purchase invoices"),
    m("Expense bills and vouchers"),
    m("GST returns for reconciliation", "gst_registered"),
    m("TDS challans and details", "tds_applicable"),
    m("Payroll and salary details", "has_employees"),
    o("Credit / debit notes"),
    o("Loan statements and interest certificates"),
    o("Fixed asset purchase / disposal details"),
    o("Opening balances / previous closing trial balance"),
    o("Debtors / creditors ageing"),
  ],

  "Business Valuation": [
    m("Audited financials for last 3 years"),
    m("Latest management accounts / trial balance"),
    m("Business plan and financial projections"),
    m("Details of assets and liabilities"),
    m("List of major customers and contracts"),
    m("Share capital and shareholding pattern"),
    m("SEBI filings and market data", "is_listed_company"),
    m("Foreign subsidiary / investment details", "has_foreign_income"),
    o("Industry and market information"),
    o("Previous valuation reports"),
  ],

  "Due Diligence": [
    m("Audited financial statements — last 3-5 years"),
    m("Latest management accounts and monthly P&L"),
    m("Trial balance and general ledger"),
    m("Customer-wise revenue and contracts"),
    m("Monthly debtors and creditors ageing"),
    m("Bank statements and reconciliations"),
    m("Loan agreements and repayment schedules"),
    m("Related-party transactions"),
    m("Employee cost and payroll data", "has_employees"),
    m("GST / TDS reconciliation", "gst_registered"),
    m("Export income and forex records", "has_exports"),
    m("Transfer pricing documentation", "has_foreign_income"),
    o("Contingent liabilities and litigation details"),
    o("Fixed asset register and capex details"),
  ],

  "DSC Renewal": [
    m("Aadhaar of applicant"),
    m("PAN of applicant"),
    m("Existing DSC token"),
    m("Mobile number linked to Aadhaar"),
    o("Passport (for Class 3 / DGFT DSC)"),
  ],

  "Internal Audit": [
    m("Trial balance and general ledger"),
    m("Revenue, procurement and expense registers"),
    m("Bank statements and reconciliations"),
    m("Fixed asset register"),
    m("Previous internal audit reports"),
    m("Process manuals / SOPs"),
    m("Payroll and employee master", "has_employees"),
    m("GST / TDS records", "gst_registered"),
    m("Export and forex records", "has_exports"),
    o("Inventory records and stock movement"),
    o("IT / system access control details"),
    o("Risk register and management concerns"),
  ],
};

export function getTemplate(
  type: string,
  conditions: EngagementConditions = {}
): ChecklistTemplateItem[] {
  const all = CHECKLIST_TEMPLATES[type] ?? [];
  return all.filter(item => {
    const cond = item.condition ?? "always";
    if (cond === "always") return true;
    return Boolean(conditions[cond as keyof EngagementConditions]);
  });
}

// For Settings page — show ALL docs regardless of conditions
export function getAllTemplate(type: string): ChecklistTemplateItem[] {
  return CHECKLIST_TEMPLATES[type] ?? [];
}
