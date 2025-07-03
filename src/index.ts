import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth'
import { fourZeroFourPage } from './404';
import { addLink, getLinks } from './links';
import { cfData, getPayload } from './utils';
import { getSearchPluginXml, searchPage } from './search';

export type Bindings = {
	[key in keyof CloudflareBindings]: CloudflareBindings[key];
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
	c.res.headers.set('x-powered-by', 'github.com/apix0n/rinko');
	await next();
});

app.get('/favicon.ico', (c) => c.redirect('/_/favicon.png'))

app.get('/_/search', (c) => {
	let query = c.req.query()['q'];
	const url = new URL(c.req.url)
	const origin = url.origin
	if (!query) return c.html(searchPage(origin))
	query = query.trim().replace(/ /g, '/') // replace space with /
	query = decodeURIComponent(query) // decode the URI component
	return c.redirect('/' + query + '?source=rinkoSearch');
})

app.get('/_/search.xml', (c) => {
	const url = new URL(c.req.url)
	const origin = url.origin
	return c.text(getSearchPluginXml(origin), 200, {
		'Content-Type': 'text/xml'
	})
})

app.use('/_/*', (c, next) => {
	const auth = bearerAuth({ token: c.env.API_SECRET })
	return auth(c, next);
});

app.post('/_/set', async (c) => {
	try {
		const payload = await getPayload(c);
		const result = await addLink(c.env, payload.slug, payload.url, payload.overwrite);
		console.log({ ...result, type: "set", user: cfData(c) })
		if (Object.keys(result).length === 1 && Object.keys(result)[0] === 'message') return c.json(result, 400);
		return c.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return c.json({ message }, 400);
	}
});

app.get('/_/list', async (c) => {
	const result = await getLinks(c.env)
	console.log({ type: "list", user: cfData(c) })
	return c.json(result)
})

app.all('/_/*', (c) => {
	return c.text('Not Found', 404);
})

app.get('/*', async (c) => {
	const slug = c.req.path.substring(1) || '_'; // Remove leading slash
	const destinationUrl = await c.env.LINKS.get(slug);
	console.log({
		type: "link",
		slug,
		url: destinationUrl,
		user: cfData(c),
	})
	const origin = new URL(c.req.url).origin;
	if (destinationUrl === null && slug === '_') {
		return c.html(searchPage(origin))
	}
	if (destinationUrl === null) {
		return c.html(fourZeroFourPage, 404)
	}
	const redirectUrl = new URL(destinationUrl, origin)
	// Redirect
	return c.redirect(redirectUrl);
});

export default app;
