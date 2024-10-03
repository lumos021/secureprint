const axios = require('axios');
const { jwtDecode } = require('jwt-decode');
const config = require('../utils/config');

class AuthManager {
    constructor() {
        this.store = null;
        this.apiUrl = config.apiUrl;
        this.initStore();
    }

    async initStore() {
        const { default: Store } = await import('electron-store');
        this.store = new Store({ encryptionKey: 'sbdLaKdljJgsGysbaguyc*&^*&nqbytnhibgas' });
    }

    async checkAuthState() {
        await this.initStore();
        const token = this.store.get('authToken');
        const userId = this.store.get('userId');
        if (!token || !userId) {
            return { isAuthenticated: false };
        }

        try {
            const decodedToken = jwtDecode(token);
            const now = Date.now() / 1000;

            if (decodedToken.exp < now) {
                const newToken = await this.refreshToken(token);
                if (newToken) {
                    this.store.set('authToken', newToken);
                    return { isAuthenticated: true, token: newToken, userId };
                }
            } else if (decodedToken.exp < now + 600) {
                this.refreshToken(token);
            }

            return { isAuthenticated: true, token, userId };
        } catch (error) {
            console.error('Auth check failed:', error);
            return { isAuthenticated: false };
        }
    }

    async login(credentials) {
        await this.initStore();
        try {
            const response = await axios.post(`${this.apiUrl}/api/auth/login`, credentials);
            const { token, userId } = response.data;
            
            this.store.delete('authToken');
            this.store.delete('userId');
            
            if (token) {
                this.store.set('authToken', token);
            }
            
            if (userId) {
                console.log('Stored userId:', userId);
                this.store.set('userId', userId);
            }
            
            return { success: true, token, userId };
        } catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: error.message };
        }
    }

    async register(registrationData) {
        await this.initStore();
        try {
            const { name, email, password, address, isShop, shopDetails } = registrationData;
            console.log('Sending registration data:', { name, email, password: password ? '[REDACTED]' : 'empty', address });
            const response = await axios.post(`${this.apiUrl}/api/auth/register`, {
                name,
                email,
                password,
                address,
                isShop,
                shopDetails
            });

            const { token, userId } = response.data;

            this.store.set('authToken', token);
            this.store.set('userId', userId);

            return { success: true, token, userId };
        } catch (error) {
            console.error('Registration failed:', error);
            return { success: false, error: error.response?.data?.message || 'Registration failed' };
        }
    }

    async refreshToken(oldToken) {
        await this.initStore();
        try {
            const response = await axios.post(`${this.apiUrl}/api/auth/refresh`, { token: oldToken });
            const newToken = response.data.token;
            this.store.set('authToken', newToken);
            return newToken;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return null;
        }
    }

    async logout() {
        await this.initStore();
        this.store.delete('authToken');
        this.store.delete('userId');
    }


    async getUserId() {
        await this.initStore();
        const userId = this.store.get('userId');
        return userId;
    }
}

module.exports = new AuthManager();