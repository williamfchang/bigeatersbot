import * as constants from './constants.js';

// get SQL user id from discord username
export async function getUserId(db, username) {
    const { results } = await db.prepare("SELECT * FROM users WHERE discord_username = ?")
        .bind(username).run();
    return results[0]?.user_id || -1;
}


// Return cash results and stocks results
const MAX_LEADERBOARD_ENTRIES = 25;
export async function getPortfolios(db) {
    const { results: cashResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol = 'CASH' ORDER BY amount DESC LIMIT ${MAX_LEADERBOARD_ENTRIES}`)
        .run();
    const { results: stocksResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol != 'CASH' ORDER BY amount DESC LIMIT ${MAX_LEADERBOARD_ENTRIES*constants.NUM_SYMBOLS}`)
        .run();
    
    return [cashResults, stocksResults];
}