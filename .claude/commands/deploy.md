# Deploy to Cloudflare

Deploy the current project. $ARGUMENTS

1. Run `wrangler deploy` and confirm success
2. Run `curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" --data '{"purge_everything":true}'` to purge cache
3. Verify deployment by checking the live URL
4. If deployment fails, show the error and suggest fixes
5. Commit with message describing what was deployed (日本語)
6. `git push origin main`
7. Show the push output and confirm success
