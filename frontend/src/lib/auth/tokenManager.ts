import { jwtDecode } from 'jwt-decode';

const TOKEN_KEY = 'meetingmind_auth_token';

export interface DecodedToken {
    email: string;
    userId: number;
    iat?: number;
    exp?: number;
}

export const tokenManager = {
    setToken: (token: string): void => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(TOKEN_KEY, token);
        }
    },

    getToken: (): string | null => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(TOKEN_KEY);
        }
        return null;
    },

    removeToken: (): void => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(TOKEN_KEY);
        }
    },

    isAuthenticated: (): boolean => {
        const token = tokenManager.getToken();
        return !!token;
    },

    decodeToken: (): DecodedToken | null => {
        const token = tokenManager.getToken();
        if (!token) return null;

        try {
            const decoded = jwtDecode<DecodedToken>(token);
            return decoded;
        } catch (error) {
            console.error("[TokenManager] Decode failed:", error, "Token snippet:", token?.slice(0, 10));
            return null;
        }
    },

    getUser: (): { email: string; userId: number } | null => {
        const decoded = tokenManager.decodeToken();
        if (!decoded) return null;
        return { email: decoded.email, userId: decoded.userId };
    },
};
