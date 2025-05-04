import React, { useState, useEffect } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';

// Import components
import InputForm from './components/InputForm';
import ResultsDashboard from './components/ResultsDashboard';

// Import API service
import { generateAdvice } from './services/api';
import { generateMockAdvice } from './services/mockApi';
import type { AdviceResponse, ScenarioInput } from './types/api';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<AdviceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Default to false to use the real API
  const [useMockApi, setUseMockApi] = useState<boolean>(false);
  
  // Read environment variable if available
  useEffect(() => {
    const envUseMock = import.meta.env.VITE_USE_MOCK_API;
    if (envUseMock !== undefined) {
      setUseMockApi(envUseMock === 'true');
    }
  }, []);

  // Handler for form submission
  const handleFormSubmit = async (scenarioData: ScenarioInput) => {
    console.log('Form submitted in App with processed data:', scenarioData);
    console.log('Using mock API:', useMockApi);
    
    setIsLoading(true);
    setError(null);
    setResults(null); // Clear previous results
    
    try {
      // Use either the real API or the mock API based on the toggle
      const response = useMockApi 
        ? await generateMockAdvice(scenarioData)
        : await generateAdvice(scenarioData);
      
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
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mt: 4, mb: 2 }}>
        Retirement Withdrawal Planner
      </Typography>
      
      {/* API Toggle Switch */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={useMockApi}
              onChange={(e) => setUseMockApi(e.target.checked)}
              color="primary"
            />
          }
          label="Use Demo Data"
        />
      </Box>
      
      <InputForm onSubmit={handleFormSubmit} isLoading={isLoading} />
      
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        {isLoading && <CircularProgress />}
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      
      {!isLoading && !error && results && (
        <ResultsDashboard data={results} />
      )}
    </Container>
  );
};

export default App;
