# backend/src/main.py

import os
import logging
from typing import Any, Optional, Dict
import datetime

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# --- Google Generative AI ---
import google.generativeai as genai
# ----------------------------

# --- CORRECTED MODEL IMPORTS ---
from .models import (
    HealthStatus,
    AdviceRequest,
    ScenarioInput,
    AdviceResponse,   # Use the new response model
    StrategyResult,   # Need this for simulation results
    SummaryMetrics,   # Need this for prompt data
    YearlyProjection, # Need this for prompt data
    SpouseInfo        # Need this for prompt data
)
# --------------------------------

# Import calculator and simulation functions
from .calculator import (
    get_min_withdrawal,
    get_optimized_withdrawal,
    get_empty_by_target_age_withdrawal,
    get_rules_for_year,
    calculate_total_taxes_for_year
)
from .simulation import simulate_strategy

# --- Load Environment Variables ---
load_dotenv()
# --------------------------------

# --- Configure Logging ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
# --------------------------

# --- Configure Google AI ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY not found. LLM explanations disabled.")
else:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        logger.info("Google Generative AI configured.")
    except Exception as e:
        logger.error(f"Failed to configure Google Generative AI: {e}", exc_info=True)
        GOOGLE_API_KEY = None
# --------------------------

# --- FastAPI App Instantiation ---
app = FastAPI(
    title="Retirement Planner Advice API",
    description="Provides multi-strategy retirement withdrawal analysis.",
    version="0.2.0",
)

# --- CORS Configuration ---
origins = ["http://localhost:5173", "http://localhost:3000"] # Adjust as needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
# --------------------------


# --- LLM Prompt Formatting Function ---
def format_llm_report_prompt(
    scenario: ScenarioInput,
    results: Dict[str, StrategyResult]
) -> Optional[str]:
    """Formats the comprehensive prompt for the LLM report."""
    try:
        min_res = results.get("Minimum only")
        topup_res = results.get("Top-up-to-OAS")
        empty_res = results.get("Empty-by-Target-Age")

        if not min_res or not topup_res:
            logger.error("Missing essential simulation results for prompt formatting.")
            return None

        # Get context
        current_datetime = datetime.datetime.now()
        start_year = scenario.start_year if scenario.start_year else current_datetime.year + 1
        rules = get_rules_for_year(start_year)
        if not rules:
            logger.error(f"Tax rules missing for start year {start_year} in prompt formatting.")
            return None
        fed_rules = rules.get("Federal", {}); prov_rules = rules.get(scenario.province, {})
        oas_threshold_val = fed_rules.get("parameters", {}).get("oas_clawback_threshold")
        oas_threshold_str = f"${oas_threshold_val:,.0f}" if oas_threshold_val else "~$91k"

        # --- Extract First Year Top-Up Data (approximate values) ---
        setup_data = topup_res.yearly_data[0] if topup_res.yearly_data else None
        topup_wd_yr1_val = setup_data.withdrawal if setup_data else 0
        topup_wd_yr1 = f"${round(topup_wd_yr1_val / 1000) * 1000:,.0f}"
        # Use total_taxable_income field from YearlyProjection
        taxable_inc_yr1 = f"${round(setup_data.total_taxable_income / 1000) * 1000:,.0f}" if setup_data else "N/A"
        tax_est_yr1 = f"${round(setup_data.total_tax / 1000) * 1000:,.0f}" if setup_data else "N/A"
        min_wd_yr1_val = setup_data.min_withdrawal if setup_data else 0
        min_wd_yr1 = f"${round(min_wd_yr1_val / 1000) * 1000:,.0f}" if setup_data else "N/A"
        # Use specific income fields from scenario
        fixed_income = scenario.pension_income + (scenario.cpp_amount if scenario.age >= scenario.cpp_start_age else 0.0) + (scenario.oas_amount if scenario.age >= scenario.oas_start_age else 0.0)
        net_cash_yr1_val = (fixed_income + topup_wd_yr1_val + scenario.combined_other_taxable_income) - (setup_data.total_tax if setup_data else 0) if setup_data else 0
        net_cash_yr1 = f"${round(net_cash_yr1_val / 1000) * 1000:,.0f}"
        tfsa_topup_yr1_val = max(0, round(scenario.desired_spending - net_cash_yr1_val))
        tfsa_topup_yr1 = f"${round(tfsa_topup_yr1_val / 1000) * 1000:,.0f}"
        split_amount_yr1_val = (topup_wd_yr1_val / 2) if setup_data and scenario.spouse_details and scenario.age >= 65 else 0 # Check spouse_details
        split_amount_yr1 = f"${round(split_amount_yr1_val / 1000) * 1000:,.0f}" if split_amount_yr1_val > 0 else ""

        # --- Extract Comparison Table Data (approximate values) ---
        min_wd_start = f"${round(min_res.yearly_data[0].withdrawal / 1000) * 1000:,.0f}" if min_res.yearly_data else "N/A"
        topup_wd_start = topup_wd_yr1 # Already formatted approx

        empty_wd_start_val = empty_res.yearly_data[0].withdrawal if empty_res and empty_res.yearly_data else "N/A"
        empty_wd_start = f"${round(empty_wd_start_val / 1000) * 1000:,.0f}" if isinstance(empty_wd_start_val, (int, float)) else "N/A"

        min_rrif_end = f"${round(min_res.summary_metrics.rrif_balance_at_end_horizon / 1000) * 1000:,.0f}"
        topup_rrif_end = f"${round(topup_res.summary_metrics.rrif_balance_at_end_horizon / 1000) * 1000:,.0f}"
        empty_rrif_end_val = empty_res.summary_metrics.rrif_balance_at_end_horizon if empty_res else None
        empty_rrif_end = f"${round(empty_rrif_end_val / 1000) * 1000:,.0f}" if isinstance(empty_rrif_end_val, (int, float)) else "≈ $0"

        min_tax_terminal = f"${round(min_res.summary_metrics.terminal_tax_estimate / 1000) * 1000:,.0f}"
        topup_tax_terminal = f"${round(topup_res.summary_metrics.terminal_tax_estimate / 1000) * 1000:,.0f}"
        empty_tax_terminal_val = empty_res.summary_metrics.terminal_tax_estimate if empty_res else None
        empty_tax_terminal = f"${round(empty_tax_terminal_val / 1000) * 1000:,.0f}" if isinstance(empty_tax_terminal_val, (int, float)) else "≈ $0"

        # <<< DEFINITION CORRECTED AND MOVED >>>
        target_depletion_age_str = f"Empty-by-{scenario.target_rrif_depletion_age}" if scenario.target_rrif_depletion_age else "N/A (Not Run)"
        # <<< END OF CORRECTION >>>

        savings_terminal_tax_val = (min_res.summary_metrics.terminal_tax_estimate - topup_res.summary_metrics.terminal_tax_estimate) if isinstance(min_res.summary_metrics.terminal_tax_estimate, (int, float)) and isinstance(topup_res.summary_metrics.terminal_tax_estimate, (int, float)) else 0
        savings_terminal_tax = f"${round(savings_terminal_tax_val / 1000) * 1000:,.0f}"

        # Pre-format conditional strings
        spouse_str = 'Yes' if scenario.has_spouse else 'No' # Use has_spouse flag
        spouse_details_str = f' (Other Inc: ${scenario.spouse_details.total_other_income:,.0f}/yr, RRSP: ${scenario.spouse_details.rrsp_balance:,.0f})' if scenario.has_spouse and scenario.spouse_details else ''
        target_depletion_str = f'*   Target RRIF Depletion Age: {scenario.target_rrif_depletion_age}' if scenario.target_rrif_depletion_age else ''

        # Use spouse_details property for income check
        pension_split_setup = f'''**Pension-income splitting:**
Because RRIF income qualifies as eligible pension income after age 65, you can elect each year to allocate up to 50% of the RRIF withdrawal (≈ {split_amount_yr1}) to your spouse. This lets you fine-tune both of your taxable incomes so neither potentially crosses the OAS threshold ({oas_threshold_str}). This requires careful consideration of your spouse's other income (${scenario.spouse_details.total_other_income:,.0f}).''' if split_amount_yr1 and scenario.has_spouse and scenario.spouse_details else ''
        pension_split_tip = f'*   **Split Income:** Actively use pension income splitting with your spouse to minimize your combined tax and potentially keep both below the OAS threshold ({oas_threshold_str}). Review the optimal split amount annually, considering your spouse\'s income (${scenario.spouse_details.total_other_income:,.0f}).' if scenario.has_spouse and scenario.spouse_details else ''
        beneficiary_tip = '*   **Beneficiary (Spouse):** Ensure your spouse is formally named as the primary RRIF beneficiary for a tax-free rollover at first death. Update the designation if circumstances change.' if scenario.has_spouse else '*   **Beneficiary:** Name a beneficiary (individual, estate, or charity) for your RRIF to avoid probate where applicable and ensure assets go where intended.'
        empty_row = f'| {target_depletion_age_str:<28} | ≈ {"N/A" if empty_wd_start == "N/A" else empty_wd_start} (rises)            | {empty_rrif_end}                             | {empty_tax_terminal}                                   | Fastest depletion, likely highest annual tax. Eliminates terminal RRIF tax. |' if empty_res else ''
        pension_split_bottom_line = 'Use pension income splitting strategically with your spouse. ' if scenario.has_spouse else ''


        # --- Build the Final Prompt using pre-formatted parts ---
        prompt = f"""
You are an expert Canadian tax advisor creating a retirement withdrawal report for an Ontario client. Adopt a helpful, slightly formal advisory tone. Use approximations (e.g., "≈ $XX,XXX") for most monetary values you generate, rounding to the nearest thousand where appropriate, unless precise source data is given. Follow the requested Markdown format precisely. **Do not include any backslashes unless part of standard markdown like bullet points.**

**Client Summary (for your context):**
*   Age: {scenario.age}, {scenario.retirement_status}, Province: {scenario.province}
*   RRSP: ${scenario.rrsp_balance:,.0f}
*   Workplace Pension: ${scenario.pension_income:,.0f}/yr ({scenario.pension_type or 'N/A'})
*   CPP: ${scenario.cpp_amount:,.0f}/yr (Started Age {scenario.cpp_start_age})
*   OAS: ${scenario.oas_amount:,.0f}/yr (Started Age {scenario.oas_start_age})
*   Employment Income: ${scenario.employment_income:,.0f}/yr
*   Other Investment Income: ${scenario.other_investment_income:,.0f}/yr
*   TFSA: ${scenario.tfsa_balance:,.0f}
*   Spouse: {spouse_str}{spouse_details_str}
*   Desired Spending: ${scenario.desired_spending:,.0f}/yr (after tax)
*   Planning Horizon: {scenario.planning_horizon_years} years ({scenario.health_considerations} health outlook)
*   Return Assumption: {scenario.expect_return_pct:.1f}% nominal
*   Inflation Assumption: {scenario.inflation_rate_pct:.1f}%
{target_depletion_str}
*   Key Threshold: OAS Clawback starts around {oas_threshold_str} net income ({start_year} estimate).
*   Tax Target Goal: {scenario.tax_target or 'Not specified'}
*   Beneficiary Intent: {scenario.beneficiary_intent or 'Not specified'}
*   Future Residence: {scenario.future_residence_intent or 'Not specified'}

**Instructions:** Generate the report using the following structure and incorporating the simulation data provided below. Add the narrative explanations and tips as shown in the desired format.

**Simulation Data Snippets (Use these for report generation):**
*   Year 1 Top-up: RRIF WD ≈ {topup_wd_yr1}, Tax Inc ≈ {taxable_inc_yr1}, Est Tax ≈ {tax_est_yr1}, Min RRIF WD ≈ {min_wd_yr1}
*   Year 1 Min: RRIF WD ≈ {min_wd_start}
*   Year 1 Empty: RRIF WD ≈ {empty_wd_start}
*   End {scenario.planning_horizon_years}yr Min: RRIF Bal ≈ {min_rrif_end}, Term Tax ≈ {min_tax_terminal}
*   End {scenario.planning_horizon_years}yr Top-up: RRIF Bal ≈ {topup_rrif_end}, Term Tax ≈ {topup_tax_terminal}
*   End {scenario.planning_horizon_years}yr Empty: RRIF Bal {empty_rrif_end}, Term Tax {empty_tax_terminal}
*   Terminal Tax Saving (Top-up vs Min): ≈ {savings_terminal_tax}
{f'*   Pension Split Amount (Year 1, up to 50%): ≈ {split_amount_yr1}' if split_amount_yr1 else ''}

--- REPORT FORMAT START ---

**1 Set-up for {start_year} (age {scenario.age})**

*This setup reflects the recommended "Top-up-to-OAS" strategy's first year.*

| Item                      | Amount        | Notes                                                         |
| :------------------------ | :------------ | :------------------------------------------------------------ |
| Workplace Pension         | ${scenario.pension_income:,.0f}    | Fully taxable                                                 |
| CPP                       | ${scenario.cpp_amount:,.0f}        | Fully taxable                                                 |
| OAS                       | ${scenario.oas_amount:,.0f}        | Fully taxable unless income > {oas_threshold_str}             |
| Target RRIF withdrawal  | ≈ {topup_wd_yr1} | Brings combined taxable income near the OAS ceiling if possible |
| Taxable income (est.)   | ≈ {taxable_inc_yr1} | Aiming to stay below OAS claw-back                         |
| Estimated income tax    | ≈ {tax_est_yr1} | After basic credits. This is an estimate.                |
| Net cash after tax      | ≈ {net_cash_yr1} | (Pension+CPP+OAS+RRIF W/D+Other Inc - Est. Tax)             |
| Top-up from TFSA needed | ≈ {tfsa_topup_yr1} | To reach the ${scenario.desired_spending:,.0f} spending goal       |

**Why ≈ {topup_wd_yr1}?**
Minimum RRIF at age {scenario.age} is only ≈ {min_wd_yr1} on ${scenario.rrsp_balance:,.0f}, but drawing just the minimum leaves a very large balance to be taxed later. By taking ≈ {topup_wd_yr1} ("topping-up-to-the-bracket" or OAS threshold) each year we aim to:
*   Avoid the 15% OAS recovery tax, if income stays below {oas_threshold_str}.
*   Keep the combined marginal rate lower than the 40-53%+ rate that could apply to a lump-sum at death.
*   Melt the RRIF account faster to slash the potential terminal tax bill.

{pension_split_setup}

**2 How the strategies compare over {scenario.planning_horizon_years} years**

| Strategy                     | Annual RRIF Withdrawal (Approx. Year 1, nominal $) | RRIF balance in {scenario.planning_horizon_years} years* | Est. Terminal Tax on RRIF (Last-to-die)* | Notes                                                    |
| :--------------------------- | :---------------------------------------------------- | :------------------------------------------------ | :---------------------------------------------------- | :------------------------------------------------------- |
| Minimum only                 | ≈ {min_wd_start} (rises)            | ≈ {min_rrif_end}                             | ≈ {min_tax_terminal}                                   | Highest lifetime deferral, but large potential terminal tax. |
| Top-up-to-OAS (recommended) | ≈ {topup_wd_start} (indexed approx.)    | ≈ {topup_rrif_end}                             | ≈ {topup_tax_terminal}                                   | Saves ≈ {savings_terminal_tax} in terminal tax vs minimum. Keeps annual tax moderate. |
{empty_row}

*\*Assumes {scenario.expect_return_pct:.1f}% nominal return, {scenario.inflation_rate_pct:.1f}% inflation, {scenario.planning_horizon_years}-year lifespan, {start_year} tax rules/rates. These are estimates and actual results will vary. Table excludes income splitting impact.*

**3 Fine-tuning tips**

*   **Re-run Annually:** Index the "top-up" withdrawal amount to the new OAS threshold (it usually rises each year). Re-evaluate based on actual returns and updated circumstances.
{pension_split_tip}
*   **Recycle to TFSAs:** When TFSA contribution room opens (approx. $7,000 expected for 2025, indexed thereafter), consider withdrawing that extra amount from the RRIF (if your tax situation allows without negative consequences like higher clawbacks or loss of GIS if applicable), paying the tax, and contributing the net amount to your or your spouse's TFSA to shelter future growth tax-free.
{beneficiary_tip}
*   **Contingency:** If charitable giving is intended ({f"Client indicated intent: {scenario.beneficiary_intent}" if scenario.beneficiary_intent=='Charity' else "Consider if applicable"}), naming a charity as a contingent RRIF beneficiary or leaving a legacy in your will(s) can create tax credits to offset up to 100% of the deemed income tax in the year of the last death.
*   **Insurance:** If maximizing the net estate value for heirs is a primary goal, explore using permanent life insurance (funded by withdrawals) to cover the anticipated final RRIF tax liability. This is a complex strategy requiring professional advice.

**4 Bottom line**
The recommended "Top-up-to-OAS" strategy involves drawing significantly more than the minimum from your RRIF each year (starting around **≈ {topup_wd_yr1}** in {start_year}), aiming to keep your net income just below the OAS clawback threshold ({oas_threshold_str}). {pension_split_bottom_line}Top up spending needs from your TFSA (approx. **≈ {tfsa_topup_yr1}** needed in {start_year}). This strategy significantly reduces the projected RRIF balance (from ${scenario.rrsp_balance:,.0f} ➔ ≈ {topup_rrif_end} in {scenario.planning_horizon_years} years) and cuts the potential terminal tax bill by ≈ **{savings_terminal_tax}** compared to only taking minimums, while keeping your annual tax rate moderate during retirement. Remember to revisit this plan annually as circumstances and tax rules change. Consult with a financial advisor to ensure this plan aligns with your overall financial goals and risk tolerance ({scenario.health_considerations} health outlook noted).

--- REPORT FORMAT END ---
"""
        return prompt.strip()

    except Exception as e:
        logger.error(f"Error formatting LLM advisory prompt: {e}", exc_info=True)
        return None


# --- API Endpoints ---
@app.get("/", tags=["Status"], summary="Root Endpoint")
async def root():
    return {"message": "Welcome to the Retirement Planner API"}

@app.get("/health", response_model=HealthStatus, tags=["Status"], summary="Health Check")
async def health_check():
    return HealthStatus(status="ok")

@app.post(
    "/v1/advice",
    response_model=AdviceResponse, # Uses updated response model
    status_code=status.HTTP_200_OK,
    tags=["Advice"],
    summary="Generate Retirement Withdrawal Advice Report",
    description="Generates a detailed, structured advisory text comparing retirement withdrawal strategies."
)
async def generate_advice(request: AdviceRequest) -> AdviceResponse:
    """
    Main endpoint: Simulates strategies and generates advisory text via LLM.
    """
    request_id = request.request_id or "N/A"
    logger.info(f"Received advice generation request (ID: {request_id}).")

    try:
        scenario: ScenarioInput = request.scenario
        logger.info(f"Processing scenario for age: {scenario.age}, RRSP balance: {scenario.rrsp_balance}, Province: {scenario.province}, Horizon: {scenario.planning_horizon_years}") # Use planning_horizon_years

        # Basic validation (using model validation implicitly)
        if scenario.planning_horizon_years <= 0: raise ValueError("Planning horizon must be > 0 years.")

        # --- Run Multiple Simulations ---
        simulation_results: Dict[str, StrategyResult] = {}

        logger.info(f"Simulating Minimum Only strategy (ID: {request_id})...")
        simulation_results["Minimum only"] = simulate_strategy(scenario, get_min_withdrawal, "Minimum only")

        logger.info(f"Simulating Top-up-to-OAS strategy (ID: {request_id})...")
        simulation_results["Top-up-to-OAS"] = simulate_strategy(scenario, get_optimized_withdrawal, "Top-up-to-OAS")

        if scenario.target_rrif_depletion_age:
            logger.info(f"Simulating Empty-by-Target-Age ({scenario.target_rrif_depletion_age}) strategy (ID: {request_id})...")
            simulation_results["Empty-by-Target-Age"] = simulate_strategy(scenario, get_empty_by_target_age_withdrawal, "Empty-by-Target-Age")
        else:
             logger.info(f"Skipping Empty-by-Target-Age simulation (ID: {request_id}).")


        # --- LLM Advisory Text Generation ---
        llm_report_markdown: str = "Error: Advice generation failed."
        if GOOGLE_API_KEY:
            logger.info(f"Generating LLM advisory report (ID: {request_id})...")
            prompt = format_llm_report_prompt(scenario, simulation_results)

            if prompt:
                try:
                    model = genai.GenerativeModel('gemini-1.5-flash-latest')
                    generation_config = genai.types.GenerationConfig(temperature=0.25) # Lower temperature for more factual report
                    # Configure safety settings to be less restrictive if needed, but be careful
                    # safety_settings = {
                    #     HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    #     HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    #     HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    #     HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    # }
                    response = await model.generate_content_async(
                        prompt,
                        generation_config=generation_config,
                        # safety_settings=safety_settings, # Uncomment to use safety settings
                        request_options={'timeout': 180} # 3 minutes timeout
                    )

                    # Check response and potential blocking
                    try:
                        llm_report_markdown = response.text
                        logger.info(f"LLM advisory report generated successfully (ID: {request_id}). Length: {len(llm_report_markdown)}")
                    except ValueError:
                        # If response.text fails, it might be blocked
                        logger.warning(f"Could not extract text from LLM response, likely blocked (ID: {request_id}).")
                        logger.warning(f"LLM Response: {response}") # Log the whole response object for debugging
                        finish_reason = response.candidates[0].finish_reason if hasattr(response, 'candidates') and response.candidates else "Unknown"
                        safety_ratings = response.prompt_feedback.safety_ratings if hasattr(response, 'prompt_feedback') else "N/A"
                        llm_report_markdown = f"Error: Could not generate advisory report (LLM response blocked - Reason: {finish_reason}). Review safety settings and prompt."
                        if response.prompt_feedback:
                             llm_report_markdown += f"\nLLM Feedback: {response.prompt_feedback}"


                except Exception as llm_error:
                    logger.error(f"Error generating LLM advisory report (ID: {request_id}): {llm_error}", exc_info=True)
                    llm_report_markdown = f"Error: Could not generate advisory report ({type(llm_error).__name__}). Please check server logs."
            else:
                logger.warning(f"Could not format prompt for LLM advisory report (ID: {request_id}).")
                llm_report_markdown = "Error: Could not prepare information for advice generation." # Keep this specific error
        else:
            logger.warning(f"Skipping LLM advisory report as GOOGLE_API_KEY is not configured (ID: {request_id}).")
            llm_report_markdown = "Advice generation disabled (API key missing)."

        # --- Structure Final Response ---
        advice_response = AdviceResponse(
            report_markdown=llm_report_markdown,
            simulation_results=list(simulation_results.values()) # Pass simulation data to frontend
        )
        logger.info(f"Successfully generated advice response (Result ID: {advice_response.result_id}, Request ID: {request_id})")
        return advice_response

    # --- Error Handling ---
    except ValueError as ve:
        logger.error(f"Value error (ID: {request_id}): {ve}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Input/Calculation Error: {ve}")
    except NotImplementedError as nie:
         logger.error(f"Not implemented error (ID: {request_id}): {nie}", exc_info=True)
         raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=f"Feature Not Implemented: {nie}")
    except Exception as e:
        logger.error(f"Unexpected error (ID: {request_id}): {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal Server Error.")

# --------------------------------------------------------------------------
