// /app/packages/utils/src/axios.ts
import axios from 'axios';
import { getContext, logger } from '@regloom/utils';

const instance = axios.create({
    timeout: 30000,
    validateStatus: (status) => status < 500, // Don't throw on 4xx
});

// Request interceptor: inject X-Request-ID from real context
instance.interceptors.request.use((config) => {
    const ctx = getContext();
    const requestId = ctx.requestId;

    config.headers = config.headers || {};
    config.headers['X-Request-ID'] = requestId;

    if (ctx.userId) {
        config.headers['X-User-ID'] = ctx.userId;
    }

    logger.debug('Propagating requestId to downstream service', {
        requestId,
        url: config.url,
        method: config.method?.toUpperCase(),
    });

    return config;
});

// Response interceptor: log with correct requestId
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
        const requestId = error.config?.headers?.['X-Request-ID'];
        logger.error('Downstream call failed', {
            requestId,
            url: error.config?.url,
            method: error.config?.method?.toUpperCase(),
            status: error.response?.status,
            error: error.message,
            data: error.response?.data,
        });
        return Promise.reject(error);
    }
);

export default instance;