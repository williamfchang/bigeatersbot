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
    const latestTimestamp = await getLatestTimestampForStockPriceData(db, symbol);

    // Create list of entries
    let currTime = new Date(removeSeconds(startTime));
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

// With portfolio info, create leaderboard output
export function getLeaderboard(portfolios) {
    // Create leaderboard output string
    let output = "Leaderboard:\n";
    for (const {user_id, symbol, num_shares, balance} of portfolios) {
        output += `1. <@${user_id}>: \`${balance}\` profit / \`${num_shares}\` shares\n`;
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
    let output = `Stock price of $${symbol} in ${c.DATA_UPLOAD_INTERVAL_MINUTES} min increments (PDT):\n`
    const dataPointsPerHour = Math.floor(60/c.DATA_UPLOAD_INTERVAL_MINUTES)

    for (let i = 0; i < results.length; i += dataPointsPerHour) {
        const firstDate = new Date(results[i].timestamp);
       
        // get hour
        const currHour = convertToLocalTime(firstDate).toLocaleTimeString([], { hour: "2-digit" })

        // get values for this hour
        let arrForCurrHour = results.slice(i, i+dataPointsPerHour).map(entry => String(entry.value));
        arrForCurrHour = arrForCurrHour.map(s => s.padStart(3, '0'))

        // put it all together
        const strForCurrHour = `${currHour}: ${arrForCurrHour.join(' ')}\n`
        output += strForCurrHour
    }

    return '```\n' + output + '\n```';
}

// make buy order. We round down to the nearest 5th minute
export async function newBuyOrder(db, symbol, user_id, num_shares) {
    const roundedDate = roundDownDateToNearestInterval(new Date());

    // create buy order. overwrite previous buy order if it exists
    const { results } = await db.prepare('INSERT OR REPLACE INTO orders (user_id, symbol, timestamp, action, num_shares) VALUES (?, ?, ?, ?, ?)')
        .bind(user_id, symbol, roundedDate.getTime(), 'buy', num_shares)
        .run();

    // output
    const roundedDateLocalTimeString = getLocalTimeString(roundedDate)
    return `<@${user_id}>, your BUY order for ${num_shares} shares of $${symbol} has been submitted for ${roundedDateLocalTimeString}.`;
}

// make sell order. We round down to the nearest 5th minute
export async function newSellOrder(db, symbol, user_id, num_shares) {
    const roundedDate = roundDownDateToNearestInterval(new Date());

    // create sell order. overwrite previous sell order if it exists
    const { results } = await db.prepare('INSERT OR REPLACE INTO orders (user_id, symbol, timestamp, action, num_shares) VALUES (?, ?, ?, ?, ?)')
        .bind(user_id, symbol, roundedDate.getTime(), 'sell', num_shares)
        .run();

    // output
    const roundedDateLocalTimeString = getLocalTimeString(roundedDate)
    return `<@${user_id}>, your SELL order for ${num_shares} shares of $${symbol} has been submitted for ${roundedDateLocalTimeString}.`;
}

// get a user's open orders
export async function getOpenOrders(db, symbol, user_id) {
    const { results } = await db.prepare("SELECT * FROM orders WHERE user_id = ? AND symbol = ? AND executed = FALSE")
        .bind(user_id, symbol)
        .run()
    
    if (results.length == 0) {
        return 'You have no open orders';
    }
    
    let output = `\`${results.length}\` open orders for <@${user_id}>:\n\`\`\`\n`

    for (const row of results) {
        const dateStr = getLocalDateTimeString(new Date(row.timestamp))
        const actionStr = row.action.toUpperCase().padStart(4, ' ');
        const numSharesStr = String(row.num_shares).padStart(2, '0');

        output += `${dateStr}: ${actionStr} ${numSharesStr} of $${symbol}\n`
    }
    
    return output + '```';
}

// Execute orders before endTime. Note that both stock price timestamps and order timestamps are rounded to nearest 5th minute
// TODO: only works for one stock symbol
export async function executeOrdersAtOrBefore(db, symbol, endTime) {
    // -- Setup -- //
    // Retrieve open orders before endTime, ordered from earliest to most recent
    const { results: openOrders } = await db.prepare('SELECT * FROM orders WHERE symbol = ? AND timestamp <= ? AND executed = 0 ORDER BY timestamp')
        .bind(symbol, endTime.getTime())
        .run();
    
    if (openOrders.length == 0) {
        return `No open orders that can be fulfilled, latest data is \`${getLocalDateTimeString(endTime)}\``;
    }
    
    // Create some tracking variables
    const cashPortfolios = await getPortfolios(db, symbol); // fixme
    const portfolioPerUser = new Map(cashPortfolios.map(row => [row.user_id, {'num_shares': row.num_shares, 'balance': row.balance}])); // 1. maps from user to portfolio info
    const filledOrdersPerUser = new Map(); // 2. maps from user to list of filled orders, and at what cost

    // -- Fulfill each order -- //
    for (const openOrder of openOrders) {
        // Variable declarations. num_shares may need to be modified when selling
        const { symbol: _ , user_id, timestamp, action, num_shares: __, executed } = openOrder;
        let num_shares = openOrder.num_shares;

        // Populate tracking maps if needed
        if (!portfolioPerUser.has(user_id)) {
            portfolioPerUser.set(user_id, { num_shares: 0, balance: 0 });
            // await createPortfolioForUser(db, user_id, symbol); // also create portfolio for user in db
        }
        if (!filledOrdersPerUser.has(user_id)) {
            filledOrdersPerUser.set(user_id, []);
        }

        // Get some variables
        const stockPrice = await getStockPriceAtTimestamp(db, symbol, timestamp);
        const userPortfolio = portfolioPerUser.get(user_id);
        const numTotalShares = userPortfolio.num_shares;

        // Buy/sell
        if (action == 'buy') {
            // Buy
            userPortfolio.balance -= stockPrice * num_shares; // purchase using buy power
            userPortfolio.num_shares += num_shares; // acquire this many shares
        }
        else {
            // Sell
            if (numTotalShares < num_shares) { num_shares = numTotalShares; } // adjust shares to sell if needed

            userPortfolio.num_shares -= num_shares; // sell this many shares
            userPortfolio.balance += stockPrice * num_shares; // gain buy power
        }
        
        // Update portfolios map
        portfolioPerUser.set(user_id, userPortfolio);

        // Update filled orders map
        const filled = filledOrdersPerUser.get(user_id);
        filled.push({'timestamp': timestamp, 'action': action, 'num_shares': num_shares, 'at_price': stockPrice});
        filledOrdersPerUser.set(user_id, filled);
    }

    // -- db updates -- //
    // Mark orders as executed
    await db.prepare('UPDATE orders SET executed = 1 WHERE symbol = ? AND timestamp <= ?')
        .bind(symbol, endTime.getTime())
        .run();

    // Update portfolios in db
    for (const [user_id, portfolio] of portfolioPerUser) {
        await db.prepare('INSERT OR REPLACE INTO portfolios (user_id, symbol, num_shares, balance) VALUES (?, ?, ?, ?)')
            .bind(user_id, symbol, portfolio.num_shares, portfolio.balance)
            .run();
    }

    // -- Generate order execution summary -- //
    return getOrderExecutionSummary(filledOrdersPerUser, endTime, symbol);
}

// Helper function to generate order execution summary
export function getOrderExecutionSummary(filledOrdersPerUser, endTime, symbol) {
  let output = `Order execution summary (fulfilled open orders up until ${getLocalDateTimeString(endTime)}):\n\n`

  for (const [user_id, filledOrders] of filledOrdersPerUser) {
    let userOrders = ''
    for (const {timestamp, action, num_shares, at_price} of filledOrders) {
        const dateStr = getLocalDateTimeString(new Date(timestamp));
        const actionStr = action.toUpperCase().padStart(4, ' ');
        const numSharesStr = String(num_shares).padStart(2, '0');

        userOrders += `${dateStr}: ${actionStr} ${numSharesStr} of $${symbol} @ ${at_price}\n`;
    }
    
    output += `<@${user_id}>:\n\`\`\`\n` + userOrders + '```\n'
  }
  
  return output;
}



// -- General helper functions -- //
// Start portfolio for a user
export async function createPortfolioForUser(db, user_id, symbol) {
    const { results } = await db.prepare("INSERT INTO portfolios (user_id, symbol, num_shares, balance) VALUES (?, ?, ?, ?)")
        .bind(user_id, symbol, 0, 0)
        .run();
    
    return results;
}

// Get all portfolios
export async function getPortfolios(db, symbol) {
    const { results } = await db.prepare(`SELECT * FROM portfolios WHERE symbol = ? ORDER BY balance DESC LIMIT ?`)
        .bind(symbol, c.MAX_LEADERBOARD_ENTRIES)
        .run();
    
    return results;
}

// Get the timestamp of the most recent stock price
export async function getLatestTimestampForStockPriceData(db, symbol) {
    const { results: latestTimestampResults } = await db.prepare("SELECT MAX(timestamp) FROM stock_price WHERE symbol = ?")
        .bind(symbol)
        .run();
    return latestTimestampResults[0]['MAX(timestamp)'] || -1;
}

// Get stock price at timestamp
export async function getStockPriceAtTimestamp(db, symbol, timestamp) {
    const { results: stockPriceResults } = await db.prepare('SELECT * FROM stock_price WHERE symbol = ? AND timestamp = ?')
        .bind(symbol, timestamp)
        .run();
    return stockPriceResults[0].value;
}

export async function getNumRealizedAndUnrealizedShares(db, user_id, symbol) {
    // Get sum of buy orders
    const { results: totalBuyResults } = await db.prepare("SELECT SUM(num_shares) FROM orders WHERE user_id = ? AND symbol = ? AND action = ?")
        .bind(user_id, symbol, 'buy')
        .run();
    
    // Get sum of sell orders
    const { results: totalSellResults } = await db.prepare("SELECT SUM(num_shares) FROM orders WHERE user_id = ? AND symbol = ? AND action = ?")
        .bind(user_id, symbol, 'sell')
        .run();
    
    // Calculate number of shares
    return totalBuyResults[0]['SUM(num_shares)'] - totalSellResults[0]['SUM(num_shares)']; 
}

export function inTradingWindow(date) {
    // Check "today's" trading window
    let openTime = new Date()
    openTime.setHours(c.TRADING_OPEN_HOUR_UTC)
    openTime = removeHoursAndSeconds(openTime)
    
    let closeTime = new Date(openTime)
    closeTime.setHours(closeTime.getHours() + c.TRADING_WINDOW_LENGTH_HOURS)

    if (date >= openTime && date < closeTime) {
        return true;
    }

    // Check "yesterday's" trading window
    openTime.setDate(openTime.getDate() - 1)
    closeTime.setDate(closeTime.getDate() - 1)

    if (date >= openTime && date < closeTime) {
        return true;
    }

    // Check "tomorrow's" trading window
    openTime.setDate(openTime.getDate() + 2)
    closeTime.setDate(closeTime.getDate() + 2)

    if (date >= openTime && date < closeTime) {
        return true;
    }

    // not in any window, so it is closed
    return false;
}

export function getTradingOffHoursString() {
    let openTime = new Date()
    openTime.setHours(c.TRADING_OPEN_HOUR_UTC)
    openTime = removeHoursAndSeconds(openTime)
    
    let closeTime = new Date(openTime)
    closeTime.setHours(closeTime.getHours() + c.TRADING_WINDOW_LENGTH_HOURS)

    return `${getLocalTimeString(closeTime)} - ${getLocalTimeString(openTime)}`
}


// -- Date helper functions -- //
// convert UTC to local time with offset.
// TODO: this is currently hardcoded to PDT
export function convertToLocalTime(date) {
    const outputDate = new Date(date);
    outputDate.setHours(outputDate.getHours() + c.PDT_OFFSET);
    return outputDate;
}

// show date as MM/DD, in current timezone
export function getLocalDateString(date) {
    return convertToLocalTime(date).toLocaleDateString([], { month: "2-digit", day: "2-digit" })
}

// show time as XX:XX AM/PM, in current timezone
export function getLocalTimeString(date) {
    return convertToLocalTime(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// get date and time in current timezone
export function getLocalDateTimeString(date) {
    return getLocalDateString(date) + ' ' + getLocalTimeString(date);
}

// interval i means data is uploaded every i minutes
export function roundDownDateToNearestInterval(date) {
    const surplusMinutes = date.getMinutes() % c.DATA_UPLOAD_INTERVAL_MINUTES
    date.setMinutes(date.getMinutes()-surplusMinutes)
    return removeSeconds(date)
}

// set to XX:XX:00.000
export function removeSeconds(date) {
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}

// set to XX:00:00.000
export function removeHoursAndSeconds(date) {
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}