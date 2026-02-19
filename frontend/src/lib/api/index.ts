import axios from 'axios';
import { tokenManager } from '../auth/tokenManager';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
    const token = tokenManager.getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const authAPI = {
    login: async (email: string) => {
        const res = await apiClient.post('/api/auth/login', { email });
        return res.data;
    },
};

export const recordingsAPI = {
    getRecordings: async () => {
        const res = await apiClient.get('/api/recordings');
        return res.data.recordings;
    },
    deleteRecording: async (id: number) => {
        const res = await apiClient.delete(`/api/recordings/${id}`);
        return res.data;
    },
};

export default apiClient;
