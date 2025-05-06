// frontend/src/components/ResultsDashboard.tsx
// import React from 'react'; // React import often not needed

// --- CORRECTED IMPORTS ---
// Removed YearlyProjection, keep StrategyResult for typing the .find() callback
import { AdviceResponse, StrategyResult } from '../types/api';
// --- END CORRECTION ---

import {
    Box, Typography, Paper, Alert, AlertTitle, Button, Divider,
    TableContainer, Table, TableHead, TableBody, TableRow, TableCell
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';

// --- CORRECTED HTML2PDF IMPORT & HANDLING ---
// Use wildcard import
import * as html2pdf from 'html2pdf.js';
// We will handle potential TS errors during the call itself if the .d.ts file isn't working
// -------------------------------------------

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResultsDashboardProps {
    data: AdviceResponse;
}

// Helper function to format currency (remains the same)
const formatCurrency = (value: number | null | undefined, defaultValue: string = '$0'): string => {
    if (value === null || value === undefined || isNaN(value)) { return defaultValue; }
    return value.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ data }) => {
    // Destructure simulation_results if present
    const { report_markdown, result_id, simulation_results } = data;

    // Find strategy data for table (add explicit type for res)
    const tableStrategyData = simulation_results?.find((res: StrategyResult) => res.strategy_name === "Top-up-to-OAS") || simulation_results?.[0];

    // --- CORRECTED PDF Export Handler ---
    const handleExportPDF = () => {
        const reportElement = document.getElementById('pdf-report-content');
        if (reportElement) {
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `Retirement_Strategy_Report_${timestamp}_${result_id.substring(0, 8)}.pdf`;
            const options = { margin: [0.75, 0.5, 0.75, 0.5], filename: filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['table', 'thead', 'h1', 'h2', 'h3', 'h4'] } };

             try {
                 // --- ADJUSTED CALL ---
                 // Cast to 'any' to bypass TS2349 error during build,
                 // relying on the runtime JS call working as expected.
                 // The simpler direct call usually works.
                 const exporter: any = html2pdf;
                 exporter(reportElement, options).save();
                 // --- END ADJUSTMENT ---

             } catch (pdfError) {
                 console.error("Error generating PDF:", pdfError);
                 // Optionally show a user-facing error alert here
             }
        } else { console.error("Could not find PDF export element."); }
    };
    // ---------------------------------

    // --- Render ---
    return (
        <Paper id="pdf-report-content" elevation={3} sx={{ mt: 4, p: { xs: 2, sm: 3 } }}>
            {/* Header Section */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                 <Typography variant="h5" component="h2" gutterBottom sx={{ mb: { xs: 1, sm: 0 }, flexGrow: 1, textAlign: { xs: 'center', sm: 'left' } }}>
                    Personalized Withdrawal Strategy Report
                </Typography>
                <Button variant="contained" color="secondary" startIcon={<DownloadIcon />} onClick={handleExportPDF} disabled={!report_markdown} size="small" sx={{ mt: { xs: 1, sm: 0 } }} > Export PDF </Button>
            </Box>

            {/* LLM Generated Report */}
            {report_markdown ? (
                <Box className="markdown-content" sx={{ mb: 4, /* ... markdown styling ... */ }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report_markdown}</ReactMarkdown>
                </Box>
            ) : ( <Alert severity="warning" sx={{ mt: 2, mb: 4 }}> <AlertTitle>Report Not Available</AlertTitle> The strategy report could not be generated... </Alert> )}

            {/* Detailed Projection Table */}
            {/* Use optional chaining (?.) generously when accessing nested data */}
            {tableStrategyData?.yearly_data && tableStrategyData.yearly_data.length > 0 ? (
                <>
                    <Divider sx={{ my: 3 }} />
                    <Typography variant="h6" component="h3" gutterBottom align="center" sx={{ mb: 2 }}>
                        {/* This should now work as StrategyResult type includes strategy_name */}
                        Detailed Projection: {tableStrategyData.strategy_name} Strategy
                    </Typography>
                    <TableContainer component={Paper} variant="outlined" sx={{ pageBreakInside: 'avoid' }}>
                        <Table size="small" aria-label={`detailed projection table for ${tableStrategyData.strategy_name}`}>
                            <TableHead sx={{ backgroundColor: '#eeeeee', '& th': { fontWeight: 'bold' } }}>
                                <TableRow>
                                    {/* ... Table Headers ... */}
                                    <TableCell sx={{ p: 1}}>Year</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Age</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Pension ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">CPP ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">OAS (Net) ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">RRIF WD ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Total Inc ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Tax Payable ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Net Cash ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">End RRIF ($)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {tableStrategyData.yearly_data.map((row) => (
                                    <TableRow key={row.year} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '& td': { fontSize: '0.8rem', p: 1 } }} >
                                        <TableCell component="th" scope="row">{row.year}</TableCell>
                                        <TableCell align="right">{row.age}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.pension)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.cpp)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.oas)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.withdrawal)}</TableCell>
                                        {/* Use optional chaining and nullish coalescing for safety */}
                                        <TableCell align="right">{formatCurrency(row.pension + row.cpp + row.oas + row.oas_clawback + row.withdrawal + (row.other_taxable_income ?? 0) + (row.employment_income ?? 0))}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.total_tax)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.net_cash_after_tax)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.end_rrif)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                     <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}> Note: Table shows projected nominal values... </Typography>
                </>
            ) : ( <Typography sx={{ mt: 2, fontStyle: 'italic' }}>Detailed projection data not available for display.</Typography> )}
        </Paper>
    );
};

export default ResultsDashboard;