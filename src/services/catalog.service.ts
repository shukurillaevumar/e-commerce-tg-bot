import type { Product, ProductVariant } from "@domain/models";
import { catalogCacheKey } from "@infra/kv";
import type { ServiceDeps } from "@services/types";

export interface CatalogItem {
  product: Product;
  variants: ProductVariant[];
}

export class CatalogService {
  constructor(private readonly deps: ServiceDeps) {}

  async getCatalog(): Promise<CatalogItem[]> {
    const cacheKey = catalogCacheKey();
    const cached = await this.deps.kv.get<CatalogItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const products = await this.deps.repositories.products.listActiveProducts();
    const variants = await this.deps.repositories.products.listActiveVariantsByProductIds(products.map((product) => product.id));
    const grouped = new Map<string, ProductVariant[]>();

    for (const variant of variants) {
      const list = grouped.get(variant.productId) ?? [];
      list.push(variant);
      grouped.set(variant.productId, list);
    }

    const catalog = products.map((product) => ({
      product,
      variants: grouped.get(product.id) ?? [],
    }));

    await this.deps.kv.put(cacheKey, JSON.stringify(catalog), 60);
    return catalog;
  }
}
