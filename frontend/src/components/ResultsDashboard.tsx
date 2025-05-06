// frontend/src/components/ResultsDashboard.tsx
import React from 'react';
import { AdviceResponse, StrategyResult, YearlyProjection } from '../types/api';
import {
    Box, Typography, Paper, Alert, AlertTitle, Button, Divider,
    TableContainer, Table, TableHead, TableBody, TableRow, TableCell // Import Table components
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import * as html2pdf from 'html2pdf.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResultsDashboardProps {
    data: AdviceResponse;
}

// Helper function to format currency
const formatCurrency = (value: number | null | undefined, defaultValue: string = '$0'): string => {
    if (value === null || value === undefined || isNaN(value)) {
        return defaultValue;
    }
    // Format with no cents
    return value.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ data }) => {
    const { report_markdown, result_id, simulation_results } = data;

    // --- Find the specific strategy data for the table ---
    // Let's display the "Top-up-to-OAS" strategy data, or the first one if not found
    const tableStrategyData = simulation_results?.find((res: StrategyResult) => res.strategy_name === "Top-up-to-OAS") || simulation_results?.[0];

    // --- PDF Export Handler ---
    const handleExportPDF = () => {
        const reportElement = document.getElementById('pdf-report-content'); // ID for combined content
        if (reportElement) {
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `Retirement_Strategy_Report_${timestamp}_${result_id.substring(0, 8)}.pdf`;
            const options = {
                margin: [0.75, 0.5, 0.75, 0.5], // Margins in inches [top, left, bottom, right] - Reduced side margins
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2, // Increase scale for better resolution
                    useCORS: true,
                    logging: false,
                    // Try to capture full element width even if off-screen slightly
                    // width: reportElement.scrollWidth,
                    // windowWidth: reportElement.scrollWidth
                },
                jsPDF: {
                    unit: 'in',
                    format: 'letter',
                    orientation: 'portrait'
                },
                // Tweak pagebreak settings - 'avoid-all' on specific elements is often better
                pagebreak: { mode: ['css', 'legacy'], avoid: ['table', 'thead', 'h1', 'h2', 'h3', 'h4'] } // Avoid breaks inside tables/headings
            };

            // Use html2pdf to generate the PDF
            html2pdf().set(options).from(reportElement).save();

        } else {
            console.error("Could not find element with ID 'pdf-report-content' to export.");
            // Optionally show an user-facing error here
        }
    };
    // ------------------------

    return (
        // Assign ID to the outer Paper for PDF export of everything
        <Paper id="pdf-report-content" elevation={3} sx={{ mt: 4, p: { xs: 2, sm: 3 } }}>
            {/* Header Section with Title and Export Button */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                <Typography variant="h5" component="h2" gutterBottom sx={{ mb: { xs: 1, sm: 0 } }}> {/* Removed bottom margin */}
                    Personalized Withdrawal Strategy Report
                </Typography>
                <Button
                    variant="contained"
                    color="secondary" // Different color for export
                    startIcon={<DownloadIcon />}
                    onClick={handleExportPDF}
                    disabled={!report_markdown} // Disable if no report content
                    size="small"
                    sx={{ mt: { xs: 1, sm: 0 } }}
                >
                    Export PDF
                </Button>
            </Box>


            {/* --- LLM Generated Report --- */}
            {report_markdown ? (
                <Box
                    className="markdown-content" // For potential CSS targeting
                    sx={{
                        mb: 4, // Margin below the markdown report
                        // --- MUI-based styling for markdown elements ---
                        '& h1': { typography: 'h4', mt: 3, mb: 1.5, borderBottom: '1px solid #ccc', pb: 0.5 },
                        '& h2': { typography: 'h5', mt: 3, mb: 1.5 },
                        '& h3': { typography: 'h6', mt: 2.5, mb: 1 },
                        '& h4': { typography: 'subtitle1', fontWeight: 'bold', mt: 2, mb: 1 },
                        '& p': { typography: 'body1', mb: 1.5, lineHeight: 1.6 },
                        '& ul, & ol': { pl: 3, mb: 1.5 },
                        '& li': { mb: 0.75, typography: 'body1', lineHeight: 1.6 }, // Match p styling
                        '& table': { borderCollapse: 'collapse', width: '100%', mb: 2, mt: 1, fontSize: '0.9rem', pageBreakInside: 'auto' }, // Ensure tables try not to break
                        '& th, & td': { border: '1px solid #ddd', p: '8px 10px', textAlign: 'left', verticalAlign: 'top' }, // Padding and alignment
                        '& th': { backgroundColor: '#eeeeee', fontWeight: 'bold' }, // Lighter header
                        '& tr:nth-of-type(even)': { backgroundColor: '#f9f9f9' }, // Zebra striping
                        '& strong': { fontWeight: 'bold' },
                        '& em': { fontStyle: 'italic' },
                        '& blockquote': { borderLeft: '4px solid #ccc', pl: 2, ml: 0, my: 2, fontStyle: 'italic', color: 'grey.700' },
                        '& pre': { background: '#f5f5f5', p: 1.5, my: 2, overflowX: 'auto', borderRadius: 1, fontSize: '0.85rem' },
                        '& code': { fontFamily: '"Consolas", "Monaco", "Courier New", monospace', background: '#f5f5f5', px: 0.5, borderRadius: '4px', fontSize: '0.85em' } // Code styling
                        // --- End Styling ---
                    }}
                >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report_markdown}</ReactMarkdown>
                </Box>
            ) : (
                <Alert severity="warning" sx={{ mt: 2, mb: 4 }}>
                    <AlertTitle>Report Not Available</AlertTitle>
                    The strategy report could not be generated. This might be due to missing input, an issue fetching tax rules, or a problem with the advice generation service. Please review your inputs or try again later.
                </Alert>
            )}

            {/* --- ADDED: Detailed Projection Table --- */}
            {tableStrategyData && tableStrategyData.yearly_data && tableStrategyData.yearly_data.length > 0 ? (
                <>
                    <Divider sx={{ my: 3 }} />
                    <Typography variant="h6" component="h3" gutterBottom align="center" sx={{ mb: 2 }}>
                        Detailed Projection: {tableStrategyData.strategy_name} Strategy
                    </Typography>
                    <TableContainer component={Paper} variant="outlined" sx={{ pageBreakInside: 'avoid' }}> {/* Attempt to avoid page break */}
                        <Table size="small" aria-label={`detailed projection table for ${tableStrategyData.strategy_name}`}>
                            <TableHead sx={{ backgroundColor: '#eeeeee', '& th': { fontWeight: 'bold' } }}>
                                <TableRow>
                                    <TableCell sx={{ p: 1}}>Year</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Age</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Pension ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">CPP ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">OAS (Net) ($)</TableCell> {/* Clarified Net */}
                                    <TableCell sx={{ p: 1}} align="right">RRIF WD ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Total Inc ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Tax Payable ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">Net Cash ($)</TableCell>
                                    <TableCell sx={{ p: 1}} align="right">End RRIF ($)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {tableStrategyData.yearly_data.map((row) => (
                                    <TableRow key={row.year} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '& td': { fontSize: '0.8rem', p: 1 } }} > {/* Smaller font, padding */}
                                        <TableCell component="th" scope="row">{row.year}</TableCell>
                                        <TableCell align="right">{row.age}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.pension)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.cpp)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.oas)}</TableCell> {/* Use 'oas' which should be net */}
                                        <TableCell align="right">{formatCurrency(row.withdrawal)}</TableCell>
                                        {/* Reconstruct Total Income from components if needed, otherwise use taxable if close enough */}
                                         <TableCell align="right">{formatCurrency(row.pension + row.cpp + row.oas + row.oas_clawback + row.withdrawal + row.other_taxable_income)}</TableCell> {/* Reconstruct approx Gross Total Income */}
                                        <TableCell align="right">{formatCurrency(row.total_tax)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.net_cash_after_tax)}</TableCell>
                                        <TableCell align="right">{formatCurrency(row.end_rrif)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Typography variant="caption" display="block" sx={{ mt: 1, textAlign: 'center' }}>
                        Note: Table shows projected nominal values for the '{tableStrategyData.strategy_name}' strategy. OAS shown is net of clawback. Total Income is approximate sum of listed sources before tax. All values are estimates.
                    </Typography>
                </>
            ) : (
                 <Typography sx={{ mt: 2, fontStyle: 'italic' }}>Detailed projection data not available for display.</Typography>
            )}
            {/* --------------------------------------- */}

        </Paper>
    );
};

export default ResultsDashboard;
