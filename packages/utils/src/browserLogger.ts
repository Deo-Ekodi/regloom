// apps/packages/utils/src/browserLogger.ts
// ─────────────────────────────────────────────────────────────────────────────
// Browser-only logger – 100% safe, zero dependencies, no winston, no node stuff
// Runs ONLY in browser – backend keeps using real winston logger
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const isDev = process.env.NODE_ENV !== 'production'

class BrowserLogger {
    private level: LogLevel = isDev ? 'debug' : 'info'
    private service = 'frontend'

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['error', 'warn', 'info', 'debug']
        return levels.indexOf(level) <= levels.indexOf(this.level)
    }

    error(...args: any[]) {
        if (this.shouldLog('error')) console.error(`%c[${this.service}] ERROR`, 'color: red', ...args)
    }

    warn(...args: any[]) {
        if (this.shouldLog('warn')) console.warn(`%c[${this.service}] WARN`, 'color: orange', ...args)
    }

    info(...args: any[]) {
        if (this.shouldLog('info')) console.info(`%c[${this.service}] INFO`, 'color: cyan', ...args)
    }

    debug(...args: any[]) {
        if (this.shouldLog('debug')) console.debug(`%c[${this.service}] DEBUG`, 'color: gray', ...args)
    }
}

export const browserLogger = new BrowserLogger()