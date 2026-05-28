(function (global) {
    const DEFAULT_QUOTES_URL = 'quotes.json';
    let quotesCache = null;
    let quotesPromise = null;

    async function loadQuotes(url = DEFAULT_QUOTES_URL) {
        if (quotesCache) {
            return quotesCache;
        }

        if (!quotesPromise) {
            quotesPromise = fetch(url, { cache: 'no-store' })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load quotes from ${url}: ${response.status}`);
                    }
                    return response.json();
                })
                .then((data) => {
                    quotesCache = Array.isArray(data) ? data : [];
                    return quotesCache;
                })
                .catch((error) => {
                    quotesPromise = null;
                    throw error;
                });
        }

        return quotesPromise;
    }

    async function getRandomQuote(url = DEFAULT_QUOTES_URL) {
        const quotes = await loadQuotes(url);
        if (!quotes.length) {
            return null;
        }

        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    async function getQuoteById(id, url = DEFAULT_QUOTES_URL) {
        const quotes = await loadQuotes(url);
        return quotes.find((quote) => String(quote.id) === String(id)) || null;
    }

    async function searchQuotes(keyword, url = DEFAULT_QUOTES_URL) {
        const normalized = String(keyword || '').trim().toLowerCase();
        if (!normalized) {
            return [];
        }

        const quotes = await loadQuotes(url);
        return quotes.filter((quote) => {
            const en = String(quote.en || '').toLowerCase();
            const zh = String(quote.zh || '').toLowerCase();
            return en.includes(normalized) || zh.includes(normalized);
        });
    }

    const QuoteAPI = {
        loadQuotes,
        getRandomQuote,
        getQuoteById,
        searchQuotes,
        clearCache() {
            quotesCache = null;
            quotesPromise = null;
        },
    };

    global.QuoteAPI = QuoteAPI;
})(window);