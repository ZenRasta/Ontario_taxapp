// frontend/src/types/api.ts

// Basic Spouse Info - Ensure all fields match backend SpouseInfo model
export interface SpouseInfo { // <<< EXPORT ADDED
  age: number;
  rrsp_balance: number;
  employment_income: number;
  pension_income: number;
  cpp_oas_income: number;
  investment_income: number;
}

// Non-Registered Account Details
export interface NonRegisteredAccount { // <<< EXPORT ADDED
  balance: number;
  unrealized_capital_gains: number;
}

// Input structure matching backend Pydantic model
export interface ScenarioInput { // <<< EXPORT ADDED
  // Section 1
  age: number;
  retirement_status: string;
  retirement_age?: number | null;
  rrsp_balance: number;
  // Section 2
  employment_income: number;
  pension_type?: string | null;
  pension_income: number;
  cpp_start_age: number;
  cpp_amount: number;
  oas_start_age: number;
  oas_amount: number;
  other_investment_income: number;
  // Section 3
  has_spouse: boolean;
  spouse_details?: SpouseInfo | null; // Uses exported SpouseInfo
  beneficiary_intent?: string | null;
  // Section 4
  desired_spending: number;
  tax_target?: string | null;
  // Section 5
  tfsa_balance: number;
  has_non_registered: boolean; // Ensure this matches InputForm state if used
  non_registered_details?: NonRegisteredAccount | null; // Uses exported NonRegisteredAccount
  // Section 6
  health_considerations?: string | null;
  planning_horizon_years: number;
  expect_return_pct: number;
  inflation_rate_pct: number;
  target_rrif_depletion_age?: number | null;
  // Section 7
  province: string;
  future_residence_intent?: string | null;
  // Other
  start_year?: number | null;
}

// Request data structure
export interface AdviceRequestData { // <<< EXPORT ADDED
  request_id?: string | null;
  scenario: ScenarioInput; // Uses exported ScenarioInput
}

// --- Response Types ---

export interface YearlyProjection { // <<< EXPORT ADDED
  // Ensure these fields match backend exactly
  year: number;
  age: number;
  start_rrif: number;
  withdrawal: number;
  investment_growth: number;
  min_withdrawal: number;
  pension: number;
  cpp: number;
  oas: number; // Net OAS
  oas_clawback: number;
  other_taxable_income: number;
  total_taxable_income: number;
  federal_tax: number;
  provincial_tax: number;
  total_tax: number;
  net_cash_after_tax: number;
  end_rrif: number;
  tfsa_balance: number;
  // Add employment_income if needed for table display based on backend logic
  employment_income?: number; // Make optional if not always present
}

export interface SummaryMetrics { // <<< EXPORT ADDED
  total_tax_paid: number;
  terminal_rrif_balance: number;
  terminal_tax_estimate: number;
  years_oas_clawback: number;
  avg_annual_tax_rate: number;
  rrif_balance_at_end_horizon: number;
}

export interface StrategyResult { // <<< EXPORT ADDED
  strategy_name: string; // <<< Ensure this is present
  summary_metrics: SummaryMetrics; // Uses exported SummaryMetrics
  yearly_data: YearlyProjection[]; // Uses exported YearlyProjection
}

export interface AdviceResponse { // <<< EXPORT ADDED
  result_id: string;
  scenario_id: string;
  timestamp: string;
  report_markdown: string;
  simulation_results: StrategyResult[]; // <<< Ensure this is present & uses exported StrategyResult
}
