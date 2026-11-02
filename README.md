# Hemut Skit Generator

A one-screen tool for the Hemut team. Fill in any of the optional fields, press generate, and get a Cluely-style skit script built around current TikTok and Instagram trends. It uses Claude with web search. There is no password and no database.

## Changing the content

All the wording the tool works from lives in the `content` folder. Edit the files, commit, and Vercel redeploys.

- `content/formats/*.md`: one file per skit format. The `name:` line at the top of each file is the label in the dropdown. Add a file to add a format.
- `content/references.md`: reference skits and styles to imitate.
- `content/hemut.md`: what Hemut is and how to talk about it.

## Run it on your computer

1. Copy `.env.example` to `.env.local` and put your Anthropic API key after `ANTHROPIC_API_KEY=`.
2. `npm install`, then `npm run dev`.
3. Open http://localhost:3000.

`npm test` runs the tests and `npm run build` checks a production build.

## Setup checklist (one time)

1. In Anthropic Console, create a dedicated workspace for this tool with a monthly spend limit (suggest $20). Create the API key inside that workspace.
2. Import this repo into Vercel and add `ANTHROPIC_API_KEY` under Project Settings, Environment Variables. Redeploy.
3. Vercel's Hobby plan is for non-commercial use only. Confirm whether Hemut should be on Hobby or Pro.

## Smoke test (after setup)

This spends a few cents of real API credit. Run it with the real key, locally or on the deployed site.

- Generate one script for each tie-in setting: Off, Light, Central.
- Each script has all 7 sections, and the Trend section has a source link.
- "Searching trends..." shows while it works, then goes away.
- Use one rewrite option and check that the script changes.
- The copy button copies the script.
