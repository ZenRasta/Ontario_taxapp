# backend/src/calculator.py

import math
import logging
from typing import Dict, List, Any, Optional, TypedDict, Callable
from datetime import date # Import date

# Import numpy_financial safely
try:
    import numpy_financial as npf
    NUMPY_FINANCIAL_AVAILABLE = True
except ImportError:
    npf = None
    NUMPY_FINANCIAL_AVAILABLE = False
    # Log warning only once at startup if needed, or just check NUMPY_FINANCIAL_AVAILABLE later
    # logging.warning("numpy_financial library not found...")

# Import models
from .models import ScenarioInput, SpouseInfo # Ensure ScenarioInput is imported

# Define state passed during simulation
class CurrentYearState(TypedDict):
    year: int
    age: int
    current_rrif_balance: float
    inflation_rate_pct: float

# --- 1. Tax Data Structures ---
TAX_YEAR_DATA = 2025 # Placeholder year (Ensure these are updated annually)
# RRIF Factors (ITA Reg 7308(4) for >= 71, 1/(90-age) for < 71)
RRIF_MIN_FACTORS_DATA = { 71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192, 91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879, 95: 0.2000 }
# Federal Tax Rules (2024 Placeholder - UPDATE FOR 2025)
FEDERAL_TAX_RULES = { "year": TAX_YEAR_DATA, "jurisdiction": "Federal", "income_brackets": [{"min_income": 0.00, "max_income": 55867.00, "rate": 0.15},{"min_income": 55867.00, "max_income": 111733.00, "rate": 0.205},{"min_income": 111733.00, "max_income": 173205.00, "rate": 0.26},{"min_income": 173205.00, "max_income": 246752.00, "rate": 0.29},{"min_income": 246752.00, "max_income": float('inf'), "rate": 0.33}], "credits": {"bpa": {"amount": 15705.00, "rate": 0.15}, "age": {"base_amount": 8790.00, "income_threshold": 44325.00, "reduction_rate": 0.15, "credit_rate": 0.15}, "pension": {"max_claim": 2000.00, "credit_rate": 0.15}, "cpp_qpp": {"max_credit_base_claim": 3867.50, "credit_rate": 0.15}}, "parameters": {"oas_clawback_threshold": 90997.00, "oas_clawback_rate": 0.15} }
# Ontario Tax Rules (2024 Placeholder - UPDATE FOR 2025)
ONTARIO_TAX_RULES = { "year": TAX_YEAR_DATA, "jurisdiction": "ON", "income_brackets": [{"min_income": 0.00, "max_income": 51446.00, "rate": 0.0505},{"min_income": 51446.00, "max_income": 102894.00, "rate": 0.0915},{"min_income": 102894.00, "max_income": 150000.00, "rate": 0.1116},{"min_income": 150000.00, "max_income": 220000.00, "rate": 0.1216},{"min_income": 220000.00, "max_income": float('inf'), "rate": 0.1316}], "credits": {"bpa": {"amount": 12399.00, "rate": 0.0505}, "age": {"base_amount": 5896.00, "income_threshold": 44325.00, "reduction_rate": 0.15, "credit_rate": 0.0505}, "pension": {"max_claim": 1580.00, "credit_rate": 0.0505}, "cpp_qpp": {"max_credit_base_claim": 3867.50, "credit_rate": 0.0505}}, "surtax_on_tax": {"threshold1_amount": 5315.00, "rate1_additional": 0.20, "threshold2_amount": 6802.00, "rate2_additional_on_top_of_rate1": 0.16} }
# Combined Structure
ALL_TAX_RULES_BY_YEAR = { TAX_YEAR_DATA: { "Federal": FEDERAL_TAX_RULES, "ON": ONTARIO_TAX_RULES, "RRIF_Factors": RRIF_MIN_FACTORS_DATA } }


# --- 2. Helper Function to Get Tax Rules ---
def get_rules_for_year(year: int) -> Optional[Dict[str, Any]]:
    """Retrieves tax rule sets for a given year, with fallback."""
    rules = ALL_TAX_RULES_BY_YEAR.get(year)
    if rules is None:
        available_years = sorted([y for y in ALL_TAX_RULES_BY_YEAR if y <= year], reverse=True)
        if available_years: latest_year = available_years[0]; logging.warning(f"Rules for year {year} not found. Using rules from {latest_year}."); return ALL_TAX_RULES_BY_YEAR[latest_year]
        else: raise ValueError(f"Tax rules not available for year {year} or any prior year.")
    return rules

# --- 3. Core Calculation Functions ---
def get_rrif_min_factor(age: int, rrif_factors_table: Dict[int, float]) -> float:
    """Gets RRIF minimum factor."""
    if not isinstance(age, int) or age < 0: raise ValueError("Age must be non-negative integer.")
    if age < 71:
        if age >= 90: return 1.0
        denominator = 90.0 - float(age); return 1.0 / denominator if denominator > 0 else 1.0
    elif age >= 95: return rrif_factors_table.get(95, 0.2000)
    else:
        factor = rrif_factors_table.get(age)
        if factor is None: # Fallback to nearest lower age if specific age factor is missing
            closest_age = max([a for a in rrif_factors_table if a < age and a >= 71], default=None)
            if closest_age: logging.warning(f"RRIF factor for {age} missing, using {closest_age}."); return rrif_factors_table[closest_age]
            else: raise ValueError(f"RRIF factor not found for age {age}")
        return factor

def calculate_rrif_min_withdrawal(balance: float, age: int, rrif_factors_table: Dict[int, float]) -> float:
    """Calculates minimum RRIF withdrawal."""
    if balance <= 0: return 0.0
    if age < 0: raise ValueError("Age cannot be negative.")
    factor = get_rrif_min_factor(age, rrif_factors_table)
    min_withdrawal = min(balance * factor, balance) # Ensure min doesn't exceed balance
    return round(min_withdrawal, 2)

def calculate_oas_clawback(net_income_for_oas_test: float, oas_received_gross: float, fed_rules: Dict) -> float:
    """Calculates OAS clawback."""
    if oas_received_gross <= 0: return 0.0
    params = fed_rules.get("parameters")
    if not params: logging.warning("Federal OAS parameters missing."); return 0.0
    threshold = params.get("oas_clawback_threshold", float('inf')); rate = params.get("oas_clawback_rate", 0.0)
    clawback = max(0.0, (net_income_for_oas_test - threshold) * rate) if net_income_for_oas_test > threshold else 0.0
    final_clawback = min(clawback, oas_received_gross)
    return round(max(0, final_clawback), 2)

def _calculate_marginal_tax(income: float, brackets: List[Dict[str, Any]]) -> float:
    """Helper to calculate tax based on income brackets."""
    tax = 0.0
    if income <= 0: return 0.0
    sorted_brackets = sorted(brackets, key=lambda b: b['min_income'])
    last_max_income = 0.0
    for bracket in sorted_brackets:
        min_b = bracket["min_income"]; max_b = bracket["max_income"]; rate_b = bracket["rate"]
        if income > min_b:
            taxable_in_bracket = min(income, max_b) - min_b
            tax += taxable_in_bracket * rate_b
        if income <= max_b: break
    return round(tax, 2)

def _calculate_nrtc_value( eligible_bpa_base: float, eligible_age_base: float, eligible_pension_base: float, eligible_cpp_qpp_base: float, credit_rate: float) -> float:
    """Helper to sum eligible credit bases and multiply by credit rate."""
    total_credit_base = eligible_bpa_base + eligible_age_base + eligible_pension_base + eligible_cpp_qpp_base
    return round(total_credit_base * credit_rate, 2)

def calculate_federal_tax( taxable_income: float, net_income_for_credits_test: float, age: int, cpp_contributions_paid: float, pension_income_received: float, fed_rules: Dict) -> Dict[str, float]:
    """Calculates federal income tax, including common non-refundable credits."""
    if taxable_income < 0: taxable_income = 0.0
    default_result = {"gross_tax": 0.0, "nrtc_value": 0.0, "net_tax": 0.0, "bpa_claimed_base": 0.0, "age_claimed_base": 0.0, "pension_claimed_base": 0.0, "cpp_qpp_claimed_base": 0.0}
    income_brackets = fed_rules.get("income_brackets")
    if not income_brackets: logging.warning("Federal income brackets missing."); return default_result
    gross_fed_tax = _calculate_marginal_tax(taxable_income, income_brackets)
    credits_rules = fed_rules.get("credits", {})
    bpa_info = credits_rules.get("bpa", {}); eligible_bpa_base = bpa_info.get("amount", 0.0); fed_credit_rate = bpa_info.get("rate", 0.15)
    eligible_age_base = 0.0
    if age >= 65:
        age_info = credits_rules.get("age", {}); base = age_info.get("base_amount", 0.0); threshold = age_info.get("income_threshold", float('inf')); reduction_rate = age_info.get("reduction_rate", 0.0)
        reduction = max(0.0, (net_income_for_credits_test - threshold) * reduction_rate) if net_income_for_credits_test > threshold else 0.0
        eligible_age_base = max(0.0, base - reduction)
    eligible_pension_base = 0.0
    pension_info = credits_rules.get("pension", {})
    if pension_income_received > 0: eligible_pension_base = min(pension_income_received, pension_info.get("max_claim", 0.0))
    eligible_cpp_qpp_base = 0.0
    cpp_qpp_info = credits_rules.get("cpp_qpp", {})
    if cpp_contributions_paid > 0: eligible_cpp_qpp_base = min(cpp_contributions_paid, cpp_qpp_info.get("max_credit_base_claim", 0.0))
    fed_nrtc_value = _calculate_nrtc_value(eligible_bpa_base, eligible_age_base, eligible_pension_base, eligible_cpp_qpp_base, fed_credit_rate)
    net_fed_tax = max(0.0, gross_fed_tax - fed_nrtc_value)
    return {"gross_tax": gross_fed_tax, "nrtc_value": fed_nrtc_value, "net_tax": round(net_fed_tax, 2), "bpa_claimed_base": round(eligible_bpa_base, 2), "age_claimed_base": round(eligible_age_base, 2), "pension_claimed_base": round(eligible_pension_base, 2), "cpp_qpp_claimed_base": round(eligible_cpp_qpp_base, 2)}

def calculate_ontario_tax( taxable_income: float, net_income_for_credits_test: float, age: int, cpp_contributions_paid: float, pension_income_received: float, on_rules: Dict) -> Dict[str, float]:
    """Calculates Ontario provincial tax, including common credits and surtax."""
    if taxable_income < 0: taxable_income = 0.0
    default_result = {"gross_tax": 0.0, "nrtc_value": 0.0, "surtax": 0.0, "net_tax": 0.0, "bpa_claimed_base": 0.0, "age_claimed_base": 0.0, "pension_claimed_base": 0.0, "cpp_qpp_claimed_base": 0.0}
    income_brackets = on_rules.get("income_brackets")
    if not income_brackets: logging.warning("Ontario income brackets missing."); return default_result
    gross_on_tax = _calculate_marginal_tax(taxable_income, income_brackets)
    credits_rules = on_rules.get("credits", {})
    bpa_info_on = credits_rules.get("bpa", {}); eligible_bpa_base_on = bpa_info_on.get("amount", 0.0); on_credit_rate = bpa_info_on.get("rate", 0.0505)
    eligible_age_base_on = 0.0
    if age >= 65:
        age_info_on = credits_rules.get("age", {}); base_on = age_info_on.get("base_amount", 0.0); threshold_on = age_info_on.get("income_threshold", float('inf')); reduction_rate_on = age_info_on.get("reduction_rate", 0.0)
        reduction = max(0.0, (net_income_for_credits_test - threshold_on) * reduction_rate_on) if net_income_for_credits_test > threshold_on else 0.0
        eligible_age_base_on = max(0.0, base_on - reduction)
    eligible_pension_base_on = 0.0
    pension_info_on = credits_rules.get("pension", {})
    if pension_income_received > 0: eligible_pension_base_on = min(pension_income_received, pension_info_on.get("max_claim", 0.0))
    eligible_cpp_qpp_base_on = 0.0
    cpp_qpp_info_on = credits_rules.get("cpp_qpp", {})
    if cpp_contributions_paid > 0: eligible_cpp_qpp_base_on = min(cpp_contributions_paid, cpp_qpp_info_on.get("max_credit_base_claim", 0.0))
    on_nrtc_value = _calculate_nrtc_value(eligible_bpa_base_on, eligible_age_base_on, eligible_pension_base_on, eligible_cpp_qpp_base_on, on_credit_rate)
    on_tax_before_surtax = max(0.0, gross_on_tax - on_nrtc_value)
    surtax = 0.0
    surtax_rules = on_rules.get("surtax_on_tax")
    if surtax_rules and on_tax_before_surtax > 0:
        t1 = surtax_rules.get("threshold1_amount", float('inf')); r1 = surtax_rules.get("rate1_additional", 0.0)
        t2 = surtax_rules.get("threshold2_amount", float('inf')); r2_add = surtax_rules.get("rate2_additional_on_top_of_rate1", 0.0)
        surtax_on_tier1 = max(0.0, on_tax_before_surtax - t1) * r1 if on_tax_before_surtax > t1 else 0.0
        surtax_on_tier2 = max(0.0, on_tax_before_surtax - t2) * r2_add if on_tax_before_surtax > t2 else 0.0
        surtax = surtax_on_tier1 + surtax_on_tier2
    net_on_tax = on_tax_before_surtax + surtax
    return {"gross_tax": gross_on_tax, "nrtc_value": on_nrtc_value, "surtax": round(surtax, 2), "net_tax": round(net_on_tax, 2), "bpa_claimed_base": round(eligible_bpa_base_on, 2), "age_claimed_base": round(eligible_age_base_on, 2), "pension_claimed_base": round(eligible_pension_base_on, 2), "cpp_qpp_claimed_base": round(eligible_cpp_qpp_base_on, 2)}


# --- CORRECTED function signature and internal logic ---
def calculate_total_taxes_for_year(
    year: int,
    age: int,
    province_code: str,
    scenario_for_year: ScenarioInput, # Use ScenarioInput type
    rrif_withdrawal: float = 0.0,
    cpp_contributions_paid_this_year: float = 0.0
) -> Dict[str, Any]:
    """Orchestrates the calculation of all taxes for a single year for an individual."""
    year_rules = get_rules_for_year(year)
    fed_rules = year_rules.get("Federal"); prov_rules = year_rules.get(province_code)
    if not fed_rules: raise ValueError(f"Federal rules missing year {year}.")
    if not prov_rules: raise ValueError(f"Provincial rules missing province {province_code} year {year}.")

    # --- Extract Income Components FROM scenario_for_year ---
    effective_retirement_age = scenario_for_year.retirement_age if scenario_for_year.retirement_age else (scenario_for_year.age if scenario_for_year.retirement_status == "Retired" else float('inf'))
    current_employment_income = scenario_for_year.employment_income if age < effective_retirement_age else 0.0
    pension_income = scenario_for_year.pension_income
    cpp_benefit = scenario_for_year.cpp_amount if age >= scenario_for_year.cpp_start_age else 0.0
    oas_benefit_gross = scenario_for_year.oas_amount if age >= scenario_for_year.oas_start_age else 0.0
    other_taxable = scenario_for_year.combined_other_taxable_income # Use property
    # ----------------------------------------------------

    # 1. Total Income
    total_income = round( rrif_withdrawal + pension_income + cpp_benefit + oas_benefit_gross + current_employment_income + other_taxable, 2 )

    # 2. & 3. Net & Taxable Income (Simplification)
    net_income_for_tests = total_income
    taxable_income_for_rates = net_income_for_tests

    # 4. OAS Clawback
    actual_oas_clawback = calculate_oas_clawback(net_income_for_tests, oas_benefit_gross, fed_rules)
    oas_benefit_net = round(max(0, oas_benefit_gross - actual_oas_clawback), 2)

    # 5. Eligible Pension Income for Credit
    eligible_pension_income_for_credit = pension_income
    if age >= 65: eligible_pension_income_for_credit += rrif_withdrawal
    eligible_pension_income_for_credit = round(eligible_pension_income_for_credit, 2)

    # 6. Calculate Federal Tax
    fed_tax_details = calculate_federal_tax(taxable_income=taxable_income_for_rates, net_income_for_credits_test=net_income_for_tests, age=age, cpp_contributions_paid=cpp_contributions_paid_this_year, pension_income_received=eligible_pension_income_for_credit, fed_rules=fed_rules)

    # 7. Calculate Provincial Tax
    prov_tax_details = {}
    if province_code == "ON":
        prov_tax_details = calculate_ontario_tax(taxable_income=taxable_income_for_rates, net_income_for_credits_test=net_income_for_tests, age=age, cpp_contributions_paid=cpp_contributions_paid_this_year, pension_income_received=eligible_pension_income_for_credit, on_rules=prov_rules)
    else:
        raise NotImplementedError(f"Tax calculation for province {province_code} is not implemented.")

    # 8. Sum of Taxes
    total_income_tax_payable = round(fed_tax_details.get("net_tax", 0.0) + prov_tax_details.get("net_tax", 0.0), 2)
    net_cash = round(total_income - total_income_tax_payable - actual_oas_clawback, 2)

    # Return dictionary matching YearlyProjection + needed extras
    return {
        "year": year, "age": age, "province": province_code,
        "total_income": total_income,
        "net_income_for_tests": net_income_for_tests, # Can be useful for debugging
        "taxable_income_for_rates": taxable_income_for_rates, # Main input for tax
        # Income components used (match YearlyProjection where possible)
        "pension_income_calc": pension_income,          # Corresponds to 'pension' in YearlyProjection
        "cpp_income_calc": cpp_benefit,                 # Corresponds to 'cpp' in YearlyProjection
        "oas_benefit_gross": oas_benefit_gross,         # For info
        "oas_clawback": actual_oas_clawback,            # Corresponds to 'oas_clawback'
        "oas_benefit_net": oas_benefit_net,             # Corresponds to 'oas'
        "other_taxable_income_calc": other_taxable,     # Corresponds to 'other_taxable_income'
        "employment_income_calc": current_employment_income, # For info
        # Tax results
        "federal_tax_net": fed_tax_details.get("net_tax", 0.0),         # Corresponds to 'federal_tax'
        "provincial_tax_net": prov_tax_details.get("net_tax", 0.0),     # Corresponds to 'provincial_tax'
        "total_income_tax": total_income_tax_payable,                   # Corresponds to 'total_tax'
        "net_cash_after_tax_calc": net_cash                             # Corresponds to 'net_cash_after_tax'
        # Details below usually not needed by simulation caller, but useful for debug/prompt
        # "federal_tax_details": fed_tax_details,
        # "provincial_tax_details": prov_tax_details,
    }


# --- 4. Withdrawal Strategy Functions ---
def get_min_withdrawal(current_state: CurrentYearState, scenario: ScenarioInput) -> float:
    """Calculates the minimum required RRIF withdrawal."""
    year_rules = get_rules_for_year(current_state['year'])
    rrif_table = year_rules.get("RRIF_Factors")
    if not rrif_table: raise ValueError(f"RRIF factor table missing year {current_state['year']}")
    min_withdrawal = calculate_rrif_min_withdrawal( balance=current_state['current_rrif_balance'], age=current_state['age'], rrif_factors_table=rrif_table)
    return min_withdrawal

def get_optimized_withdrawal(current_state: CurrentYearState, scenario: ScenarioInput) -> float:
    """'Top-up-to-OAS-Threshold' strategy."""
    current_year = current_state['year']; current_age = current_state['age']; current_rrif_balance = current_state['current_rrif_balance']
    if current_rrif_balance <= 0: return 0.0
    year_rules = get_rules_for_year(current_year)
    rrif_table = year_rules.get("RRIF_Factors"); fed_rules = year_rules.get("Federal")
    if not rrif_table or not fed_rules: raise ValueError(f"Core rules missing year {current_year}")
    min_rrif_w = calculate_rrif_min_withdrawal(current_rrif_balance, current_age, rrif_table)

    # Calculate fixed income based on scenario and current age
    effective_retirement_age = scenario.retirement_age if scenario.retirement_age else (scenario.age if scenario.retirement_status == "Retired" else float('inf'))
    current_employment_income = scenario.employment_income if current_age < effective_retirement_age else 0.0
    fixed_income = round(
        scenario.pension_income +
        (scenario.cpp_amount if current_age >= scenario.cpp_start_age else 0.0) +
        (scenario.oas_amount if current_age >= scenario.oas_start_age else 0.0) +
        scenario.combined_other_taxable_income + # Use property
        current_employment_income, 2
    )
    net_income_if_min_taken = fixed_income + min_rrif_w
    oas_threshold = fed_rules.get("parameters", {}).get("oas_clawback_threshold", float('inf'))
    target_withdrawal = min_rrif_w
    if net_income_if_min_taken < oas_threshold:
        income_room = oas_threshold - net_income_if_min_taken
        extra_withdrawal_target = max(0.0, income_room - 1.0) # $1 buffer
        target_withdrawal = min_rrif_w + extra_withdrawal_target
    final_withdrawal = min(target_withdrawal, current_rrif_balance)
    final_withdrawal = max(min_rrif_w, final_withdrawal)
    return round(final_withdrawal, 2)

def get_empty_by_target_age_withdrawal(current_state: CurrentYearState, scenario: ScenarioInput) -> float:
    """Calculates withdrawal needed to deplete RRIF balance by target age."""
    # ... (Implementation remains the same as previous correct version) ...
    target_age = scenario.target_rrif_depletion_age; current_age = current_state['age']; current_balance = current_state['current_rrif_balance']; rate_of_return = scenario.expect_return_pct / 100.0
    if target_age is None or current_age >= target_age or current_balance <= 0: return get_min_withdrawal(current_state, scenario)
    years_remaining = target_age - current_age
    if years_remaining <= 0: return get_min_withdrawal(current_state, scenario)
    withdrawal_amount = 0.0
    if NUMPY_FINANCIAL_AVAILABLE and npf:
        try:
            effective_rate = rate_of_return if rate_of_return > 0 else 0.0
            if effective_rate == 0: withdrawal_amount = current_balance / years_remaining
            else: withdrawal_amount = npf.pmt(effective_rate, years_remaining, -current_balance, fv=0)
            withdrawal_amount = max(0.0, withdrawal_amount)
        except Exception as e: logging.warning(f"Numpy_financial.pmt failed: {e}. Using fallback."); withdrawal_amount = current_balance / years_remaining
    else: withdrawal_amount = current_balance / years_remaining
    min_withdrawal_req = get_min_withdrawal(current_state, scenario)
    final_withdrawal = max(min_withdrawal_req, withdrawal_amount)
    final_withdrawal = min(final_withdrawal, current_balance)
    return round(final_withdrawal, 2)


# --- Example Usage and Basic Tests ---
if __name__ == "__main__":
    # Imports needed within this block if running directly
    import json
    from .models import SpouseInfo, NonRegisteredAccount # Import necessary models

    logging.basicConfig(level=logging.WARNING)

    print(f"--- Testing Tax Calculation with New Scenario ({TAX_YEAR_DATA}) ---")
    # Create a fully populated test scenario matching the model
    test_scenario_full = ScenarioInput(
         age=73,
         retirement_status="Retired",
         retirement_age=73,
         rrsp_balance=500000, # Added back
         employment_income=0,
         pension_type="DB",
         pension_income=20000,
         cpp_start_age=65,
         cpp_amount=10000,
         oas_start_age=65,
         oas_amount=8000,
         other_investment_income=0, # Input field
         has_spouse=True,
         spouse_details=SpouseInfo(age=71, rrsp_balance=300000, employment_income=0, pension_income=50000, cpp_oas_income=0, investment_income=0),
         beneficiary_intent="Spouse",
         desired_spending=89000,
         tax_target="Avoid OAS Clawback",
         tfsa_balance=100000,
         non_registered_details=None,
         health_considerations="Average",
         planning_horizon_years=10, # Correct field name
         expect_return_pct=6.0,
         inflation_rate_pct=2.0,
         target_rrif_depletion_age=83,
         province="ON",
         future_residence_intent="Remain in Province",
         start_year=2025
    )

    # Test tax calculation for a specific withdrawal
    rrif_wd_test = 53000
    tax_results_test = calculate_total_taxes_for_year(
        year=2025,
        age=73,
        province_code="ON",
        scenario_for_year=test_scenario_full, # Pass the whole scenario
        rrif_withdrawal=rrif_wd_test
    )
    print(f"Tax results for Age 73, RRIF WD ${rrif_wd_test}:")
    print(json.dumps(tax_results_test, indent=2, default=str))

    print(f"\n--- Testing Withdrawal Strategies ({TAX_YEAR_DATA}) ---")
    state_test: CurrentYearState = {'year': 2025, 'age': 73, 'current_rrif_balance': 500000, 'inflation_rate_pct': 2.0}
    min_w = get_min_withdrawal(state_test, test_scenario_full)
    opt_w = get_optimized_withdrawal(state_test, test_scenario_full)
    empty_w = get_empty_by_target_age_withdrawal(state_test, test_scenario_full)
    print(f"Withdrawals for Age 73, RRIF $500k:")
    print(f"  Min: ${min_w:.2f}")
    print(f"  TopUp: ${opt_w:.2f}")
    print(f"  EmptyBy83: ${empty_w:.2f} (Needs numpy_financial: {NUMPY_FINANCIAL_AVAILABLE})")
    