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

// Parameters: password=****&startTime=2025-10-13T23:30:00-07:00&values=[]
router.get('/upload-data', async (request, env) => {
  const d1ModifyPassword = env.D1_MODIFY_PASSWORD;
  const url = new URL(request.url);

  const password = url.searchParams.get('password') || '';
  if (password != d1ModifyPassword) {
    return new JsonResponse({ error: `ur really gonna try this? please do not try to upload fake data lol` }, { status: 401 });
  }

  const startTime = new Date(url.searchParams.get('startTime')) || '';
  const values = JSON.parse(url.searchParams.get('values')) || [];

  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
});

// Manual data upload, aka harcode the values for upload here. Parameters: password=****
router.get('/manual-upload-data', async (request, env) => {
  const d1ModifyPassword = env.D1_MODIFY_PASSWORD;
  const url = new URL(request.url);

  const password = url.searchParams.get('password') || '';
  if (password != d1ModifyPassword) {
    return new JsonResponse({ error: `this endpoint is for uploading hard coded data cuz i'm lazy` }, { status: 401 });
  }

  // hardcode values here
  const startTime = new Date('2025-10-13T00:00:22-07:00')
  const values = []
  
  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
})

// Testing grounds (get stock price)
router.get('/testing', async (request, env) => {
  const db = env['vitals-stock-market']
  
  const user_id = '150093212034269184'
  const content = await util.getOpenOrders(db, symbol, user_id)

  return new JsonResponse({ message: content });
})


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

        return createBotResponse(`hello, <@${discordUser.id}>! I'm still under construction, so far you can try /leaderboard (has fake data) and /getprice (outputs last 24 hours of stock prices in markdown. My code is here: https://github.com/williamfchang/bigeatersbot`);
      }
      case commands.LEADERBOARD_COMMAND.name.toLowerCase(): {
        console.log('LEADERBOARD_COMMAND received');

        const [cashPortfolios, stocksPortfolios] = await util.getPortfolios(db);
        const content = util.getLeaderboard(cashPortfolios, stocksPortfolios);
        
        return createBotResponse(content, true)
      }
      case commands.GET_PRICE_COMMAND.name.toLowerCase(): {
        console.log('GET_PRICE_COMMAND received');

        const content = await util.getStockPrice(db, symbol);
        
        return createBotResponse(content, true)
      }
      case commands.BUY_COMMAND.name.toLowerCase(): {
        console.log('BUY_COMMAND received');

        const amount = interaction.data.options[0].value;

        const content = await util.newBuyOrder(db, symbol, user_id, amount);

        return createBotResponse(content, false)
      }
      case commands.SELL_COMMAND.name.toLowerCase(): {
        console.log('SELL_COMMAND received');

        const amount = interaction.data.options[0].value;

        const content = await util.newSellOrder(db, symbol, user_id, amount);

        return createBotResponse(content, false)
      }
      case commands.GET_OPEN_ORDERS_COMMAND.name.toLowerCase(): {
        console.log('GET_OPEN_ORDERS_COMMAND received');

        const content = await util.getOpenOrders(db, symbol, user_id);

        return createBotResponse(content, true)
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

const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
