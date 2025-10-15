import * as c from './constants.js';

// Write to db
export async function writeStockValuesToDb(db, symbol, startTime, values) {
    // Error checking
    if (startTime == '') {
        return 'ERROR: startTime is empty';
    }
    if (values.length == 0) {
        return 'ERROR: values is empty';
    }

    // Get latest timestamp in db
    const { results: latestTimestampResults } = await db.prepare("SELECT MAX(timestamp) FROM stock_price WHERE symbol = ?")
        .bind(symbol)
        .run();
    const latestTimestamp = latestTimestampResults[0]['MAX(timestamp)'] || -1; // if no data, default to -1 so all entries are added

    // Create list of entries
    let currTime = new Date(startTime);
    currTime.setMinutes(currTime.getMinutes() - c.DATA_UPLOAD_INTERVAL_MINUTES); // offset start time since we begin loop with increment
    const entries = [];
    for (const value of values) {
        // Increment time by interval
        currTime.setMinutes(currTime.getMinutes() + c.DATA_UPLOAD_INTERVAL_MINUTES);

        // Check current time against latest data point in db. Aka if data point is already in db, skip it
        // TODO: optimize this so we calculate the starting point in values
        if (currTime.getTime() <= latestTimestamp) {
            continue;
        }

        // add entry if time is newer (aka not in database)
        entries.push([symbol, currTime.getTime(), value]);
    }

    // Check if there are any entries
    if (entries.length == 0) {
        return 'No new entries, returning';
    }

    // Construct SQL statement
    let sql = 'INSERT INTO stock_price (symbol, timestamp, value) VALUES ';
    sql += entries.map(entry => `("${entry[0]}", ${entry[1]}, ${entry[2]})`).join(', ');

    await db.prepare(sql).run();
    return sql;
}

// Return cash results and stocks results
export async function getPortfolios(db) {
    const { results: cashResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol = 'CASH' ORDER BY amount DESC LIMIT ${c.MAX_LEADERBOARD_ENTRIES}`)
        .run();
    const { results: stocksResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol != 'CASH' ORDER BY amount DESC LIMIT ${c.MAX_LEADERBOARD_ENTRIES*c.NUM_SYMBOLS}`)
        .run();
    
    return [cashResults, stocksResults];
}

// With portfolio info, create leaderboard output
export function getLeaderboard(cashPortfolios, stocksPortfolios) {
    // Create leaderboard in order of most cash
    const leaderboard = new Map();
    for (const [index, row] of cashPortfolios.entries()) {
        leaderboard.set(row.user_id, {'HP': row.amount});
    } 

    // Add other stocks to the leaderboard
    for (const [index, row] of stocksPortfolios.entries()) {
        let user_portfolio = leaderboard.get(row.user_id);
        user_portfolio[row.symbol] = row.amount;
        leaderboard.set(row.user_id, user_portfolio);
    }

    // Create leaderboard output string
    let output = "Leaderboard:\n";
    for (const [key, value] of leaderboard) {
        output += `1. <@${key}>: ${JSON.stringify(value)}\n`;
    }

    return output;
}

// Get text output of stock price history
// TODO: currently hardcoded to 24 hours, and to PDT timezone
export async function getStockPrice(db, symbol) {
    // Get curr time and time 24 hours ago (starting at top of the hour)
    const currDate = new Date();
    const dateOneDayAgo = new Date(currDate);
    dateOneDayAgo.setHours(dateOneDayAgo.getHours() - 24);
    dateOneDayAgo.setMinutes(0);

    // Get values from db
    const { results } = await db.prepare("SELECT timestamp, value FROM stock_price WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?")
        .bind(symbol, dateOneDayAgo.getTime(), currDate.getTime())
        .run();

    // Construct output
    let output = `Stock price of ${symbol} since 24 hours ago (in PDT, data may be lagging):\n`
    const dataPointsPerHour = Math.floor(60/c.DATA_UPLOAD_INTERVAL_MINUTES)

    for (let i = 0; i < results.length; i += dataPointsPerHour) {
        const firstDate = new Date(results[i].timestamp);
       
        // get hour
        let currHour = convertToLocalTime(firstDate).getHours()
        currHour = firstDate.toLocaleTimeString([], { hour: "2-digit" })

        // get values for this hour
        let arrForCurrHour = results.slice(i, i+dataPointsPerHour).map(entry => String(entry.value));
        arrForCurrHour = arrForCurrHour.map(s => s.padStart(3, '0'))

        // put it all together
        const strForCurrHour = `${currHour}: ${arrForCurrHour.join(' ')}\n`
        output += strForCurrHour
    }

    return '```\n' + output + '\n```';
}

// make buy order
export async function newBuyOrder(db, symbol, user_id, amount) {
    const roundedDate = roundDownDateToNearestInterval(new Date());

    // create buy order. overwrite previous buy order if it exists
    const { results } = await db.prepare('INSERT OR REPLACE INTO orders (symbol, user_id, timestamp, action, amount) VALUES (?, ?, ?, ?, ?)')
        .bind(symbol, user_id, roundedDate.getTime(), 'buy', amount)
        .run();

    // output
    const roundedDateLocalTimeString = getLocalTimeString(roundedDate)
    return `<@${user_id}>, your BUY order for ${amount} shares of $${symbol} has been submitted for ${roundedDateLocalTimeString}.`;
}

// make sell order
export async function newSellOrder(db, symbol, user_id, amount) {
    const roundedDate = roundDownDateToNearestInterval(new Date());

    // create sell order. overwrite previous sell order if it exists
    const { results } = await db.prepare('INSERT OR REPLACE INTO orders (symbol, user_id, timestamp, action, amount) VALUES (?, ?, ?, ?, ?)')
        .bind(symbol, user_id, roundedDate.getTime(), 'sell', amount)
        .run();

    // output
    const roundedDateLocalTimeString = getLocalTimeString(roundedDate)
    return `<@${user_id}>, your SELL order for ${amount} shares of $${symbol} has been submitted for ${roundedDateLocalTimeString}.`;
}

// get a user's open orders
export async function getOpenOrders(symbol, user_id) {
    const { results } = await db.prepare("SELECT * FROM orders WHERE symbol = ? AND user_id = ? AND executed = FALSE")
        .bind(symbol, dateOneDayAgo.getTime(), currDate.getTime())
        .run();
    
    return JSON.stringify(results);
}

export async function executeOrdersInRange(symbol, startTime, endTime) {
    // Retrieve orders in range [startTime, endTime)
    startTime = removeSeconds(startTime)
    endTime = removeSeconds(endTime)
    endTime.setMinutes(endTime.getMinutes() + 1);

    const { results } = await db.prepare('SELECT * FROM orders WHERE symbol = ? AND timestamp >= ? AND timestamp < ?')
        .bind(symbol, startTime.getTime(), endTime.getTime())
        .run();
    
    // do more stuff
    
    return JSON.stringify(results);
}

// -- Date helper functions -- //
// convert UTC to local time with offset.
// TODO: this is currently hardcoded to PDT
function convertToLocalTime(date) {
    date.setHours(date.getHours() - c.PDT_OFFSET);
    return date;
}

// show time in hours and minutes, in current timezone
function getLocalTimeString(date) {
    return convertToLocalTime(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

// check if two dates are in the same minute.
// aka, 1:05:10 AM and 1:05:55 AM are both in the same minute 1:05 AM, but 1:05:55 AM and 1:06:00 AM are not
function sameMinute(date1, date2) {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate() &&
        date1.getHours() === date2.getHours() &&
        date1.getMinutes() === date2.getMinutes()
    );
}

// interval i means data is uploaded every i minutes
function roundDownDateToNearestInterval(date) {
    const surplusMinutes = date.getMinutes() % c.DATA_UPLOAD_INTERVAL_MINUTES
    date.setMinutes(date.getMinutes()-surplusMinutes)
    return removeSeconds(date)
}

// set to XX:XX:00.000
function removeSeconds(date) {
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}