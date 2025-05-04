// ./types/api.ts

// Input structure for the scenario calculation
export interface SpouseInfo {
    age: number;
    rrsp_balance: number;
    other_income: number;
  }
  
  export interface ScenarioInput {
    age: number;
    rrsp_balance: number;
    defined_benefit_pension: number;
    cpp: number;
    oas: number;
    tfsa_balance: number;
    other_taxable_income: number;
    spouse: SpouseInfo | null;
    desired_spending: number;
    expect_return_pct: number;
    life_expectancy_years: number;
    province: string;
    start_year?: number;
  }
  
  // Yearly breakdown item in the response
  export interface YearlyBreakdown {
    year: number;
    age: number;
    rrsp_withdrawal: number;
    tfsa_withdrawal: number;
    taxable_income: number;
    tax_amount: number;
    net_income: number;
    spending_achieved: number;
    remaining_rrsp: number;
    remaining_tfsa: number;
  }
  
  // Complete response structure from the backend
  export interface AdviceResponse {
    optimal_withdrawal: number;
    total_years: number;
    yearly_breakdown: YearlyBreakdown[];
    success: boolean;
    message?: string;
  }