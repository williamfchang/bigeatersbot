// General constants
export const SYMBOLS = ['WFC-BG'];
export const NUM_SYMBOLS = SYMBOLS.length;
export const MAX_TOTAL_SHARES_PER_USER = 100;

// Data upload command
export const DATA_UPLOAD_INTERVAL_MINUTES = 5;

// Leaderboard command
export const MAX_LEADERBOARD_ENTRIES = 25;

// Get price command
export const PDT_OFFSET = -7;

// Trading window is 11am to 2am PDT
export const TRADING_OPEN_HOUR_UTC = 11 - PDT_OFFSET;
export const TRADING_WINDOW_LENGTH_HOURS = 14;