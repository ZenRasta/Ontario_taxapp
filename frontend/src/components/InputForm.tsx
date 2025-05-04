// frontend/src/components/InputForm.tsx
import React, { useState, ChangeEvent, FormEvent } from 'react';
import {
    Box, Grid, TextField, Button, Tooltip, Typography, Checkbox, Select, MenuItem, InputLabel, FormControl,
    FormControlLabel, InputAdornment, IconButton, FormHelperText, Divider
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ScenarioInput, SpouseInfo, NonRegisteredAccount } from '../types/api';

// --- State Interfaces ---
interface SpouseInfoState {
    age: string;
    rrsp_balance: string; // Added back
    employment_income: string;
    pension_income: string;
    cpp_oas_income: string;
    investment_income: string;
}

interface NonRegState {
    balance: string;
    unrealized_capital_gains: string;
}

interface FormDataState {
    // Section 1
    age: string;
    retirement_status: string;
    retirement_age: string;
    rrsp_balance: string; // Added back
    // Section 2
    employment_income: string;
    pension_type: string;
    pension_income: string;
    cpp_start_age: string;
    cpp_amount: string;
    oas_start_age: string;
    oas_amount: string;
    other_investment_income: string;
    // Section 3
    has_spouse: boolean;
    spouse_details: SpouseInfoState | null;
    beneficiary_intent: string;
    // Section 4
    desired_spending: string;
    tax_target: string;
    // Section 5
    tfsa_balance: string;
    non_registered_details: NonRegState | null;
    // Section 6
    health_considerations: string;
    planning_horizon_years: string;
    expect_return_pct: string;
    inflation_rate_pct: string;
    target_rrif_depletion_age: string;
    // Section 7
    province: string;
    future_residence_intent: string;
    // Other
    start_year: string;
}

// --- Validation errors type ---
type FormErrors = {
    [key in keyof FormDataState]?: string;
} & {
    [key in `spouse_details.${keyof SpouseInfoState}`]?: string;
} & {
     [key in `non_registered_details.${keyof NonRegState}`]?: string;
};


// --- Component Props ---
interface InputFormProps {
    onSubmit: (data: ScenarioInput) => void;
    isLoading?: boolean;
}

// --- The Form Component ---
const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading = false }) => {

    // Added back rrsp_balance to initial spouse state
    const initialSpouseState: SpouseInfoState = { age: '', rrsp_balance: '', employment_income: '0', pension_income: '0', cpp_oas_income: '0', investment_income: '0' };
    const initialNonRegState: NonRegState = { balance: '0', unrealized_capital_gains: '0' };
    const currentYear = new Date().getFullYear();

    const initialFormData: FormDataState = {
        // Section 1
        age: '', retirement_status: 'Retired', retirement_age: '', rrsp_balance: '', // Added back
        // Section 2
        employment_income: '0', pension_type: 'None', pension_income: '0',
        cpp_start_age: '65', cpp_amount: '0', oas_start_age: '65', oas_amount: '0',
        other_investment_income: '0',
        // Section 3
        has_spouse: false, spouse_details: null, beneficiary_intent: 'Spouse/Partner', // Changed default
        // Section 4
        desired_spending: '', tax_target: 'Avoid OAS Clawback',
        // Section 5
        tfsa_balance: '0', non_registered_details: null,
        // Section 6
        health_considerations: 'Average', planning_horizon_years: '', expect_return_pct: '',
        inflation_rate_pct: '2.0', target_rrif_depletion_age: '',
        // Section 7
        province: 'ON', future_residence_intent: 'Remain in Province',
        // Other
        start_year: (currentYear + 1).toString(),
    };

    const [formData, setFormData] = useState<FormDataState>(initialFormData);
    const [showSpouseFields, setShowSpouseFields] = useState<boolean>(false);
    const [showNonRegFields, setShowNonRegFields] = useState<boolean>(false);
    const [errors, setErrors] = useState<FormErrors>({});

    // --- Handlers ---
    const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = event.target;
        if (name === 'has_spouse') {
            const newSpouseDetails = checked ? { ...initialSpouseState } : null;
            setShowSpouseFields(checked);
            setFormData((prev) => ({ ...prev, has_spouse: checked, spouse_details: newSpouseDetails }));
            if (!checked) { /* Clear spouse errors */ setErrors(prev => { const e = {...prev}; delete e['spouse_details.age']; delete e['spouse_details.rrsp_balance']; delete e['spouse_details.employment_income']; delete e['spouse_details.pension_income']; delete e['spouse_details.cpp_oas_income']; delete e['spouse_details.investment_income']; return e; }); }
        } else if (name === 'has_non_registered') {
             const newNonRegDetails = checked ? { ...initialNonRegState } : null;
             setShowNonRegFields(checked);
             setFormData((prev) => ({ ...prev, non_registered_details: newNonRegDetails }));
             if (!checked) { /* Clear non-reg errors */ setErrors(prev => { const e = {...prev}; delete e['non_registered_details.balance']; delete e['non_registered_details.unrealized_capital_gains']; return e; }); }
        }
    };

    // handleChange remains the same as previous version
    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | { name?: string; value: unknown }>) => {
        const name = event.target.name;
        const value = event.target.value;
        if (!name) return;
        const errorKey = name as keyof FormErrors;
        setErrors(prev => ({ ...prev, [errorKey]: undefined }));
        if (name.startsWith('spouse_details.')) {
            const field = name.split('.')[1] as keyof SpouseInfoState;
            setFormData((prev) => ({ ...prev, spouse_details: prev.spouse_details ? { ...prev.spouse_details, [field]: value as string } : null }));
        } else if (name.startsWith('non_registered_details.')) {
             const field = name.split('.')[1] as keyof NonRegState;
             setFormData((prev) => ({ ...prev, non_registered_details: prev.non_registered_details ? { ...prev.non_registered_details, [field]: value as string } : null }));
        } else {
            setFormData((prev) => ({ ...prev, [name]: value as string }));
        }
    };


     // --- Validation (ensure rrsp_balance is validated) ---
    const validateForm = (): boolean => {
         const newErrors: FormErrors = {}; let isValid = true; const currentYear = new Date().getFullYear();
         // Helper: Validate numeric field (implementation remains the same)
         const validateNumeric = (fieldKey: keyof FormErrors, valueStr: string | undefined | null, label: string, isRequired: boolean, min?: number, max?: number, allowEmptyForOptional: boolean = false) => { /* ... (implementation as before) ... */ if (isRequired && (!valueStr || valueStr.trim() === '')) { newErrors[fieldKey] = `${label} is required.`; isValid = false; return; } if (valueStr && valueStr.trim() !== '') { const valueNum = parseFloat(valueStr); if (isNaN(valueNum)) { newErrors[fieldKey] = `${label} must be a valid number.`; isValid = false; } else { if (min !== undefined && valueNum < min) { newErrors[fieldKey] = `${label} must be ${min} or greater.`; isValid = false; } if (max !== undefined && valueNum > max) { newErrors[fieldKey] = `${label} must be ${max} or less.`; isValid = false; } } } else if (!isRequired && !allowEmptyForOptional && valueStr !== undefined && valueStr !== null && valueStr !== '') { newErrors[fieldKey] = `${label} must be valid if provided.`; isValid = false; } };
         // Helper: Validate required string (implementation remains the same)
         const validateRequiredString = (fieldKey: keyof FormErrors, valueStr: string | undefined | null, label: string) => { if (!valueStr || valueStr.trim() === '') { newErrors[fieldKey] = `${label} is required.`; isValid = false; } };

        // --- Validate All Fields ---
        // Section 1
        validateNumeric('age', formData.age, 'Your Age', true, 55, 110);
        validateRequiredString('retirement_status', formData.retirement_status, 'Retirement Status');
        validateNumeric('retirement_age', formData.retirement_age, 'Retirement Age', false, 55, 110, true);
        validateNumeric('rrsp_balance', formData.rrsp_balance, 'Your RRSP/RRIF Balance', true, 0); // Added Validation
        // Section 2
        validateNumeric('employment_income', formData.employment_income, 'Employment Income', true, 0);
        validateNumeric('pension_income', formData.pension_income, 'Pension Income', true, 0);
        validateNumeric('cpp_start_age', formData.cpp_start_age, 'CPP Start Age', true, 60, 70);
        validateNumeric('cpp_amount', formData.cpp_amount, 'CPP Amount', true, 0);
        validateNumeric('oas_start_age', formData.oas_start_age, 'OAS Start Age', true, 65, 70);
        validateNumeric('oas_amount', formData.oas_amount, 'OAS Amount', true, 0);
        validateNumeric('other_investment_income', formData.other_investment_income, 'Other Investment Income', true, 0);
        // Section 3
        if (formData.has_spouse && formData.spouse_details) {
            validateNumeric('spouse_details.age', formData.spouse_details.age, 'Spouse Age', true, 0, 120);
            validateNumeric('spouse_details.rrsp_balance', formData.spouse_details.rrsp_balance, 'Spouse RRSP', true, 0); // Added Validation
            validateNumeric('spouse_details.employment_income', formData.spouse_details.employment_income, 'Spouse Employment Income', true, 0);
            validateNumeric('spouse_details.pension_income', formData.spouse_details.pension_income, 'Spouse Pension Income', true, 0);
            validateNumeric('spouse_details.cpp_oas_income', formData.spouse_details.cpp_oas_income, 'Spouse CPP/OAS', true, 0);
            validateNumeric('spouse_details.investment_income', formData.spouse_details.investment_income, 'Spouse Investment Income', true, 0);
        }
        // Section 4
        validateNumeric('desired_spending', formData.desired_spending, 'Desired Spending', true, 0);
        // Section 5
        validateNumeric('tfsa_balance', formData.tfsa_balance, 'TFSA Balance', true, 0);
        if (showNonRegFields && formData.non_registered_details) {
             validateNumeric('non_registered_details.balance', formData.non_registered_details.balance, 'Non-Reg Balance', true, 0);
             validateNumeric('non_registered_details.unrealized_capital_gains', formData.non_registered_details.unrealized_capital_gains, 'Unrealized Gains', true, 0);
        }
        // Section 6
        validateNumeric('planning_horizon_years', formData.planning_horizon_years, 'Planning Horizon', true, 1, 50);
        validateNumeric('expect_return_pct', formData.expect_return_pct, 'Expected Return', true, -10, 25);
        validateNumeric('inflation_rate_pct', formData.inflation_rate_pct, 'Inflation Rate', true, 0, 10);
        validateNumeric('target_rrif_depletion_age', formData.target_rrif_depletion_age, 'Target Depletion Age', false, 56, 110, true);
        if (formData.target_rrif_depletion_age && formData.age && !isNaN(parseFloat(formData.target_rrif_depletion_age)) && !isNaN(parseFloat(formData.age))) {
            if (parseFloat(formData.target_rrif_depletion_age) <= parseFloat(formData.age)) { newErrors.target_rrif_depletion_age = '> Current Age'; isValid = false; } }
        // Section 7
        if (!formData.province || !/^[A-Z]{2}$/.test(formData.province.trim())) { newErrors.province = '2 letters'; isValid = false; }
        // Other
        validateNumeric('start_year', formData.start_year, 'Start Year', false, currentYear, 2050, true);

        setErrors(newErrors); return isValid;
    };


    // --- Submission (ensure rrsp_balance is handled) ---
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (validateForm()) {
            // Add 'rrsp_balance' to numeric fields if it wasn't already there
            const numericFields: Array<keyof ScenarioInput | 'target_rrif_depletion_age' | 'retirement_age' | 'start_year'> = [ // Type more broadly for check
                'age', 'rrsp_balance', 'pension_income', 'cpp_start_age', 'cpp_amount', // Added rrsp_balance
                'oas_start_age', 'oas_amount', 'tfsa_balance', 'other_investment_income',
                'desired_spending', 'expect_return_pct', 'planning_horizon_years',
                'inflation_rate_pct', 'employment_income',
                // Keep optional ones here too for the check
                'retirement_age', 'target_rrif_depletion_age', 'start_year'
            ];
             const optionalNumeric = ['retirement_age', 'target_rrif_depletion_age', 'start_year'];
             const spouseNumericFields: Array<keyof SpouseInfo> = [ 'age', 'rrsp_balance', 'employment_income', 'pension_income', 'cpp_oas_income', 'investment_income']; // Added rrsp_balance
             const nonRegNumericFields: Array<keyof NonRegisteredAccount> = ['balance', 'unrealized_capital_gains'];

            const scenarioData: Partial<ScenarioInput> = {};

            (Object.keys(formData) as Array<keyof FormDataState>).forEach(key => {
                 const value = formData[key];
                 if (key === 'has_spouse') { scenarioData[key] = value as boolean; return; }
                 if (key === 'spouse_details' || key === 'non_registered_details') { return; } // Handle below

                 const valueStr = value as string;

                 if (numericFields.includes(key as any)) { // Check if it's numeric or optional numeric
                      if (valueStr !== null && valueStr !== undefined && valueStr.trim() !== '') {
                          const numVal = parseFloat(valueStr);
                          scenarioData[key as keyof ScenarioInput] = isNaN(numVal) ? null : numVal;
                      } else {
                          scenarioData[key as keyof ScenarioInput] = optionalNumeric.includes(key as any) ? null : 0; // Set optional empty numerics to null, required to 0 (validation should prevent empty required)
                      }
                 } else {
                      scenarioData[key as keyof ScenarioInput] = valueStr; // Assign string
                 }
             });

            // Process spouse details
             if (formData.has_spouse && formData.spouse_details) {
                 scenarioData.spouse_details = {} as SpouseInfo;
                 spouseNumericFields.forEach(spKey => {
                     const valueStr = formData.spouse_details![spKey];
                     const numVal = parseFloat(valueStr);
                     scenarioData.spouse_details![spKey] = isNaN(numVal) ? 0 : numVal;
                 });
             } else { scenarioData.spouse_details = null; scenarioData.has_spouse = false; }

             // Process non-registered details
             if (showNonRegFields && formData.non_registered_details) { // Check showNonRegFields state
                  scenarioData.non_registered_details = {} as NonRegisteredAccount;
                  nonRegNumericFields.forEach(nrKey => {
                      const valueStr = formData.non_registered_details![nrKey];
                      const numVal = parseFloat(valueStr);
                      scenarioData.non_registered_details![nrKey] = isNaN(numVal) ? 0 : numVal;
                  });
             } else { scenarioData.non_registered_details = null; }


            console.log("Submitting validated data:", scenarioData);
            onSubmit(scenarioData as ScenarioInput); // Final assertion
        } else {
            console.log("Form validation failed", errors);
        }
    };

    // --- Tooltip Helper (remains the same) ---
    const renderTooltip = (title: string) => ( <Tooltip title={title} placement="right"><IconButton size="small" sx={{ ml: 0.5 }} aria-label={title}><InfoOutlinedIcon fontSize="inherit" /></IconButton></Tooltip> );

    // --- Render ---
    return (
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>

            {/* Section 1: Age & Retirement */}
            <Typography variant="h6" gutterBottom>1. Age, Retirement & RRSP</Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
                 <Grid item xs={12} sm={6} md={4}><TextField required fullWidth name="age" label="Your Current Age" type="number" value={formData.age} onChange={handleChange} error={!!errors.age} helperText={errors.age} InputProps={{ endAdornment: renderTooltip("Enter your current age (must be 55 or older).") }} /></Grid>
                 {/* ADDED Your RRSP Balance Field */}
                 <Grid item xs={12} sm={6} md={4}>
                    <TextField required fullWidth name="rrsp_balance" label="Your RRSP/RRIF Balance" type="number" value={formData.rrsp_balance} onChange={handleChange} error={!!errors.rrsp_balance} helperText={errors.rrsp_balance} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: renderTooltip("Total current market value of all your RRSPs and RRIFs.") }} />
                 </Grid>
                 {/* END ADDITION */}
                <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth required error={!!errors.retirement_status}>
                        <InputLabel id="retirement-status-label">Retirement Status</InputLabel>
                        <Select labelId="retirement-status-label" name="retirement_status" value={formData.retirement_status} label="Retirement Status" onChange={handleChange} > <MenuItem value="Retired">Retired</MenuItem> <MenuItem value="Semi-Retired">Semi-Retired</MenuItem> <MenuItem value="Working">Working</MenuItem> </Select>
                        {errors.retirement_status && <FormHelperText>{errors.retirement_status}</FormHelperText>}
                    </FormControl>
                </Grid>
                 <Grid item xs={12} sm={6}><TextField fullWidth name="retirement_age" label="Retirement Age (if applicable)" type="number" value={formData.retirement_age} onChange={handleChange} error={!!errors.retirement_age} helperText={errors.retirement_age || "Enter age you retired or plan to."} InputProps={{ endAdornment: renderTooltip("Age you stopped/plan to stop primary work.") }} /></Grid>
            </Grid>
            <Divider sx={{ my: 2 }} />

             {/* Section 2: Other Income (Pre-Tax) */}
             <Typography variant="h6" gutterBottom>2. Your Other Annual Income (Pre-Tax)</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                {/* Fields remain the same here */}
                <Grid item xs={12} sm={6}><TextField required fullWidth name="employment_income" label="Employment/Consulting Income" type="number" value={formData.employment_income} onChange={handleChange} error={!!errors.employment_income} helperText={errors.employment_income} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: renderTooltip("Current annual income from work, if any. Enter 0 if none.") }} /></Grid>
                 <Grid item xs={12} sm={6}><FormControl fullWidth> <InputLabel id="pension-type-label">Workplace Pension Type</InputLabel> <Select labelId="pension-type-label" name="pension_type" value={formData.pension_type} label="Workplace Pension Type" onChange={handleChange}> <MenuItem value="None">None</MenuItem> <MenuItem value="DB">Defined Benefit (DB)</MenuItem> <MenuItem value="DC">Defined Contribution (DC)</MenuItem> <MenuItem value="Other">Other/Unsure</MenuItem> </Select> </FormControl> </Grid>
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="pension_income" label="Annual Workplace Pension" type="number" value={formData.pension_income} onChange={handleChange} error={!!errors.pension_income} helperText={errors.pension_income} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: renderTooltip("Expected annual pension income (DB or estimated DC drawdown). Enter 0 if none.") }} /></Grid>
                 <Grid item xs={6} sm={3}><TextField required fullWidth name="cpp_start_age" label="CPP Start Age" type="number" value={formData.cpp_start_age} onChange={handleChange} error={!!errors.cpp_start_age} helperText={errors.cpp_start_age} /></Grid>
                 <Grid item xs={6} sm={3}><TextField required fullWidth name="cpp_amount" label="Annual CPP Amt" type="number" value={formData.cpp_amount} onChange={handleChange} error={!!errors.cpp_amount} helperText={errors.cpp_amount} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                 <Grid item xs={6} sm={3}><TextField required fullWidth name="oas_start_age" label="OAS Start Age" type="number" value={formData.oas_start_age} onChange={handleChange} error={!!errors.oas_start_age} helperText={errors.oas_start_age} /></Grid>
                 <Grid item xs={6} sm={3}><TextField required fullWidth name="oas_amount" label="Annual OAS Amt" type="number" value={formData.oas_amount} onChange={handleChange} error={!!errors.oas_amount} helperText={errors.oas_amount} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="other_investment_income" label="Other Investment Income" type="number" value={formData.other_investment_income} onChange={handleChange} error={!!errors.other_investment_income} helperText={errors.other_investment_income} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: renderTooltip("E.g., Rent, taxable dividends, interest. Exclude RRSP/RRIF/TFSA income & cap gains.") }} /></Grid>
            </Grid>
             <Divider sx={{ my: 2 }} />

            {/* Section 3: Family/Beneficiary */}
             <Typography variant="h6" gutterBottom>3. Family & Beneficiary</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12}><FormControlLabel control={ <Checkbox checked={formData.has_spouse} onChange={handleCheckboxChange} name="has_spouse" /> } label="Do you have a spouse / common-law partner?"/></Grid>
                {formData.has_spouse && formData.spouse_details && (
                     <>
                        <Grid item xs={12} sm={6} md={4}><TextField required fullWidth name="spouse_details.age" label="Spouse's Age" type="number" value={formData.spouse_details.age} onChange={handleChange} error={!!errors['spouse_details.age']} helperText={errors['spouse_details.age']} /></Grid>
                        {/* ADDED Spouse RRSP Balance Field */}
                         <Grid item xs={12} sm={6} md={4}>
                             <TextField required fullWidth name="spouse_details.rrsp_balance" label="Spouse's RRSP/RRIF" type="number" value={formData.spouse_details.rrsp_balance} onChange={handleChange} error={!!errors['spouse_details.rrsp_balance']} helperText={errors['spouse_details.rrsp_balance']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                         </Grid>
                         {/* END ADDITION */}
                        <Grid item xs={12} sm={6} md={4}><TextField required fullWidth name="spouse_details.employment_income" label="Spouse Employment Inc" type="number" value={formData.spouse_details.employment_income} onChange={handleChange} error={!!errors['spouse_details.employment_income']} helperText={errors['spouse_details.employment_income']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><TextField required fullWidth name="spouse_details.pension_income" label="Spouse Pension Inc" type="number" value={formData.spouse_details.pension_income} onChange={handleChange} error={!!errors['spouse_details.pension_income']} helperText={errors['spouse_details.pension_income']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><TextField required fullWidth name="spouse_details.cpp_oas_income" label="Spouse CPP/OAS Inc" type="number" value={formData.spouse_details.cpp_oas_income} onChange={handleChange} error={!!errors['spouse_details.cpp_oas_income']} helperText={errors['spouse_details.cpp_oas_income']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><TextField required fullWidth name="spouse_details.investment_income" label="Spouse Invest Inc" type="number" value={formData.spouse_details.investment_income} onChange={handleChange} error={!!errors['spouse_details.investment_income']} helperText={errors['spouse_details.investment_income']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                     </>
                )}
                 <Grid item xs={12}>
                     <FormControl fullWidth> <InputLabel id="beneficiary-label">Primary RRSP/RRIF Beneficiary Intent</InputLabel> <Select labelId="beneficiary-label" name="beneficiary_intent" value={formData.beneficiary_intent} label="Primary RRSP/RRIF Beneficiary Intent" onChange={handleChange} > <MenuItem value="Spouse/Partner">Spouse / Partner</MenuItem> <MenuItem value="Children">Children</MenuItem> <MenuItem value="Charity">Charity</MenuItem> <MenuItem value="Estate">Estate</MenuItem> </Select> </FormControl>
                 </Grid>
            </Grid>
             <Divider sx={{ my: 2 }} />

             {/* Section 4: Spending & Tax Target */}
            <Typography variant="h6" gutterBottom>4. Spending & Tax Target</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                {/* Fields remain the same */}
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="desired_spending" label="Desired Annual Spending (After Tax)" type="number" value={formData.desired_spending} onChange={handleChange} error={!!errors.desired_spending} helperText={errors.desired_spending} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                 <Grid item xs={12} sm={6}><FormControl fullWidth> <InputLabel id="tax-target-label">Annual Tax Target</InputLabel> <Select labelId="tax-target-label" name="tax_target" value={formData.tax_target} label="Annual Tax Target" onChange={handleChange} > <MenuItem value="Avoid OAS Clawback">Avoid OAS Clawback</MenuItem> <MenuItem value="Stay Below 2nd Bracket">Stay Below 2nd Fed Bracket</MenuItem> <MenuItem value="Stay Below 3rd Bracket">Stay Below 3rd Fed Bracket</MenuItem> <MenuItem value="Minimize Tax Overall">Minimize Tax Overall</MenuItem> </Select> </FormControl> </Grid>
             </Grid>
             <Divider sx={{ my: 2 }} />

            {/* Section 5: Other Accounts */}
             <Typography variant="h6" gutterBottom>5. Other Investment Accounts</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                {/* Fields remain the same */}
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="tfsa_balance" label="Current TFSA Balance" type="number" value={formData.tfsa_balance} onChange={handleChange} error={!!errors.tfsa_balance} helperText={errors.tfsa_balance} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                 <Grid item xs={12}><FormControlLabel control={ <Checkbox checked={showNonRegFields} onChange={handleCheckboxChange} name="has_non_registered" /> } label="Do you have non-registered investment accounts?"/></Grid>
                 {showNonRegFields && formData.non_registered_details && (
                     <>
                        <Grid item xs={12} sm={6}><TextField required fullWidth name="non_registered_details.balance" label="Non-Reg Account Balance" type="number" value={formData.non_registered_details.balance} onChange={handleChange} error={!!errors['non_registered_details.balance']} helperText={errors['non_registered_details.balance']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></Grid>
                        <Grid item xs={12} sm={6}><TextField required fullWidth name="non_registered_details.unrealized_capital_gains" label="Unrealized Capital Gains" type="number" value={formData.non_registered_details.unrealized_capital_gains} onChange={handleChange} error={!!errors['non_registered_details.unrealized_capital_gains']} helperText={errors['non_registered_details.unrealized_capital_gains']} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: renderTooltip("Approximate total untaxed capital gains in non-registered accounts.") }} /></Grid>
                     </>
                 )}
             </Grid>
             <Divider sx={{ my: 2 }} />

            {/* Section 6: Health, Longevity, Growth */}
             <Typography variant="h6" gutterBottom>6. Health, Longevity & Growth</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                 {/* Fields remain the same */}
                <Grid item xs={12} sm={6}><FormControl fullWidth> <InputLabel id="health-label">Health/Longevity Outlook</InputLabel> <Select labelId="health-label" name="health_considerations" value={formData.health_considerations} label="Health/Longevity Outlook" onChange={handleChange} > <MenuItem value="Average">Average</MenuItem> <MenuItem value="Above Average">Above Average</MenuItem> <MenuItem value="Below Average">Below Average</MenuItem> </Select> </FormControl> </Grid>
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="planning_horizon_years" label="Planning Horizon (Years)" type="number" value={formData.planning_horizon_years} onChange={handleChange} error={!!errors.planning_horizon_years} helperText={errors.planning_horizon_years} InputProps={{ endAdornment: renderTooltip("How many years the simulation should cover.") }} /></Grid>
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="expect_return_pct" label="Expected Investment Return (%)" type="number" value={formData.expect_return_pct} onChange={handleChange} error={!!errors.expect_return_pct} helperText={errors.expect_return_pct} InputProps={{ endAdornment: (<> <InputAdornment position="end">%</InputAdornment> {renderTooltip("Estimated average annual return (before tax/inflation).")} </>) }} /></Grid>
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="inflation_rate_pct" label="Assumed Inflation Rate (%)" type="number" value={formData.inflation_rate_pct} onChange={handleChange} error={!!errors.inflation_rate_pct} helperText={errors.inflation_rate_pct} InputProps={{ endAdornment: (<> <InputAdornment position="end">%</InputAdornment> {renderTooltip("Assumed average annual inflation rate.")} </>) }} /></Grid>
                 <Grid item xs={12} sm={6}><TextField fullWidth name="target_rrif_depletion_age" label="Target RRIF Depletion Age (Optional)" type="number" value={formData.target_rrif_depletion_age} onChange={handleChange} error={!!errors.target_rrif_depletion_age} helperText={errors.target_rrif_depletion_age || "If set, adds an 'Empty-by-X' strategy."} InputProps={{ endAdornment: renderTooltip("Optional: Age to aim for RRIF=0.") }} /></Grid>
            </Grid>
             <Divider sx={{ my: 2 }} />

             {/* Section 7: Residence */}
             <Typography variant="h6" gutterBottom>7. Residence</Typography>
             <Grid container spacing={2} sx={{ mb: 2 }}>
                 {/* Fields remain the same */}
                 <Grid item xs={12} sm={6}><TextField required fullWidth name="province" label="Current Province" value={formData.province} onChange={handleChange} error={!!errors.province} helperText={errors.province || "2-letter code (e.g., ON)"} /></Grid>
                 <Grid item xs={12} sm={6}><FormControl fullWidth> <InputLabel id="residence-intent-label">Future Residence Intent</InputLabel> <Select labelId="residence-intent-label" name="future_residence_intent" value={formData.future_residence_intent} label="Future Residence Intent" onChange={handleChange} > <MenuItem value="Remain in Province">Remain</MenuItem> <MenuItem value="Move Province">Move Province</MenuItem> <MenuItem value="Move Abroad">Move Abroad</MenuItem> <MenuItem value="Unsure">Unsure</MenuItem> </Select> </FormControl> </Grid>
                 <Grid item xs={12} sm={6}><TextField fullWidth name="start_year" label="Sim Start Year (Optional)" type="number" value={formData.start_year} onChange={handleChange} error={!!errors.start_year} helperText={errors.start_year || "Defaults to next year."} /></Grid>
            </Grid>
             <Divider sx={{ my: 2 }} />

            {/* Submit Button */}
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isLoading} >
                {isLoading ? 'Generating Report...' : 'Generate My Strategy Report'}
            </Button>
        </Box>
    );
};

export default InputForm;