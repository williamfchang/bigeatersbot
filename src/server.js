/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';

import * as commands from './commands.js';
import * as util from './util.js';
import * as c from './constants.js';

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();
const symbol = 'WFC-BG'; // TODO: support multiple symbols, currently hardcoded


// Homepage!
router.get('/', (request, env) => {
  return new Response(`👋 BigEaterBot checking in! App ID: ${env.DISCORD_APPLICATION_ID}`);
});

// This endpoint takes data to store to db, then executes any orders which we now have data for
// Parameters: password=****&startTime=2025-10-13T23:30:00-07:00&values=[]
router.get('/upload-data', async (request, env) => {
  const url = new URL(request.url);
  if (!passwordIsCorrect(url, env)) {
    return new JsonResponse({ error: `ur really gonna try this? please do not try to upload fake data lol` }, { status: 401 });
  }

  const startTime = new Date(url.searchParams.get('startTime')) || '';
  const values = JSON.parse(url.searchParams.get('values')) || [];

  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
});

// Manual data upload, aka harcode the values for upload here. Parameters: password=****
router.get('/manual-upload-data', async (request, env) => {
  const url = new URL(request.url);
  if (!passwordIsCorrect(url, env)) {
    return new JsonResponse({ error: `this endpoint is for uploading hard coded data cuz i'm lazy` }, { status: 401 });
  }

  const startTime = new Date('2025-10-15T00:00:22-07:00')
  const values = []
  
  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
})

// Manually invoke order execution. Parameters: password=****
router.get('/manual-order-execution', async (request, env) => {
  const url = new URL(request.url);
  if (!passwordIsCorrect(url, env)) {
    return new JsonResponse({ error: `this endpoint is for manually invoking order execution but u need password` }, { status: 401 });
  }

  const db = env['vitals-stock-market'];
  const latestTimestamp = await util.getLatestTimestampForStockPriceData(db, symbol);
  const result = await util.executeOrdersAtOrBefore(db, symbol, new Date(latestTimestamp));

  return new JsonResponse({ message: result });
})

// Testing grounds (get stock price)
router.get('/testing', async (request, env) => {
  const db = env['vitals-stock-market']
  
  // const user_id = '150093212034269184';
  const date = new Date();
  date.setHours(date.getHours() + 13);
  const content = util.inTradingWindow(date);

  return new JsonResponse({ message: `${util.getLocalDateTimeString(date)} in trading window? ${content}` });
})



/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const db = env['vitals-stock-market'];
    const user_id = interaction.member.user.id;

    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case commands.HELLO_WORLD_COMMAND.name.toLowerCase(): {
        console.log('HELLO_WORLD_COMMAND received');

        const discordUser = interaction.member.user;

        return createBotResponse(
          `hello, <@${discordUser.id}>!
- **TLDR for bot**: There's a 3 hour delay on data upload. Let's say it's 3pm, you decide to buy 10 "shares". Then later that day, when the blood glucose measurement for 3pm is uploaded, the order will execute at that "price". The person with the most gains by Thursday 10/23 will get a prize (TBD)!
  - See README for more details: https://github.com/williamfchang/bigeatersbot
- **Bot progress**: almost functionally complete -- you can start using the bot (aka buy/sell)! I still need to write the logic that executes the orders and calculates your gains (hopefully by EOD 10/15) so you won't see any leaderboard updates until then.`);
      }
      case commands.LEADERBOARD_COMMAND.name.toLowerCase(): {
        console.log('LEADERBOARD_COMMAND received');

        const portfolios = await util.getPortfolios(db, symbol);
        const content = util.getLeaderboard(portfolios);
        
        return createBotResponse(content, true);
      }
      case commands.GET_PRICE_COMMAND.name.toLowerCase(): {
        console.log('GET_PRICE_COMMAND received');

        const content = await util.getStockPrice(db, symbol);
        
        return createBotResponse(content, true);
      }
      case commands.BUY_COMMAND.name.toLowerCase(): {
        console.log('BUY_COMMAND received');

        // Early exit if trading window is closed
        if (!util.inTradingWindow(new Date())) {
          return createBotResponse(`Order unsuccessful, trading is closed between \`${util.getTradingOffHoursString()}\``, true);
        }

        // Early exit if user would surpass 100 shares
        const amount = interaction.data.options[0].value;
        const numTotalShares = await util.getNumRealizedAndUnrealizedShares(db, user_id, symbol);
        if (numTotalShares + amount > c.MAX_TOTAL_SHARES_PER_USER) {
          return createBotResponse(`Order unsuccessful, you are at \`${numTotalShares}\` shares (including unrealized orders) and would surpass the max of \`${c.MAX_TOTAL_SHARES_PER_USER}\` shares`, true);
        }
        
        // Otherwise, create buy order
        const content = await util.newBuyOrder(db, symbol, user_id, amount);

        return createBotResponse(content, false);
      }
      case commands.SELL_COMMAND.name.toLowerCase(): {
        console.log('SELL_COMMAND received');

        // Early exit if trading window is closed
        if (!util.inTradingWindow(new Date())) {
          return createBotResponse(`Order unsuccessful, trading is closed between \`${util.getTradingOffHoursString()}\``, true);
        }

        // Early exit if user would go below 0 shares
        const amount = interaction.data.options[0].value;
        const numTotalShares = await util.getNumRealizedAndUnrealizedShares(db, user_id, symbol);
        if (numTotalShares - amount < 0) {
          return createBotResponse(`Order unsuccessful, you are at \`${numTotalShares}\` shares (including unrealized orders) and would go below 0 shares`, true);
        }

        const content = await util.newSellOrder(db, symbol, user_id, amount);

        return createBotResponse(content, false);
      }
      case commands.GET_OPEN_ORDERS_COMMAND.name.toLowerCase(): {
        console.log('GET_OPEN_ORDERS_COMMAND received');

        const content = await util.getOpenOrders(db, symbol, user_id);

        return createBotResponse(content, true);
      }
      case commands.EXECUTE_ORDERS_COMMAND.name.toLowerCase(): {
        console.log('EXECUTE_ORDERS_COMMAND received');

        const latestTimestamp = await util.getLatestTimestampForStockPriceData(db, symbol);
        const content = await util.executeOrdersAtOrBefore(db, symbol, new Date(latestTimestamp));

        return createBotResponse(content, false);
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
    }
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

// Helper function to create json response
function createBotResponse(content, ephemeral = false) {
  let data = { content: content }
  if (ephemeral) {
    data.flags = InteractionResponseFlags.EPHEMERAL
  }

  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: data
  });
}

// Helper function to check password
function passwordIsCorrect(url, env) {
  const d1ModifyPassword = env.D1_MODIFY_PASSWORD;

  const password = url.searchParams.get('password') || '';
  return password == d1ModifyPassword;
}



const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
