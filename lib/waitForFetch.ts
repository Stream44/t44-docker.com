/**
 * Wait for a URL to respond with a specific condition
 */
export interface WaitForFetchOptions {
    url: string;
    method?: string;  // HTTP method (GET, POST, etc.)
    headers?: Record<string, string>;  // Request headers
    body?: string;  // Request body
    status: true | false | number;  // true = any response, false = no response (fetch fails), number = specific status code
    retryDelayMs?: number;
    requestTimeoutMs?: number;
    timeoutMs?: number;
    verbose?: boolean;
    returnResponse?: boolean;  // If true, return the Response object instead of boolean
}

export async function waitForFetch(options: WaitForFetchOptions & { returnResponse: true }): Promise<Response>;
export async function waitForFetch(options: WaitForFetchOptions & { returnResponse?: false }): Promise<boolean>;
export async function waitForFetch(options: WaitForFetchOptions): Promise<boolean | Response> {
    const {
        url,
        method = 'GET',
        headers,
        body,
        status,
        retryDelayMs = 1000,
        requestTimeoutMs = 2000,
        timeoutMs = 30000,
        verbose = false,
        returnResponse = false
    } = options;

    const startTime = Date.now();
    let attemptCount = 0;

    while (Date.now() - startTime < timeoutMs) {
        attemptCount++;
        const elapsed = Date.now() - startTime;

        try {
            const response = await fetch(url, {
                method,
                headers,
                body,
                signal: AbortSignal.timeout(requestTimeoutMs)
            });

            // Check if condition is met
            if (status === true) {
                // Any response is success
                if (verbose) {
                    console.log(`[waitForFetch] URL ${url} responded (status: ${response.status}) after ${attemptCount} attempts (${elapsed}ms)`);
                }
                return returnResponse ? response : true;
            } else if (typeof status === 'number') {
                // Specific status code required
                if (response.status === status) {
                    if (verbose) {
                        console.log(`[waitForFetch] URL ${url} responded with status ${status} after ${attemptCount} attempts (${elapsed}ms)`);
                    }
                    return returnResponse ? response : true;
                } else {
                    if (verbose) {
                        console.log(`[waitForFetch] Attempt ${attemptCount}: Got status ${response.status}, expected ${status} (${elapsed}ms)`);
                    }
                }
            }
            // If status === false, we want fetch to fail, so getting a response means condition not met
        } catch (error) {
            // Fetch failed
            if (status === false) {
                // We want fetch to fail, so this is success
                if (verbose) {
                    console.log(`[waitForFetch] URL ${url} is not responding (as expected) after ${attemptCount} attempts (${elapsed}ms)`);
                }
                return true;
            } else {
                if (verbose) {
                    console.log(`[waitForFetch] Attempt ${attemptCount}: Request failed (${elapsed}ms)`);
                }
            }
        }

        // Wait before next attempt, but don't exceed total timeout
        const remainingTime = timeoutMs - (Date.now() - startTime);
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.min(retryDelayMs, remainingTime)));
        }
    }

    if (verbose) {
        console.log(`[waitForFetch] Timeout reached after ${attemptCount} attempts (${Date.now() - startTime}ms)`);
    }
    return false;
}
