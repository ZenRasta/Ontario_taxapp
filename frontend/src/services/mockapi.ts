// ./services/mockApi.ts
import type { AdviceResponse, ScenarioInput } from '../types/api';

/**
 * Generate mock retirement advice
 * This can be used for development/testing when backend is unavailable
 */
export const generateMockAdvice = async (scenarioData: ScenarioInput): Promise<AdviceResponse> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Extract key values from input
  const { age, rrsp_balance, life_expectancy_years, expect_return_pct } = scenarioData;
  const spouse = scenarioData.spouse;
  
  // Current year calculation
  const currentYear = new Date().getFullYear();
  
  // Generate data points for each year
  const years = life_expectancy_years;
  const yearsArray = Array.from({ length: years }, (_, i) => i);
  
  // Create mock yearly projections
  const minimumYearlyData = yearsArray.map(yearOffset => {
    const year = currentYear + yearOffset;
    const currentAge = age + yearOffset;
    
    // Simple (non-realistic) calculations for demo purposes
    const minimumWithdrawal = yearOffset === 0 ? 0 : (rrsp_balance * 0.05) / (years - yearOffset);
    const remainingRrif = Math.max(0, rrsp_balance - (minimumWithdrawal * yearOffset));
    
    return {
      year,
      age: currentAge,
      start_rrif: remainingRrif + minimumWithdrawal,
      withdrawal_amount: minimumWithdrawal,
      end_rrif: remainingRrif,
      income: minimumWithdrawal + scenarioData.other_taxable_income,
      tax_paid: (minimumWithdrawal + scenarioData.other_taxable_income) * 0.2, // Simplified 20% tax
      net_income: (minimumWithdrawal + scenarioData.other_taxable_income) * 0.8,
      oas_clawback: 0,
    };
  });

  // Create optimized yearly data (with some differences from minimum)
  const optimizedYearlyData = yearsArray.map(yearOffset => {
    const year = currentYear + yearOffset;
    const currentAge = age + yearOffset;
    
    // More aggressive early withdrawals for optimization
    let optimalWithdrawal;
    if (yearOffset < years / 3) {
      // Higher withdrawals in early years
      optimalWithdrawal = (rrsp_balance * 0.08) / (years - yearOffset);
    } else {
      // Lower withdrawals in later years
      optimalWithdrawal = (rrsp_balance * 0.04) / (years - yearOffset);
    }
    
    const remainingRrif = Math.max(0, rrsp_balance - (optimalWithdrawal * yearOffset));
    
    return {
      year,
      age: currentAge,
      start_rrif: remainingRrif + optimalWithdrawal,
      withdrawal_amount: optimalWithdrawal,
      end_rrif: remainingRrif,
      income: optimalWithdrawal + scenarioData.other_taxable_income,
      tax_paid: (optimalWithdrawal + scenarioData.other_taxable_income) * 0.18, // Slightly better tax rate
      net_income: (optimalWithdrawal + scenarioData.other_taxable_income) * 0.82,
      oas_clawback: 0,
    };
  });

  // Create mock response data
  const mockResponse: AdviceResponse = {
    success: true,
    results: {
      minimum_only_strategy: {
        yearly_data: minimumYearlyData,
        summary_metrics: {
          total_tax_paid: minimumYearlyData.reduce((sum, year) => sum + year.tax_paid, 0),
          terminal_rrif_balance: minimumYearlyData[minimumYearlyData.length - 1].end_rrif,
          terminal_tax_estimate: minimumYearlyData[minimumYearlyData.length - 1].end_rrif * 0.3,
          avg_annual_tax_rate: 20.0,
          years_oas_clawback: 0,
        },
      },
      optimized_strategy: {
        yearly_data: optimizedYearlyData,
        summary_metrics: {
          total_tax_paid: optimizedYearlyData.reduce((sum, year) => sum + year.tax_paid, 0),
          terminal_rrif_balance: optimizedYearlyData[optimizedYearlyData.length - 1].end_rrif,
          terminal_tax_estimate: optimizedYearlyData[optimizedYearlyData.length - 1].end_rrif * 0.25,
          avg_annual_tax_rate: 18.0,
          years_oas_clawback: 0,
        },
        explanation_text: `Based on your scenario with a starting RRSP/RRIF balance of $${rrsp_balance.toLocaleString()} at age ${age}, we recommend an optimized withdrawal strategy that front-loads your RRIF withdrawals.

This approach helps minimize your overall lifetime tax burden and potential terminal tax by:

1. Taking larger withdrawals in early retirement years
2. Smoothing your income to stay in lower tax brackets when possible
3. Reducing the size of your RRIF before mandatory higher withdrawals apply

The optimized strategy is projected to save approximately $${(minimumYearlyData.reduce((sum, year) => sum + year.tax_paid, 0) - optimizedYearlyData.reduce((sum, year) => sum + year.tax_paid, 0)).toLocaleString()} in lifetime taxes compared to taking only the minimum withdrawals.

${spouse ? `We've also considered your spouse's age (${spouse.age}) and income in this calculation.` : ""}

Note: This is a simplified projection. Actual results will depend on investment performance, tax law changes, and your personal circumstances.`,
      },
      savings_summary: {
        total_tax_saved: minimumYearlyData.reduce((sum, year) => sum + year.tax_paid, 0) - optimizedYearlyData.reduce((sum, year) => sum + year.tax_paid, 0),
        terminal_tax_saved: (minimumYearlyData[minimumYearlyData.length - 1].end_rrif * 0.3) - (optimizedYearlyData[optimizedYearlyData.length - 1].end_rrif * 0.25),
      },
    },
    message: "Advice generated successfully",
  };

  return mockResponse;
};