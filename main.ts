import 'dotenv/config';

import fetch, { FetchError, Response } from 'node-fetch';

import { App } from '@slack/bolt';

const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN as string;
const SLACK_APP_SIGNING_SECRET = process.env.SLACK_APP_SIGNING_SECRET as string;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID as string;
const STATUS_CHECK_ENDPOINT = process.env.STATUS_CHECK_ENDPOINT as string;
const PING_INTERVAL = process.env.PING_INTERVAL as string;
const GOOD_MESSAGE_INTERVAL = process.env.GOOD_MESSAGE_INTERVAL as string;
const BAD_MESSAGE_INTERVAL = process.env.BAD_MESSAGE_INTERVAL as string;
const PORT = process.env.PORT as string;

let nextGoodMessageTime = 0;
let nextBadMessageTime = 0;

const app = new App({
	token: SLACK_APP_TOKEN,
	signingSecret: SLACK_APP_SIGNING_SECRET,
});

async function postSlackMessage(color: string, text: string) {
	await app.client.chat.postMessage({
		token: SLACK_APP_TOKEN,
		channel: SLACK_CHANNEL_ID,
		attachments: [
			{
				color,
				text,
				fallback: text,
			},
		],
	});
}

async function postGoodMessage(response: Response) {
	const now = Date.now();

	if (now < nextGoodMessageTime) {
		return;
	}

	const text = `Production is healthy 😎\n\nResponse:\n\`\`\`${JSON.stringify(
		await response.json(),
		null,
		4
	)}\`\`\``;

	await postSlackMessage('#05fa3a', text);

	nextGoodMessageTime = now + Number(GOOD_MESSAGE_INTERVAL);
	nextBadMessageTime = 0;
}

async function postBadMessage(response: Response) {
	const now = Date.now();

	if (now < nextBadMessageTime) {
		return;
	}

	const text = `Production is unhealthy! ${
		response.status
	}\n\nResponse:\n\`\`\`${JSON.stringify(
		await response.json(),
		null,
		4
	)}\`\`\``;

	await postSlackMessage('#ff0000', text);

	nextBadMessageTime = now + Number(BAD_MESSAGE_INTERVAL);
	nextGoodMessageTime = 0;
}

async function postGeneralBadMessage(error: any) {
	if (error instanceof FetchError) {
		if (error.code === 'ECONNREFUSED') {
			const text = `Production is OFFLINE!\n\nSystem ECONNREFUSED Error:\n\`\`\`${JSON.stringify(
				error,
				null,
				4
			)}\`\`\``;
			await postSlackMessage('#ff0000', text);
		} else {
			const text = `Production is possibly OFFLINE!\n\nError:\n\`\`\`${JSON.stringify(
				error,
				null,
				4
			)}\`\`\``;
			await postSlackMessage('#ff0000', text);
		}
	} else {
		const text = `Unable to check status!\n\nUnknown error:\n\`\`\`${JSON.stringify(
			error,
			null,
			4
		)}\`\`\``;
		await postSlackMessage('#ff0000', text);
	}

	nextBadMessageTime = Date.now() + Number(BAD_MESSAGE_INTERVAL);
	nextGoodMessageTime = 0;
}

async function checkStatus(): Promise<void> {
	try {
		const response = await fetch(STATUS_CHECK_ENDPOINT);

		if (!response.ok) {
			await postBadMessage(response);
		} else {
			await postGoodMessage(response);
		}
	} catch (error: any) {
		postGeneralBadMessage(error);
	}
}

(async () => {
	await app.start(PORT);

	checkStatus();

	setInterval(checkStatus, Number(PING_INTERVAL));
})();
