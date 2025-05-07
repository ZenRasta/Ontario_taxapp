// frontend/src/services/api.ts
import axios, { AxiosError } from 'axios';
// Import types from the correct location
import type { AdviceRequestData, AdviceResponse, ScenarioInput } from '../types/api';

// --- Environment Variable for Base URL ---
// Reads from .env file via Vite (e.g., VITE_API_BASE_URL=http://127.0.0.1:8000)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'; // Fallback for local dev

// --- Axios Client Instance ---
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 second timeout
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// --- Exported API Function ---
export const generateAdvice = async (
    scenarioData: ScenarioInput
): Promise<AdviceResponse> => {

    const endpoint = '/v1/advice';
    const requestBody: AdviceRequestData = { scenario: scenarioData };

    console.log(`API Request: POST ${apiClient.defaults.baseURL}${endpoint}`);
    console.log('API Request Body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await apiClient.post<AdviceResponse>(endpoint, requestBody);
        console.log(`API Response Status: ${response.status}`);
        return response.data; // Return the parsed JSON data

    } catch (error) {
        console.error('API Call Error:', error); // Log the raw error

        let errorMessage = 'An unexpected error occurred while generating the advice.';

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>;
            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                const status = axiosError.response.status;
                const backendDetail = axiosError.response.data?.detail || axiosError.message;
                errorMessage = `Server Error ${status}: ${backendDetail}`;
                console.error(`API Error Response (${status}):`, axiosError.response.data);
            } else if (axiosError.request) {
                // The request was made but no response was received
                errorMessage = 'Network Error: Could not connect to the API server. Please ensure it is running and accessible.';
                console.error('API No Response Error:', axiosError.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                errorMessage = `Request Error: ${axiosError.message}`;
                console.error('API Request Setup Error:', axiosError.message);
            }
        } else if (error instanceof Error) {
             errorMessage = `Application Error: ${error.message}`;
        }

        // Throw a new error with the processed message for the UI
        throw new Error(errorMessage);
    }
};

// Optional: Export the client if needed elsewhere
// export { apiClient };

// Note: Removed the previous 'export { apiClient }' at the end,
// as exporting the function directly is the primary goal here.
// If you needed to export 'apiClient' too, you could add it back or export individually.