# backend/src/models.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID, uuid4

# --- Basic Models ---

class HealthStatus(BaseModel):
    status: str

class SpouseInfo(BaseModel):
    age: int = Field(..., ge=0)
    rrsp_balance: float = Field(..., ge=0.0)
    employment_income: float = Field(default=0.0, ge=0.0)
    pension_income: float = Field(default=0.0, ge=0.0)
    cpp_oas_income: float = Field(default=0.0, ge=0.0)
    investment_income: float = Field(default=0.0, ge=0.0)
    @property
    def total_other_income(self) -> float:
        return self.employment_income + self.pension_income + self.cpp_oas_income + self.investment_income

class NonRegisteredAccount(BaseModel):
    balance: float = Field(default=0.0, ge=0.0)
    unrealized_capital_gains: float = Field(default=0.0, ge=0.0)

# --- Data Structures for Simulation Results ---

class YearlyProjection(BaseModel):
    year: int
    age: int
    start_rrif: float
    withdrawal: float
    investment_growth: float
    min_withdrawal: float
    pension: float # Primary user's pension
    cpp: float
    oas: float # Net OAS
    oas_clawback: float
    other_taxable_income: float # Added for clarity in table/prompt
    total_taxable_income: float
    federal_tax: float
    provincial_tax: float
    total_tax: float
    net_cash_after_tax: float # Added for clarity in table/prompt
    end_rrif: float
    tfsa_balance: float

class SummaryMetrics(BaseModel):
    total_tax_paid: float
    terminal_rrif_balance: float
    terminal_tax_estimate: float
    years_oas_clawback: int
    avg_annual_tax_rate: float
    rrif_balance_at_end_horizon: float

class StrategyResult(BaseModel):
    strategy_name: str
    summary_metrics: SummaryMetrics
    yearly_data: List[YearlyProjection]

# --- API Request/Response Structures ---

class ScenarioInput(BaseModel):
    """Defines the structure for the user's input financial scenario."""
    # Section 1: Age & Retirement
    age: int = Field(..., ge=55, le=110)
    retirement_status: str = Field(default="Retired")
    retirement_age: Optional[int] = Field(default=None, ge=55, le=110)

    # <<< ADDED BACK RRSP BALANCE >>>
    rrsp_balance: float = Field(..., ge=0.0, description="Your current total RRSP/RRIF balance.")
    # <<< END OF ADDITION >>>

    # Section 2: Other Income Sources (Primary User)
    employment_income: float = Field(default=0.0, ge=0.0)
    pension_type: Optional[str] = Field(default=None)
    pension_income: float = Field(default=0.0, ge=0.0) # Renamed from defined_benefit_pension
    cpp_start_age: int = Field(default=65, ge=60, le=70)
    cpp_amount: float = Field(default=0.0, ge=0.0) # Renamed from cpp
    oas_start_age: int = Field(default=65, ge=65, le=70)
    oas_amount: float = Field(default=0.0, ge=0.0) # Renamed from oas
    other_investment_income: float = Field(default=0.0, ge=0.0) # E.g. Rent, Non-Reg dividends/interest

    # Section 3: Family/Beneficiary
    has_spouse: bool = Field(...)
    spouse_details: Optional[SpouseInfo] = Field(default=None)
    beneficiary_intent: Optional[str] = Field(default="Spouse/Estate")

    # Section 4: Spending & Tax Target
    desired_spending: float = Field(..., ge=0.0)
    tax_target: Optional[str] = Field(default="Avoid OAS Clawback")

    # Section 5: Other Accounts
    tfsa_balance: float = Field(default=0.0, ge=0.0)
    non_registered_details: Optional[NonRegisteredAccount] = Field(default=None)

    # Section 6: Health, Longevity, Growth
    health_considerations: Optional[str] = Field(default="Average")
    planning_horizon_years: int = Field(..., ge=1, le=50) # Renamed from life_expectancy_years
    expect_return_pct: float = Field(..., ge=-10.0, le=25.0)
    inflation_rate_pct: float = Field(..., ge=0.0, le=10.0)
    target_rrif_depletion_age: Optional[int] = Field(default=None, ge=56, le=110)

    # Section 7: Residence
    province: str = Field(default='ON', pattern=r'^[A-Z]{2}$')
    future_residence_intent: Optional[str] = Field(default="Remain in Province")

    # Other
    start_year: Optional[int] = Field(default=None, ge=date.today().year, le=2050)

    # --- VALIDATORS ---
    # ... (Keep existing validators for retirement_age, spouse_details, target_rrif_depletion_age) ...
    @validator('retirement_age')
    def check_retirement_age(cls, v, values): # ... (as before) ...
        if v is not None and 'age' in values and v > values['age'] and values.get('retirement_status') == 'Retired': raise ValueError('Retirement age cannot be in the future if already retired.')
        return v
    @validator('spouse_details')
    def check_spouse_details(cls, v, values): # ... (as before) ...
        if values.get('has_spouse') and v is None: raise ValueError('Spouse details must be provided.')
        if not values.get('has_spouse') and v is not None: raise ValueError('Spouse details should not be provided.')
        return v
    @validator('target_rrif_depletion_age')
    def check_depletion_age(cls, v, values): # ... (as before) ...
        if v is not None and 'age' in values:
            if v <= values['age']: raise ValueError('Target depletion age must be greater than current age.')
        return v

    # Consolidate other taxable income
    @property
    def combined_other_taxable_income(self) -> float:
         # This property now correctly reflects the model fields
         # Note: employment_income is handled separately in tax calc based on retirement status/age
         return self.other_investment_income

class AdviceRequest(BaseModel):
    request_id: Optional[str] = Field(default=None)
    scenario: ScenarioInput

class AdviceResponse(BaseModel):
    result_id: UUID = Field(default_factory=uuid4)
    scenario_id: UUID = Field(default_factory=uuid4)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    report_markdown: str = Field(...)
    # Include raw simulation data needed for the frontend table
    simulation_results: List[StrategyResult] = Field(...)
    