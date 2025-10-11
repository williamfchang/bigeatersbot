This is big eaters bot.

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

To deploy the app:
1. `DISCORD_TOKEN=**** DISCORD_APPLICATION_ID=**** node src/register.js` (if the commands changed)
2. `npm run publish` -> this will publish to the Cloudflare worker!
