// /app/packages/utils/src/axios.ts
// Global Axios instance with automatic X-Request-ID propagation
// Used by all services: weaveController, activities, ingestion, etc.
import axios from 'axios';
import { asyncLocalStorage } from '@regloom/utils';
import { logger } from '@regloom/utils';

const instance = axios.create({
    timeout: 30000,
    validateStatus: (status) => status < 500, // Don't throw on 4xx
});

// Request interceptor: inject X-Request-ID from context
instance.interceptors.request.use((config) => {
    const store = asyncLocalStorage.getStore();
    const requestId = store?.requestId;

    if (requestId) {
        config.headers = config.headers || {};
        config.headers['X-Request-ID'] = requestId;
        logger.debug('Propagating requestId to downstream service', {
            requestId,
            url: config.url,
            method: config.method,
        });
    }

    return config;
});

// Response interceptor: log errors with requestId
instance.interceptors.response.use(
    (response) => {
        logger.debug('Downstream call succeeded', {
            requestId: response.config.headers['X-Request-ID'],
            status: response.status,
            url: response.config.url,
        });
        return response;
    },
    (error) => {
        const requestId = error.config?.headers['X-Request-ID'];
        logger.error('Downstream call failed', {
            requestId,
            url: error.config?.url,
            status: error.response?.status,
            error: error.message,
        });
        return Promise.reject(error);
    }
);

export default instance;
// export { default as tracedAxios } from './axios';