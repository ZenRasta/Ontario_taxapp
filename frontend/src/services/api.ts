// ./services/api.ts
import axios, { AxiosError } from 'axios';
import { AdviceRequestData, AdviceResponse, ScenarioInput } from '../types/api';

// Configure Base URL using environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Create an Axios instance with the base URL and default headers
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 15000, // 15 seconds
});

/**
 * Calls the backend API to generate retirement advice.
 * @param scenarioData The user's scenario input data, already processed (numbers).
 * @returns A Promise resolving with the AdviceResponse data from the backend.
 * @throws Throws an error with a user-friendly message if the API call fails.
 */
export const generateAdvice = async (scenarioData: ScenarioInput): Promise<AdviceResponse> => {
    console.log('Sending data to API:', scenarioData);
    console.log('API URL:', API_BASE_URL);

    // Construct the request body matching the backend AdviceRequest model
    const requestBody: AdviceRequestData = {
        scenario: scenarioData
    };

    try {
        // Make the POST request to the /api/v1/advice endpoint
        const response = await apiClient.post<AdviceResponse>('/api/v1/advice', requestBody);

        console.log('API Response Status:', response.status);
        
        // Return only the data part of the Axios response
        return response.data;

    } catch (error) {
        console.error('API Error Raw:', error);
        let errorMessage = 'An unknown error occurred while contacting the server.';

        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>;

            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('API Error Status:', axiosError.response.status);
                console.error('API Error Data:', axiosError.response.data);

                // Try to extract the 'detail' field from the backend's error response
                const backendDetail = axiosError.response.data?.detail || axiosError.response.data?.message;
                errorMessage = `Error ${axiosError.response.status}: ${backendDetail || axiosError.message}`;

            } else if (axiosError.request) {
                // The request was made but no response was received
                console.error('API No Response:', axiosError.request);
                errorMessage = 'Could not connect to the planner service. Please check your network connection and ensure the API server is running.';
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error('API Request Setup Error:', axiosError.message);
                errorMessage = `Request setup error: ${axiosError.message}`;
            }
        } else if (error instanceof Error) {
            // Handle non-Axios errors
            errorMessage = `An unexpected error occurred: ${error.message}`;
        }

        // Re-throw the error with a consolidated, user-friendly message
        throw new Error(errorMessage);
    }
};

// Export the apiClient for use in other services if needed
export { apiClient };