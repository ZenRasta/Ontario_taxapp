// frontend/src/App.tsx
import { useState } from 'react'; // Removed useEffect

// MUI Imports
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import CssBaseline from '@mui/material/CssBaseline';

// Import components
import InputForm from './components/InputForm';
import ResultsDashboard from './components/ResultsDashboard';

// Import REAL API service ONLY
import { generateAdvice } from './services/api';
// REMOVED: import { generateMockAdvice } from './services/mockApi';
import type { AdviceResponse, ScenarioInput } from './types/api';

function App() { // Removed React.FC type as it's often not needed for function components
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<AdviceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // REMOVED: useMockApi state and useEffect related to it

  // Handler for form submission - Simplified
  const handleFormSubmit = async (scenarioData: ScenarioInput) => {
    console.log('Form submitted in App with processed data:', scenarioData);
    // REMOVED: console.log for useMockApi

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      // ALWAYS use the real API now
      const response = await generateAdvice(scenarioData);

      console.log("API response received:", response);
      setResults(response);
    } catch (err: any) {
      console.error("API call failed:", err);
      setError(err.message || "Failed to generate advice due to an unknown error.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <CssBaseline />
      <Container maxWidth="lg">
        <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mt: 4, mb: 2 }}>
          Retirement Withdrawal Planner
        </Typography>

        {/* REMOVED: API Toggle Switch Box */}

        <InputForm onSubmit={handleFormSubmit} isLoading={isLoading} />

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
          {isLoading && <CircularProgress />}
        </Box>

        {error && !isLoading && ( // Keep error display logic
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {!isLoading && !error && results && ( // Keep results display logic
          <ResultsDashboard data={results} />
        )}
      </Container>
    </>
  );
}; // Added semicolon for consistency

export default App;
