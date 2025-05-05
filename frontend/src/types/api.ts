// frontend/src/services/api.ts
import axios, { AxiosError } from 'axios';
// Ensure these types match the LATEST definitions in types/api.ts
import { AdviceRequestData, AdviceResponse, ScenarioInput } from '../types/api';

// Configure Base URL using environment variables (Vite example)
// Ensure .env file exists in frontend root with VITE_API_BASE_URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'; // Default for local dev

// Create an Axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 30000, // Increase timeout to 30 seconds for potentially longer LLM calls
});

/**
 * Calls the backend API to generate the retirement advice report.
 * @param scenarioData The user's scenario input data, already processed (numbers).
 * @returns A Promise resolving with the AdviceResponse data (including markdown report) from the backend.
 * @throws Throws an error with a user-friendly message if the API call fails.
 */
export const generateAdvice = async (scenarioData: ScenarioInput): Promise<AdviceResponse> => {
    console.log('Sending data to API:', JSON.stringify(scenarioData, null, 2)); // Log stringified data for details
    console.log('API Endpoint:', `${API_BASE_URL}/api/v1/advice`);

    // Construct the request body matching the backend AdviceRequest model
    const requestBody: AdviceRequestData = {
         scenario: scenarioData
         // Add request_id if implemented: request_id: crypto.randomUUID()
    };

    try {
        // Make the POST request
        // Axios expects the response data structure via the generic <AdviceResponse>
        const response = await apiClient.post<AdviceResponse>('/api/v1/advice', requestBody);

        console.log('API Response Status:', response.status);
        // Log only part of the response data if report is too long
        // console.log('API Response Data:', response.data);

        // Return the full data part of the Axios response
        return response.data;

    } catch (error) {
        console.error('API Error Raw:', error);
        let errorMessage = 'An unknown error occurred while contacting the server.';

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>; // Use 'any' for generic error structure

            if (axiosError.response) {
                // Server responded with an error status (4xx or 5xx)
                console.error('API Error Status:', axiosError.response.status);
                console.error('API Error Data:', axiosError.response.data);
                const backendDetail = axiosError.response.data?.detail || axiosError.response.data?.message || axiosError.message;
                errorMessage = `Error ${axiosError.response.status}: ${backendDetail}`;
                 // Handle specific backend errors if needed
                if (axiosError.response.status === 400) {
                    errorMessage = `Input Error: ${backendDetail}`;
                } else if (axiosError.response.status === 500) {
                    errorMessage = `Server Error: An internal error occurred. Please try again later or check server logs. (${backendDetail})`;
                } else if (axiosError.response.status === 501) {
                     errorMessage = `Not Implemented: ${backendDetail}`;
                }

            } else if (axiosError.request) {
                // Request made, but no response received
                console.error('API No Response:', axiosError.request);
                errorMessage = 'Could not connect to the planner service. Please check your network connection and ensure the API server is running and accessible.';
            } else {
                // Error setting up the request
                console.error('API Request Setup Error:', axiosError.message);
                errorMessage = `Request setup error: ${axiosError.message}`;
            }
        } else if (error instanceof Error) {
             // Other JS errors
             errorMessage = `An unexpected application error occurred: ${error.message}`;
        }

        // Re-throw for the UI to catch
        throw new Error(errorMessage);
    }
};

// Export the configured apiClient if needed elsewhere
export { apiClient };
