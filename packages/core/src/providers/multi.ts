import { ProviderError, type ListOptions, type Photo, type PhotoPage, type Provider, type SearchOptions } from "./types.ts";

/**
 * A composite provider that queries several providers at once.
 *
 * There is no shared relevance score across APIs, so results are interleaved
 * (1st from A, 1st from B, 2nd from A, …). The per-page budget is split evenly.
 * One provider failing (no key, rate limit) prints a warning and the others'
 * results are still shown; only when every provider fails is the error thrown.
 */
export function createMulti(providers: Provider[]): Provider {
  const names = providers.map((p) => p.name);

  async function combine(run: (p: Provider, perPage: number) => Promise<PhotoPage>, page: number, perPage: number): Promise<PhotoPage> {
    const share = Math.max(1, Math.ceil(perPage / providers.length));
    const results = await Promise.allSettled(providers.map((p) => run(p, share)));

    const pages: PhotoPage[] = [];
    const errors: { name: string; err: unknown }[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") pages.push(r.value);
      else errors.push({ name: providers[i]!.name, err: r.reason });
    });
    if (pages.length === 0) throw errors[0]!.err;
    for (const { name, err } of errors) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = err instanceof ProviderError && err.hint ? ` (${err.hint.split("\n")[0]})` : "";
      process.stderr.write(`warning: ${name}: ${msg}${hint}\n`);
    }

    const photos: Photo[] = [];
    const longest = Math.max(...pages.map((p) => p.photos.length));
    for (let i = 0; i < longest; i++) for (const p of pages) if (p.photos[i]) photos.push(p.photos[i]!);

    const totals = pages.map((p) => p.total);
    return {
      photos,
      page,
      perPage,
      total: totals.every((t) => t !== undefined) ? totals.reduce((a, b) => a! + b!, 0) : undefined,
      hasNext: pages.some((p) => p.hasNext),
    };
  }

  return {
    name: names.join(" + "),
    sizeNames: ["max"],
    defaultSize: "max",
    maxSize: "max",

    search(opts: SearchOptions): Promise<PhotoPage> {
      const page = opts.page ?? 1;
      return combine((p, perPage) => p.search({ ...opts, page, perPage }), page, opts.perPage ?? 10);
    },

    curated(opts: ListOptions): Promise<PhotoPage> {
      const page = opts.page ?? 1;
      return combine((p, perPage) => p.curated({ page, perPage }), page, opts.perPage ?? 10);
    },

    async get(id: string): Promise<Photo> {
      throw new ProviderError(`Cannot fetch "${id}" from several providers at once; use a prefixed id like pexels:123.`);
    },
  };
}
