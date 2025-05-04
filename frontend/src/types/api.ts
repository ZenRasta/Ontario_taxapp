// frontend/src/types/api.ts

// Basic Spouse Info 
export interface SpouseInfo {
  age: number;
  rrsp_balance: number;
  other_income: number;
}

// Input structure matching backend Pydantic model
export interface ScenarioInput {
  age: number;
  rrsp_balance: number;
  defined_benefit_pension: number;
  cpp: number;
  oas: number;
  tfsa_balance: number;
  other_taxable_income: number;
  spouse?: SpouseInfo | null; // Optional
  desired_spending: number;
  expect_return_pct: number;
  life_expectancy_years: number; // Planning horizon
  province: string;
  start_year?: number | null; // Optional
  // --- NEW FIELDS ---
  inflation_rate_pct: number;
  target_rrif_depletion_age?: number | null; // Optional
}

// Structure for the data sent in the POST request body
export interface AdviceRequestData {
  request_id?: string | null;
  scenario: ScenarioInput;
}

// --- Response Types ---

// Data for a single year in the simulation (matching backend YearlyProjection)
export interface YearlyProjection {
  year: number;
  age: number;
  start_rrif: number;
  withdrawal: number; // Renamed from withdrawal_amount if needed
  investment_growth: number;
  min_withdrawal: number;
  cpp: number;
  oas: number; // Net OAS
  oas_clawback: number;
  pension: number;
  taxable_income: number;
  federal_tax: number;
  provincial_tax: number;
  total_tax: number;
  end_rrif: number;
  tfsa_balance: number;
}

// Summary metrics for a strategy (matching backend SummaryMetrics)
export interface SummaryMetrics {
  total_tax_paid: number;
  terminal_rrif_balance: number;
  terminal_tax_estimate: number;
  years_oas_clawback: number;
  avg_annual_tax_rate: number;
  rrif_balance_at_end_horizon: number; // Added
}

// Result for a single simulated strategy (matching backend StrategyResult)
export interface StrategyResult {
  strategy_name: string; // Added
  summary_metrics: SummaryMetrics;
  yearly_data: YearlyProjection[];
  // Removed explanation_text and charts_data
}

// Structure to hold raw results (if included in response, but primary is markdown)
// This was removed from the primary AdviceResponse, but kept here for reference
// export interface ResultsContainer {
//     optimized_strategy: StrategyResult;
//     minimum_only_strategy: StrategyResult;
//     savings_summary: SavingsSummary; // SavingsSummary would need to be defined too if used
// }

// UPDATED structure for the API response (matching backend AdviceResponse)
export interface AdviceResponse {
  result_id: string; // UUID as string
  scenario_id: string; // UUID as string
  timestamp: string; // ISO date string
  report_markdown: string; // The main output
  // ADDED: Include raw simulation data for the table
  simulation_results?: StrategyResult[] | null;
}

// Note: SavingsSummary is no longer part of the main response structure
// export interface SavingsSummary {
//     total_tax_saved: number;
//     terminal_tax_saved: number;
// }
