# backend/src/simulation.py

# --- Keep all existing imports ---
from typing import List, Dict, Any, Callable, Optional
import logging
import math
import datetime # Need datetime for default start year

try:
    import numpy_financial as npf
    NUMPY_FINANCIAL_AVAILABLE = True
except ImportError:
    npf = None
    NUMPY_FINANCIAL_AVAILABLE = False
    logging.warning("numpy_financial library not found. 'Empty by Target Age' strategy will use a less accurate fallback calculation.")

# --- Ensure correct models are imported ---
from .models import (
    ScenarioInput,
    StrategyResult,
    YearlyProjection,
    SummaryMetrics # Make sure SummaryMetrics is imported if used below
)
# -----------------------------------------
from .calculator import (
    calculate_total_taxes_for_year,
    calculate_rrif_min_withdrawal,
    get_rules_for_year,
    CurrentYearState # Keep this import
)
# ------------------------------

logger = logging.getLogger(__name__)

# --- CORRECTED FUNCTION SIGNATURE ---
def simulate_strategy(
    scenario: ScenarioInput,
    withdrawal_logic_func: Callable[[CurrentYearState, ScenarioInput], float],
    strategy_name: str # <<< ADDED strategy name parameter
) -> StrategyResult:
    """
    Runs a year-by-year financial simulation based on the input scenario
    and a provided withdrawal logic function.

    Args:
        scenario: The user's initial financial situation and assumptions.
        withdrawal_logic_func: The function determining the RRIF withdrawal amount each year.
        strategy_name: A string identifier for the strategy being run.

    Returns:
        A StrategyResult object containing yearly projections and summary metrics.
    """
    # Use strategy_name in initial log message
    logger.info(f"Starting simulation for strategy: '{strategy_name}' with withdrawal logic: {withdrawal_logic_func.__name__}")

    yearly_data: List[YearlyProjection] = []
    # Default start year calculation moved inside
    current_year = scenario.start_year if scenario.start_year else datetime.date.today().year + 1
    current_age = scenario.age
    current_rrif_balance = scenario.rrsp_balance # Use correct field name from model
    current_tfsa_balance = scenario.tfsa_balance

    # --- CORRECTED ASSIGNMENT ---
    planning_horizon_years = scenario.planning_horizon_years # Use correct attribute name from model
    # --- END CORRECTION ---

    if planning_horizon_years <= 0:
         raise ValueError("Planning horizon must be positive.")


    # --- Simulation Loop ---
    for i in range(planning_horizon_years): # Loop uses the correct variable
        loop_start_rrif_balance = current_rrif_balance # Store start balance for projection record
        logger.debug(f"Simulating Year {current_year}, Age {current_age} for '{strategy_name}', Start RRIF: {loop_start_rrif_balance:.2f}")

        # Get rules (handle fallbacks)
        year_rules = get_rules_for_year(current_year)
        rrif_table = year_rules.get("RRIF_Factors"); fed_rules = year_rules.get("Federal")
        if not rrif_table or not fed_rules: raise ValueError(f"Core rules missing year {current_year}")

        # Apply Growth
        rrif_growth = current_rrif_balance * (scenario.expect_return_pct / 100.0)
        current_rrif_balance += rrif_growth
        tfsa_growth = current_tfsa_balance * (scenario.expect_return_pct / 100.0)
        current_tfsa_balance += tfsa_growth

        # Determine Withdrawal
        current_state: CurrentYearState = {'year': current_year, 'age': current_age, 'current_rrif_balance': current_rrif_balance, 'inflation_rate_pct': scenario.inflation_rate_pct}
        target_withdrawal_amount = withdrawal_logic_func(current_state, scenario)
        min_withdrawal_required = calculate_rrif_min_withdrawal(current_rrif_balance, current_age, rrif_table)
        rrif_withdrawal_amount = max(min_withdrawal_required, target_withdrawal_amount)
        rrif_withdrawal_amount = min(rrif_withdrawal_amount, current_rrif_balance)
        rrif_withdrawal_amount = max(0.0, rrif_withdrawal_amount)

        # Update RRIF Balance
        current_rrif_balance -= rrif_withdrawal_amount

        # Calculate Taxes using updated function signature
        tax_results = calculate_total_taxes_for_year(
            year=current_year, age=current_age, province_code=scenario.province,
            scenario_for_year=scenario, # Pass the whole scenario
            rrif_withdrawal=rrif_withdrawal_amount
        )

        # TFSA & Spending Needs Adjustment
        after_tax_income = tax_results['net_cash_after_tax_calc'] # Use calculated net cash
        # Adjust desired spending for inflation using loop index 'i'
        adjusted_desired_spending = scenario.desired_spending * ((1 + scenario.inflation_rate_pct / 100.0) ** i)
        spending_shortfall = adjusted_desired_spending - after_tax_income
        tfsa_withdrawal = 0.0
        if spending_shortfall > 0:
             tfsa_withdrawal = min(spending_shortfall, current_tfsa_balance)
             current_tfsa_balance -= tfsa_withdrawal

        # Record Yearly Projection Data
        projection = YearlyProjection(
            year=current_year, age=current_age,
            start_rrif=round(loop_start_rrif_balance, 2), # Use balance before growth
            withdrawal=round(rrif_withdrawal_amount, 2),
            investment_growth=round(rrif_growth, 2),
            min_withdrawal=round(min_withdrawal_required, 2),
            pension=round(tax_results['pension_income_calc'], 2), # Use calc results
            cpp=round(tax_results['cpp_income_calc'], 2), # Use calc results
            oas=round(tax_results['oas_benefit_net'], 2),
            oas_clawback=round(tax_results['oas_clawback'], 2),
            other_taxable_income=round(tax_results['other_taxable_income_calc'], 2), # Added
            total_taxable_income=round(tax_results['taxable_income_for_rates'], 2),
            federal_tax=round(tax_results['federal_tax_net'], 2),
            provincial_tax=round(tax_results['provincial_tax_net'], 2),
            total_tax=round(tax_results['total_income_tax'], 2),
            net_cash_after_tax=round(tax_results['net_cash_after_tax_calc'], 2), # Added
            end_rrif=round(current_rrif_balance, 2),
            tfsa_balance=round(current_tfsa_balance, 2)
        )
        yearly_data.append(projection)

        # Update State for Next Iteration
        current_year += 1
        current_age += 1

    # --- Post-Loop: Calculate Summary Metrics ---
    logger.info(f"Simulation loop finished for '{strategy_name}'. Calculating summary metrics.")
    # ... (Summary metric calculations remain the same as the previous version) ...
    total_tax_paid = sum(p.total_tax for p in yearly_data) if yearly_data else 0.0
    years_oas_clawback = sum(1 for p in yearly_data if p.oas_clawback > 0) if yearly_data else 0
    rrif_balance_at_end_horizon = yearly_data[-1].end_rrif if yearly_data else scenario.rrsp_balance
    terminal_rrif_balance = rrif_balance_at_end_horizon
    highest_marginal_rate_final_year = 0.0; terminal_tax_estimate = 0.0
    if yearly_data:
        final_year_tax_results = calculate_total_taxes_for_year(year=yearly_data[-1].year, age=yearly_data[-1].age, province_code=scenario.province, scenario_for_year=scenario, rrif_withdrawal=yearly_data[-1].withdrawal)
        final_year_taxable_income = final_year_tax_results['taxable_income_for_rates']
        final_year_rules = get_rules_for_year(yearly_data[-1].year); final_year_fed_rules = final_year_rules.get("Federal", {}); final_year_prov_rules = final_year_rules.get(scenario.province, {})
        def get_marginal_rate(income, rules):
             if not rules or 'income_brackets' not in rules: return 0.0; rate = 0.0; last_max = 0.0
             for bracket in sorted(rules['income_brackets'], key=lambda b: b['min_income']):
                 min_b = bracket["min_income"]; max_b = bracket["max_income"]; rate_b = bracket["rate"]
                 if income > min_b: rate = bracket['rate']
                 if income <= max_b: break
             return rate
        fed_mrate = get_marginal_rate(final_year_taxable_income, final_year_fed_rules); prov_mrate = get_marginal_rate(final_year_taxable_income, final_year_prov_rules)
        prov_surtax_rate_increase = 0.0
        if scenario.province == "ON" and 'surtax_on_tax' in final_year_prov_rules:
            on_tax_details = final_year_tax_results.get('provincial_tax_details', {}); on_tax_before_surtax = max(0.0, on_tax_details.get('gross_tax', 0.0) - on_tax_details.get('nrtc_value', 0.0))
            surtax_rules = final_year_prov_rules['surtax_on_tax']; t1 = surtax_rules.get("threshold1_amount", float('inf')); r1 = surtax_rules.get("rate1_additional", 0.0); t2 = surtax_rules.get("threshold2_amount", float('inf')); r2_add = surtax_rules.get("rate2_additional_on_top_of_rate1", 0.0)
            if on_tax_before_surtax > t2: prov_surtax_rate_increase = prov_mrate * (r1 + r2_add)
            elif on_tax_before_surtax > t1: prov_surtax_rate_increase = prov_mrate * r1
        highest_marginal_rate_final_year = fed_mrate + prov_mrate + prov_surtax_rate_increase
        terminal_tax_estimate = round(max(0.0, terminal_rrif_balance * highest_marginal_rate_final_year), 2)
    total_income_sum = 0.0
    if yearly_data:
        for p in yearly_data:
            # Reconstruct approximate total income for average rate calc
            gross_oas_this_year = p.oas + p.oas_clawback
            # Need to determine employment income for the year p.age
            effective_retirement_age = scenario.retirement_age if scenario.retirement_age else (scenario.age if scenario.retirement_status == "Retired" else float('inf'))
            employment_income_this_year = scenario.employment_income if p.age < effective_retirement_age else 0.0
            yearly_total_income = p.withdrawal + p.pension + p.cpp + gross_oas_this_year + p.other_taxable_income + employment_income_this_year
            total_income_sum += yearly_total_income
    avg_annual_tax_rate = round((total_tax_paid / total_income_sum) * 100.0, 1) if total_income_sum > 0 else 0.0
    summary = SummaryMetrics(total_tax_paid=round(total_tax_paid, 2), terminal_rrif_balance=round(terminal_rrif_balance, 2), terminal_tax_estimate=terminal_tax_estimate, years_oas_clawback=years_oas_clawback, avg_annual_tax_rate=avg_annual_tax_rate, rrif_balance_at_end_horizon=round(rrif_balance_at_end_horizon, 2))

    # --- Construct Final Result ---
    strategy_result = StrategyResult(
        strategy_name=strategy_name, # Assign the passed name
        summary_metrics=summary,
        yearly_data=yearly_data
    )

    logger.info(f"Simulation complete for strategy: '{strategy_name}'.")
    return strategy_result

# ... (Keep existing if __name__ == "__main__" block, ensure it uses planning_horizon_years) ...
if __name__ == "__main__":
    # Imports needed within this block if running directly
    import json
    from .models import SpouseInfo, NonRegisteredAccount
    from .calculator import get_min_withdrawal, get_optimized_withdrawal, get_empty_by_target_age_withdrawal

    logging.basicConfig(level=logging.WARNING)

    # Create a fully populated test scenario matching the model
    test_scenario_full = ScenarioInput(
         age=73, retirement_status="Retired", retirement_age=73, rrsp_balance=500000,
         employment_income=0, pension_type="DB", pension_income=20000,
         cpp_start_age=65, cpp_amount=10000, oas_start_age=65, oas_amount=8000,
         other_investment_income=0, # Will be part of combined_other_taxable_income
         has_spouse=True,
         spouse_details=SpouseInfo(age=71, rrsp_balance=300000, employment_income=0, pension_income=50000, cpp_oas_income=0, investment_income=0),
         beneficiary_intent="Spouse", desired_spending=89000, tax_target="Avoid OAS Clawback",
         tfsa_balance=100000, non_registered_details=None, health_considerations="Average",
         planning_horizon_years=10, # Use correct field name
         expect_return_pct=6.0, inflation_rate_pct=2.0,
         target_rrif_depletion_age=83, province="ON", future_residence_intent="Remain in Province",
         start_year=2025
    )

    print(f"\n--- Running Test Simulations ({TAX_YEAR_DATA}) ---")
    # Test the simulation function
    min_res_test = simulate_strategy(test_scenario_full, get_min_withdrawal, "Test Minimum")
    print("\nTest Minimum Summary:")
    # Use .dict() or .model_dump() for Pydantic v2 to print model data
    print(min_res_test.summary_metrics.model_dump_json(indent=2) if hasattr(min_res_test.summary_metrics, 'model_dump_json') else min_res_test.summary_metrics.json(indent=2))

    opt_res_test = simulate_strategy(test_scenario_full, get_optimized_withdrawal, "Test TopUp")
    print("\nTest TopUp Summary:")
    print(opt_res_test.summary_metrics.model_dump_json(indent=2) if hasattr(opt_res_test.summary_metrics, 'model_dump_json') else opt_res_test.summary_metrics.json(indent=2))

    if test_scenario_full.target_rrif_depletion_age:
        empty_res_test = simulate_strategy(test_scenario_full, get_empty_by_target_age_withdrawal, "Test Empty")
        print("\nTest EmptyByTarget Summary:")
        print(empty_res_test.summary_metrics.model_dump_json(indent=2) if hasattr(empty_res_test.summary_metrics, 'model_dump_json') else empty_res_test.summary_metrics.json(indent=2))
        