import type { Bindings } from ".";
import { generateRandomSlug } from "./utils";

const RESERVED = {
    exact: new Set(['favicon.ico', ".", ".."]),
    patterns: ["_/"],
    includes: ["../", "./"],
};

const isReserved = (slug: string) =>
    RESERVED.exact.has(slug) ||
    RESERVED.patterns.some(p => slug.startsWith(p)) ||
    RESERVED.includes.some(inc => slug.includes(inc));

export async function addLink(env: Bindings, slug: string | undefined, url: string | undefined, overwrite: boolean = false) {
    // Generate random slug if none provided
    if (!slug) {
        let newSlug;
        let attempts = 0;
        do {
            newSlug = generateRandomSlug();
            // Check if slug exists
            const existing = await env.LINKS.get(newSlug);
            if (existing === null) {
                slug = newSlug;
                break;
            }
            attempts++;
        } while (attempts < 10); // Prevent infinite loops

        if (!slug) {
            return {
                message: 'Could not generate unique slug after 10 attempts'
            };
        }
    }

    slug = slug.replace(/^\//, ''); // prevent slug from starting with '/'

    // Check if we should delete the entry
    if (url === undefined && overwrite) {
        await env.LINKS.delete(slug);
        const msg = {
            slug,
            message: `Deleted link ${slug}`,
        };
        return msg;
    }

    let message: string | undefined = undefined;

    // Handle regular cases
    const existing = await env.LINKS.get(slug);
    if (existing !== null) {
        if (Boolean(overwrite)) {
            message = `Overwrote URL ${existing}`;
        } else {
            const msg = {
                slug,
                url: existing,
                link: `/${slug !== "_" ? slug : ''}`,
                message: `Did not update ${slug} because it already was pointing to ${existing} and overwrite was set to ${overwrite}.`,
            }
            return msg;
        }
    }

    // Ensure url is defined before putting it
    if (!url) {
        const msg = {
            message: 'URL must be provided when creating or updating a link'
        }
        return msg
    }

    // Prevent reserved urls
    if (isReserved(slug)) {
        const msg = {
            message: 'You hit a reserved slug. Please choose another one and try again.'
        }
        return msg
    }

    if (url.startsWith("/") && url.length > 1) url = url.slice(1) // remove / for links to other links

    await env.LINKS.put(slug, url);
    const link = { slug, url, link: `/${slug !== "_" ? slug : ''}`, message }
    return link;
}

export async function getLinks(env: Bindings) {
    const links = (await env.LINKS.list()).keys;
    const results = await Promise.all(
        links.map(async (link) => {
            const url = await env.LINKS.get(link.name);
            return {
                slug: link.name,
                url: url,
                link: `/${link.name !== "_" ? link.name : ''}`
            };
        })
    );
    const resultsSorted = results.filter(entry => entry.link !== null)
        .sort((a, b) => a.slug.localeCompare(b.slug, 'en', { sensitivity: "base" }));
    return resultsSorted;
}
