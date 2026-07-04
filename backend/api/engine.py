import os
import pandas as pd
import numpy as np
from dateutil.relativedelta import relativedelta
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass

@dataclass(frozen=True)
class ValuationParameters:
    valuation_date: pd.Timestamp = pd.to_datetime("2026-01-01")
    interest_rate_annual: float = 0.05
    expense_maintenance: float = 0.0025  # gamma
    margin_mortality: float = 0.03       # ro1
    margin_investment: float = 0.0       # ro2
    cost_acquisition_initial: float = 0.0 # alpha
    cost_acquisition: float = 0.003    # betta
    payment_frequency: int = 12
    default_policy_type: str = "Ipoteka"

@dataclass
class PolicyRecord:
    policy_id: str
    dob: pd.Timestamp
    inception_date: pd.Timestamp
    maturity_date: pd.Timestamp
    sum_insured_initial: float
    net_premium: float
    credit_apr: float
    policy_type: str

class FinancialPrimitives:
    @staticmethod
    def calculate_annuity_installment(principal: float, period_rate: float, total_periods: int) -> float:
        if period_rate == 0.0:
            return principal / total_periods if total_periods else 0.0
        discount_factor = (1.0 + period_rate) ** total_periods
        return (principal * period_rate * discount_factor) / (discount_factor - 1.0) if discount_factor != 1.0 else 0.0

    @staticmethod
    def project_outstanding_balance(installment: float, period_rate: float, remaining_periods: np.ndarray) -> np.ndarray:
        if period_rate == 0.0:
            return installment * remaining_periods
        discount_array = np.power(1.0 + period_rate, remaining_periods)
        return installment * (1.0 - 1.0 / discount_array) / period_rate

class TimeMetrics:
    @staticmethod
    def elapsed_months(start: pd.Timestamp, end: pd.Timestamp) -> int:
        months = (end.year - start.year) * 12 + (end.month - start.month)
        if end.day < start.day:
            months -= 1
        return max(0, months)

    @staticmethod
    def completed_years(birth: pd.Timestamp, target: pd.Timestamp) -> int:
        years = target.year - birth.year
        if (target.month, target.day) < (birth.month, birth.day):
            years -= 1
        return max(0, years)

    @staticmethod
    def align_to_payment_cycle(valuation_date: pd.Timestamp, start_date: pd.Timestamp) -> pd.Timestamp:
        delta_months = (valuation_date.year - start_date.year) * 12 + (valuation_date.month - start_date.month)
        candidate_date = start_date + relativedelta(months=delta_months)
        return candidate_date - relativedelta(months=1) if candidate_date > valuation_date else candidate_date


class MortalityService:
    def __init__(self, monthly_csv_path: str):
        df = pd.read_csv(monthly_csv_path)
        
        # Monthlydeathtable.csv has columns: X, l(x), d(x)
        # Parse l(x) and d(x)
        lx_str = df['l(x)'].astype(str).str.replace(',', '', regex=False).str.replace('"', '', regex=False)
        self.dx = df['d(x)'].astype(float).values
        
        # Reconstruct lx
        self.lx = np.zeros(len(df), dtype=float)
        self.lx[0] = float(lx_str[0])
        for i in range(1, len(self.lx)):
            self.lx[i] = self.lx[i-1] - self.dx[i-1]
            
        # Calculate monthly qx
        # where self.lx is 0, qx is 0
        self.monthly_rates = np.divide(self.dx, self.lx, out=np.zeros_like(self.dx), where=self.lx!=0)
        self.max_monthly_age = len(self.monthly_rates) - 1
        
        # Calculate annual qx from monthly lx
        years = self.max_monthly_age // 12
        self.annual_rates = np.zeros(years + 1, dtype=float)
        for y in range(years + 1):
            m_start = y * 12
            m_end = min((y + 1) * 12, self.max_monthly_age)
            if self.lx[m_start] > 0:
                self.annual_rates[y] = (self.lx[m_start] - self.lx[m_end]) / self.lx[m_start]
        self.max_annual_age = years

    def get_monthly_probability(self, age_in_months: int) -> float:
        if 0 <= age_in_months <= self.max_monthly_age:
            return self.monthly_rates[age_in_months]
        return 0.0

    def get_annual_probability(self, age_in_years: int) -> float:
        if 0 <= age_in_years <= self.max_annual_age:
            return self.annual_rates[age_in_years]
        return 0.0


class ActuarialValuationEngine:
    def __init__(self, params: ValuationParameters, mortality_svc: MortalityService):
        self.cfg = params
        self.mortality = mortality_svc

    def _apply_statutory_floors(self, policy_type: str, calculated_reserve: float, capital_03_pct: float, capital_qx: float) -> float:
        p_type = policy_type.lower()
        valid_values = lambda *args: [float(x) for x in args if pd.notna(x)]
        get_max = lambda *args: max(valid_values(*args)) if valid_values(*args) else np.nan

        if pd.notna(calculated_reserve) and calculated_reserve > 0:
            return get_max(calculated_reserve, capital_03_pct)
        if p_type in ["kredit", "credit"]:
            return get_max(calculated_reserve, capital_03_pct)
        if pd.notna(calculated_reserve) and calculated_reserve <= 0:
            return get_max(capital_03_pct, capital_qx)
        return calculated_reserve

    def _generate_cashflow_projection(self, policy: PolicyRecord, projection_date: pd.Timestamp, forward_shift: int = 0) -> Tuple[Dict[str, float], int]:
        monthly_apr = (policy.credit_apr / 100 if policy.credit_apr > 1 else policy.credit_apr) / 12
        total_duration = relativedelta(policy.maturity_date, policy.inception_date)
        total_months = total_duration.years * 12 + total_duration.months + (1 if total_duration.days > 0 else 0)
        
        elapsed_m = min(TimeMetrics.elapsed_months(policy.inception_date, self.cfg.valuation_date) + forward_shift, total_months)
        entry_age_months = TimeMetrics.elapsed_months(policy.dob, policy.inception_date)
        
        time_horizon = np.arange(total_months + 1, dtype=int)
        past_period_mask = time_horizon < elapsed_m
        
        fixed_installment = FinancialPrimitives.calculate_annuity_installment(policy.sum_insured_initial, monthly_apr, total_months)
        remaining_term = total_months - time_horizon
        
        outstanding_balance = np.zeros_like(time_horizon, dtype=float)
        active_mask = remaining_term > 0
        if np.any(active_mask):
            if policy.policy_type.lower() == "life_endowment":
                outstanding_balance[active_mask] = policy.sum_insured_initial
            else:
                outstanding_balance[active_mask] = np.abs(
                    FinancialPrimitives.project_outstanding_balance(fixed_installment, monthly_apr, remaining_term[active_mask])
                )
            
        projected_ages = entry_age_months + time_horizon - 1
        raw_mortality = np.zeros_like(time_horizon, dtype=float)
        
        valid_ages = (projected_ages >= 0) & (projected_ages <= self.mortality.max_monthly_age)
        raw_mortality[valid_ages] = self.mortality.monthly_rates[projected_ages[valid_ages]]
        
        adjusted_mortality = np.where(np.concatenate(([True], past_period_mask[:-1])) if len(past_period_mask) > 0 else past_period_mask, 0.0, raw_mortality)
        survival_rate = 1.0 - adjusted_mortality
        
        cumulative_survival = np.cumprod(survival_rate)
        cumulative_survival[past_period_mask] = 0.0
        if len(cumulative_survival) > 0:
            cumulative_survival[0] = 1.0
            cumulative_survival[-1] = 0.0

        monthly_interest = self.cfg.interest_rate_annual / 12
        continuous_discount = monthly_interest / np.log(1 + monthly_interest) if monthly_interest > 0 else 1.0
        
        discount_factor = np.where(past_period_mask, 1.0, 1.0 / (1.0 + monthly_interest))
        shifted_discount = np.empty_like(discount_factor, dtype=float)
        if len(shifted_discount) > 0:
            shifted_discount[0] = 1.0
        if len(shifted_discount) > 1:
            shifted_discount[1:] = discount_factor[:-1]
            
        present_value_vector = np.cumprod(shifted_discount)
        present_value_vector[past_period_mask] = 0.0

        mortality_next = np.concatenate((adjusted_mortality[1:], [0.0])) if len(adjusted_mortality) > 0 else adjusted_mortality
        pv_next = np.concatenate((present_value_vector[1:], [0.0])) if len(present_value_vector) > 0 else present_value_vector
        
        benefits_payable = (mortality_next * pv_next) * (cumulative_survival * continuous_discount * outstanding_balance)
        expenses_mortality = self.cfg.margin_mortality * benefits_payable
        
        maintenance_mask = np.concatenate(([True], past_period_mask[:-1])) if len(past_period_mask) > 0 else past_period_mask
        if len(maintenance_mask) > 0 and (elapsed_m == 0 or policy.inception_date <= self.cfg.valuation_date - relativedelta(months=1)):
            maintenance_mask[0] = False
            
        expenses_maintenance = np.where(maintenance_mask, 0.0, (self.cfg.expense_maintenance / 12.0) * cumulative_survival * present_value_vector * outstanding_balance)
        
        future_premiums = np.full_like(outstanding_balance, policy.net_premium, dtype=float)
        if len(future_premiums): future_premiums[-1] = 0.0
            
        pure_endowment = survival_rate[-1] * cumulative_survival[-2] * present_value_vector[-1] if len(survival_rate) >= 2 else 0.0
        
        if policy.policy_type.lower() in ["kredit", "credit"]:
            present_value_premiums = np.zeros_like(outstanding_balance, dtype=float)
        else:
            remaining_after_valuation = total_months - elapsed_m
            premium_mask = np.concatenate(([False], past_period_mask[:-1])) if len(past_period_mask) > 0 else past_period_mask
            
            amortization_adj = np.divide(
                (self.cfg.payment_frequency - 1) * (1 - pure_endowment),
                (2 * self.cfg.payment_frequency * remaining_after_valuation),
                out=np.array([np.inf], dtype=float),
                where=np.array([remaining_after_valuation != 0])
            )[0] if remaining_after_valuation != 0 else 0.0
            
            present_value_premiums = np.where(
                premium_mask, 0.0, 
                (1 - self.cfg.cost_acquisition) * future_premiums * ((present_value_vector * cumulative_survival) - amortization_adj)
            )

        balance_index = min(max(elapsed_m, 0), len(outstanding_balance) - 1) if len(outstanding_balance) > 0 else 0
        # SÖ (Sığorta ödənişləri)
        res_so = benefits_payable.sum()
        if policy.policy_type.lower() == "life_endowment":
            res_so += policy.sum_insured_initial * pure_endowment * (1.0 + self.cfg.margin_investment)
        # ZTX (Zərərlərin tənzimləmə xərcləri)
        res_ztx = expenses_mortality.sum()
        # İAX (İnzibati və Administrativ xərclər)
        res_iax = expenses_maintenance.sum()
        # SH (Sığorta haqları)
        res_sh = present_value_premiums.sum()
        
        components = {
            'liability_benefits': res_so,
            'liability_risk_margin': res_ztx,
            'liability_expenses': res_iax,
            'asset_premiums': res_sh,
            'net_mathematical_reserve': res_so + res_ztx + res_iax - res_sh,
            'active_sum_insured': outstanding_balance[balance_index] if len(outstanding_balance) > 0 else 0.0
        }
        return components, elapsed_m

    def execute_valuation(self, policy: PolicyRecord) -> Dict[str, Any]:
        anchor_date_prev = TimeMetrics.align_to_payment_cycle(self.cfg.valuation_date, policy.inception_date)
        anchor_date_next = anchor_date_prev + relativedelta(months=1)
        
        proj_prev, _ = self._generate_cashflow_projection(policy, anchor_date_prev, forward_shift=0)
        proj_next, _ = self._generate_cashflow_projection(policy, anchor_date_next, forward_shift=1)
        
        days_passed = (self.cfg.valuation_date - anchor_date_prev).days
        total_days_in_cycle = (anchor_date_next - anchor_date_prev).days
        time_fraction = (days_passed / total_days_in_cycle) if total_days_in_cycle != 0 else 0.0
        
        interpolated_metrics = {
            key: (1 - time_fraction) * proj_prev[key] + time_fraction * proj_next[key]
            for key in proj_prev.keys()
        }
        
        current_sum_insured = interpolated_metrics['active_sum_insured']
        capital_floor_03 = current_sum_insured * 0.003
        
        age_entry_months = TimeMetrics.elapsed_months(policy.dob, policy.inception_date)
        age_current_years = TimeMetrics.completed_years(policy.dob, self.cfg.valuation_date)
        
        prob_monthly = self.mortality.get_monthly_probability(age_entry_months)
        prob_annual = self.mortality.get_annual_probability(age_current_years)
        
        capital_floor_qx = current_sum_insured * prob_annual
        
        final_reserve = self._apply_statutory_floors(
            policy.policy_type, 
            interpolated_metrics['net_mathematical_reserve'], 
            capital_floor_03, 
            capital_floor_qx
        )
        
        # Round the numerical metrics for display
        def _fmt(val):
            return float(round(val, 2)) if pd.notna(val) else 0.0

        return {
            'policy_id': policy.policy_id,
            'liability_benefits': _fmt(interpolated_metrics['liability_benefits']),
            'liability_risk_margin': _fmt(interpolated_metrics['liability_risk_margin']),
            'liability_expenses': _fmt(interpolated_metrics['liability_expenses']),
            'asset_premiums': _fmt(interpolated_metrics['asset_premiums']),
            'net_mathematical_reserve': _fmt(interpolated_metrics['net_mathematical_reserve']),
            'active_sum_insured': _fmt(current_sum_insured),
            'capital_floor_03': _fmt(capital_floor_03),
            'capital_floor_qx': _fmt(capital_floor_qx),
            'final_reserve': _fmt(final_reserve),
            'age_months': age_entry_months,
            'age_years': age_current_years,
            'qx_monthly': float(round(prob_monthly, 6)),
            'qx_annual': float(round(prob_annual, 6))
        }

# Global singleton for mortality service
_mortality_service = None

def get_mortality_service():
    global _mortality_service
    if _mortality_service is None:
        csv_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'Monthlydeathtable.csv')
        _mortality_service = MortalityService(csv_path)
    return _mortality_service

def evaluate_single_policy(params_data: dict, policy_data: dict) -> dict:
    """Entry point for Django view."""
    cfg = ValuationParameters(
        valuation_date=pd.to_datetime(params_data.get('valuation_date', "2026-01-01")),
        interest_rate_annual=float(params_data.get('interest_rate_annual', 0.05)),
        expense_maintenance=float(params_data.get('expense_maintenance', 0.0025)),
        margin_mortality=float(params_data.get('margin_mortality', 0.03)),
        cost_acquisition=float(params_data.get('cost_acquisition', 0.01)),
        payment_frequency=int(params_data.get('payment_frequency', 12)),
        default_policy_type=str(params_data.get('default_policy_type', 'Ipoteka'))
    )
    
    policy = PolicyRecord(
        policy_id=str(policy_data.get('policy_id', 'POL-1')),
        dob=pd.to_datetime(policy_data.get('dob')),
        inception_date=pd.to_datetime(policy_data.get('inception_date')),
        maturity_date=pd.to_datetime(policy_data.get('maturity_date')),
        sum_insured_initial=float(policy_data.get('sum_insured_initial')),
        net_premium=float(policy_data.get('net_premium')),
        credit_apr=float(policy_data.get('credit_apr')),
        policy_type=str(policy_data.get('policy_type'))
    )
    
    engine = ActuarialValuationEngine(cfg, get_mortality_service())
    return engine.execute_valuation(policy)

