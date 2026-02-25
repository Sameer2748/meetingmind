import axios from 'axios';
import { tokenManager } from '../auth/tokenManager';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live';

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
    chat: async (id: number, message: string, history: any[] = []) => {
        const res = await apiClient.post(`/api/recordings/${id}/chat`, { message, history });
        return res.data;
    },
};

export default apiClient;
