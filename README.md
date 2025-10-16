This is big eaters bot.

# Intro
## Resources
- Tutorial: https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers
- Starting code taken from https://github.com/discord/cloudflare-sample-app

## Installation
1. `cd bigeatersbot`
2. `npm install`
3. Populate `.dev.vars`

Store secrets in Cloudflare worker
```
$ npx wrangler secret put DISCORD_TOKEN
$ npx wrangler secret put DISCORD_PUBLIC_KEY
$ npx wrangler secret put DISCORD_APPLICATION_ID
$ npx wrangler secret put DISCORD_TEST_GUILD_ID # this might not be needed?
```

To add new commands:
1. Add to commands.js
2. Add to register.js
3. Implement in server.js
4. Run `DISCORD_TOKEN=**** DISCORD_APPLICATION_ID=**** node src/register.js`

To deploy the app:
`npm run publish` -> this will publish to the Cloudflare worker!

# Features
## Vitals stock market
Imagine if your body's vitals could be traded on the stock market! idk stock market terminology that well so the actual implementation here might not be "stocks".

TLDR: There's a 3 hour delay on data upload. Let's say it's 3pm, you decide to buy 10 shares. Then later that day when the blood glucose measurement for 3pm is uploaded, the order will execute.

For a more detailed description: For two weeks October 2025 I have a glucose monitor. The glucose monitor data uploads to Apple Health with 5-minute frequency but on a 3 hour delay. Users can bet on the value of my blood glucose at a given time as follows:
- Trading
    - When you decide to buy/sell the stock, it will be for what the stock costs at the current time (e.g. you buy 5 shares at 6pm)
    - Once the data gets uploaded for that time (e.g. the glucose monitor reading at 6pm), the buy/sell order is executed
        - Data upload isn't fully automated, so it may be delayed more than 3 hours (I need to manually press a button to get it uploaded)
- Buying stock
    - When your buy order executes, you get the shares at the value (using your balance)
    - You can make buy order of maximum 20 shares per data point
- Selling stock
    - When your sell order executes, your shares sell at the given value which goes into your balance
- Glucose monitoring extra details
    - There is a running leaderboard, which orders everyone by amount of earnings
    - For the glucose monitor -- trading ends Oct 23 2025 (because that's when my glucose monitor expires lol)
    - Any leftover stocks will be auto-sold at 55 mg/dL (which is the lowest value the glucose monitor can read)
    - Also FYI the typical range is 70-140 mg/dl

### Commands
|command|description|constraints|
|-|-|-|
|`/hello-world`|Outputs some info about the bot||
|`/leaderboard`|Lists out every user, how many earnings they have, how many shares they have||
|`/get-price`|Returns stock price for last 24h||
|`/buy <num>`|Send buy order of `num` of shares, for the current time. Your buy order will be executed after ~3 hours, once the stock price gets updated for the buy time.|`num` <= 20. Only one buy/sell order can exist for a given 5-min period (aka the last order you made will be the one that's executed)|
|`/sell <num>`|Send sell order of `num` of shares, for the current time. Your sell order will be executed once stock price updates.|`num` <= 20. While you can make the sell order even if you don't enough shares, the order would fail on execution.|
|`/get-open-orders`|List your orders that haven't been executed yet||

### TODO (for me)
- Trading limit changes
  - trading window 10am-2am
  - 100 shares can be bought per day (trading window)
- Improvements
  - better leaderboard output
  - create graph for glucose values

### old TODO
- Register the discord commands -> DONE
- Create databases -> DONE
  - ~~users (user_id, discord_username)~~
  - orders (order_id, symbol, username, timestamp, action, amount, executed)
  - portfolios (username, symbol, amount) -> symbol: $CASH is earnings
  - stock_price (symbol, time, value)
- Create functionality for each command
  - leaderboard -> DONE
  - getprice -> DONE
  - buy -> DONE
  - sell -> DONE
- Create get endpoint for uploading data
  - takes parameters stock, startTime, values -> done
  - stores any new data points in stockPrice -> done
- execute any buy/sell orders for new data upload
  - test this in a test table!!