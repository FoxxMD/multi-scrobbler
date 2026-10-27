import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { autoSidebarLoader } from 'starlight-auto-sidebar/loader';
import { autoSidebarSchema } from 'starlight-auto-sidebar/schema';
import { changelogsLoader } from 'starlight-changelogs/loader';
import { changelogsBase, changelogsEnabled } from '../plugins/changelogs.mjs';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  autoSidebar: defineCollection({ loader: autoSidebarLoader(), schema: autoSidebarSchema() }),
  changelogs: defineCollection({
    loader: changelogsLoader([{
        provider: 'github',
        base: changelogsBase,
        owner: 'foxxmd',
        repo: 'multi-scrobbler',
        enabled: changelogsEnabled,
        // optional, raises the GitHub API rate limit (e.g. on shared CI runners)
        ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
    }]),
  }),
};
