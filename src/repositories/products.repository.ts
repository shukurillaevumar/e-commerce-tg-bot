import type { Product, ProductVariant } from "@domain/models";
import type { D1Runner } from "@infra/db";
import { createId } from "@infra/ids";
import { decodeJson, encodeJson } from "@repositories/helpers";

interface ProductVariantRow extends Omit<ProductVariant, "metadata" | "isActive"> {
  metadata: string;
  isActive: number;
}

interface ProductRow extends Omit<Product, "isActive" | "isFeatured"> {
  isActive: number;
  isFeatured: number;
}

const PRODUCT_SELECT = `SELECT
  id,
  slug,
  title,
  description,
  photo_file_id AS photoFileId,
  photo_unique_id AS photoUniqueId,
  is_active AS isActive,
  sort_order AS sortOrder,
  availability_mode AS availabilityMode,
  availability_limit AS availabilityLimit,
  is_featured AS isFeatured,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM products`;

const PRODUCT_VARIANT_SELECT = `SELECT
  id,
  product_id AS productId,
  sku,
  title,
  package_size AS packageSize,
  tariff,
  offer_type AS offerType,
  rub_price AS rubPrice,
  is_active AS isActive,
  fulfillment_strategy AS fulfillmentStrategy,
  metadata,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM product_variants`;

function mapProduct(row: ProductRow): Product {
  return {
    ...row,
    isActive: Boolean(row.isActive),
    isFeatured: Boolean(row.isFeatured),
  };
}

function mapVariant(row: ProductVariantRow): ProductVariant {
  return {
    ...row,
    isActive: Boolean(row.isActive),
    metadata: decodeJson<Record<string, unknown>>(row.metadata, {}),
  };
}

export class ProductsRepository {
  constructor(private readonly db: D1Runner) {}

  async listActiveProducts(): Promise<Product[]> {
    const rows = await this.db.all<ProductRow>(
      `${PRODUCT_SELECT} WHERE is_active = 1 ORDER BY is_featured DESC, sort_order ASC, title ASC`,
    );
    return rows.map(mapProduct);
  }

  async listProducts(): Promise<Product[]> {
    const rows = await this.db.all<ProductRow>(`${PRODUCT_SELECT} ORDER BY is_featured DESC, sort_order ASC, title ASC`);
    return rows.map(mapProduct);
  }

  async listActiveVariantsByProductIds(productIds: string[]): Promise<ProductVariant[]> {
    if (productIds.length === 0) {
      return [];
    }

    const placeholders = productIds.map(() => "?").join(", ");
    const rows = await this.db.all<ProductVariantRow>(
      `${PRODUCT_VARIANT_SELECT} WHERE is_active = 1 AND product_id IN (${placeholders}) ORDER BY rub_price ASC`,
      productIds,
    );
    return rows.map(mapVariant);
  }

  async findProductById(productId: string): Promise<Product | null> {
    const row = await this.db.first<ProductRow>(`${PRODUCT_SELECT} WHERE id = ?`, [productId]);
    return row ? mapProduct(row) : null;
  }

  async listVariantsByProductId(productId: string): Promise<ProductVariant[]> {
    const rows = await this.db.all<ProductVariantRow>(
      `${PRODUCT_VARIANT_SELECT} WHERE product_id = ? ORDER BY rub_price ASC, title ASC`,
      [productId],
    );
    return rows.map(mapVariant);
  }

  async findVariantById(variantId: string): Promise<ProductVariant | null> {
    const row = await this.db.first<ProductVariantRow>(`${PRODUCT_VARIANT_SELECT} WHERE id = ?`, [variantId]);
    return row ? mapVariant(row) : null;
  }

  async createProduct(input: {
    slug: string;
    title: string;
    description: string;
    isFeatured: boolean;
    now: string;
  }): Promise<string> {
    const id = createId("prd");
    await this.db.run(
      `INSERT INTO products (
        id, slug, title, description, photo_file_id, photo_unique_id, is_active, sort_order, availability_mode,
        availability_limit, is_featured, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.slug, input.title, input.description, null, null, 1, 100, "unlimited", null, input.isFeatured ? 1 : 0, input.now, input.now],
    );
    return id;
  }

  async updateProduct(
    productId: string,
    input: {
      title?: string;
      description?: string;
      photoFileId?: string | null;
      photoUniqueId?: string | null;
      isActive?: boolean;
      isFeatured?: boolean;
      now: string;
    },
  ): Promise<void> {
    const current = await this.findProductById(productId);
    if (!current) {
      return;
    }

    await this.db.run(
      `UPDATE products
       SET title = ?, description = ?, photo_file_id = ?, photo_unique_id = ?, is_active = ?, is_featured = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.title ?? current.title,
        input.description ?? current.description,
        input.photoFileId !== undefined ? input.photoFileId : current.photoFileId,
        input.photoUniqueId !== undefined ? input.photoUniqueId : current.photoUniqueId,
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : (current.isActive ? 1 : 0),
        input.isFeatured !== undefined ? (input.isFeatured ? 1 : 0) : (current.isFeatured ? 1 : 0),
        input.now,
        productId,
      ],
    );
  }

  async updateVariant(
    variantId: string,
    input: {
      title?: string;
      rubPrice?: number;
      now: string;
    },
  ): Promise<void> {
    const current = await this.findVariantById(variantId);
    if (!current) {
      return;
    }

    await this.db.run(
      `UPDATE product_variants
       SET title = ?, rub_price = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.title ?? current.title,
        input.rubPrice ?? current.rubPrice,
        input.now,
        variantId,
      ],
    );
  }

  async createVariant(input: {
    productId: string;
    sku: string;
    title: string;
    packageSize: string | null;
    tariff: string | null;
    offerType: string | null;
    rubPrice: number;
    fulfillmentStrategy: ProductVariant["fulfillmentStrategy"];
    metadata?: Record<string, unknown>;
    now: string;
  }): Promise<string> {
    const id = createId("var");
    await this.db.run(
      `INSERT INTO product_variants (
        id, product_id, sku, title, package_size, tariff, offer_type, rub_price,
        is_active, fulfillment_strategy, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.productId,
        input.sku,
        input.title,
        input.packageSize,
        input.tariff,
        input.offerType,
        input.rubPrice,
        1,
        input.fulfillmentStrategy,
        encodeJson(input.metadata ?? {}),
        input.now,
        input.now,
      ],
    );
    return id;
  }
}
