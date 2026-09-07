import { sql } from "drizzle-orm";

import {
  toConcreteStoreCategory,
  type StoreCategory,
  type StoreCategoryScope,
} from "@/app/lib/store/category";

export type OrdersProfitability = {
  grossRevenue: number;
  productCost: number;
  grossProfit: number;
  knownCostRevenue: number;
  lineCount: number;
  rows: {
    orderId: number;
    date: Date;
    product: string;
    quantity: number;
    revenue: number;
    cost: number | null;
    profit: number | null;
    status: string;
    storeCategory: StoreCategory;
  }[];
};

export type ProfitabilityDateRange = { from?: Date; to?: Date };

export type ProfitabilityFilters = ProfitabilityDateRange & {
  category: StoreCategoryScope;
};

export type ProfitabilityQueryRow = Record<string, unknown> & {
  order_id: number | string | null;
  date: Date | string | null;
  product: string | null;
  quantity: number | string | null;
  revenue: number | string | null;
  cost: number | string | null;
  profit: number | string | null;
  status: string | null;
  store_category: string | null;
  gross_revenue: number | string | null;
  product_cost: number | string | null;
  known_cost_revenue: number | string | null;
  line_count: number | string | null;
};

const emptyProfitability: OrdersProfitability = {
  grossRevenue: 0,
  productCost: 0,
  grossProfit: 0,
  knownCostRevenue: 0,
  lineCount: 0,
  rows: [],
};

export function summarizeProfitabilityRows(
  rows: OrdersProfitability["rows"],
): OrdersProfitability {
  const grossRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const productCost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const knownCostRevenue = rows.reduce(
    (sum, row) => sum + (row.cost == null ? 0 : row.revenue),
    0,
  );

  return {
    grossRevenue,
    productCost,
    grossProfit: knownCostRevenue - productCost,
    knownCostRevenue,
    lineCount: rows.length,
    rows,
  };
}

export function filterOrdersProfitability(
  report: OrdersProfitability,
  range: ProfitabilityDateRange,
): OrdersProfitability {
  if (!range.from && !range.to) return report;

  return summarizeProfitabilityRows(
    report.rows.filter((row) => {
      const timestamp = row.date.getTime();
      return (
        (!range.from || timestamp >= range.from.getTime()) &&
        (!range.to || timestamp <= range.to.getTime())
      );
    }),
  );
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: Date | string | null | undefined): Date {
  return value instanceof Date ? value : new Date(value ?? 0);
}

/** Effective purchase lines for paid/delivered orders, plus KPI totals. */
export function ordersProfitabilityQuery(
  filters: ProfitabilityFilters = { category: "all" },
) {
  const fromPredicate = filters.from ? sql`and date >= ${filters.from}` : sql``;
  const toPredicate = filters.to ? sql`and date <= ${filters.to}` : sql``;
  const category = toConcreteStoreCategory(filters.category);
  const categoryPredicate = category
    ? sql`and store_category = ${category}`
    : sql``;

  return sql`
  with base_lines as (
    select
      o.id as order_id,
      o.created_at as date,
      o.status,
      case
        when oi.product_variant_label is null
          or oi.product_variant_label = ''
          then coalesce(oi.product_name_at_purchase, p.name)
        else coalesce(oi.product_name_at_purchase, p.name)
          || ' (' || oi.product_variant_label || ')'
      end as product,
      oi.quantity + coalesce(deltas.quantity_delta, 0) as quantity,
      oi.price_at_purchase::numeric as unit_price,
      oi.unit_cost_at_purchase as unit_cost,
      oi.store_category_at_purchase as store_category,
      oi.id as sort_key
    from order_items oi
    inner join orders o
      on o.id = oi.order_id
      and o.status in ('paid', 'delivered')
    inner join products p on p.id = oi.product_id
    left join (
      select
        oai.base_order_item_id,
        sum(oai.quantity_delta)::int as quantity_delta
      from order_adjustment_items oai
      inner join order_adjustments oa
        on oa.id = oai.adjustment_id
      where oai.base_order_item_id is not null
      group by oai.base_order_item_id
    ) deltas on deltas.base_order_item_id = oi.id
    where oi.transaction_type = 'purchase'
      and oi.quantity + coalesce(deltas.quantity_delta, 0) > 0
  ),
  added_lines as (
    select
      o.id as order_id,
      o.created_at as date,
      o.status,
      case
        when oai.variant_label_snapshot is null
          or oai.variant_label_snapshot = ''
          then oai.product_name_snapshot
        else oai.product_name_snapshot
          || ' (' || oai.variant_label_snapshot || ')'
      end as product,
      sum(oai.quantity_delta)::int as quantity,
      oai.unit_price_snapshot as unit_price,
      oai.unit_cost_snapshot as unit_cost,
      oai.store_category_snapshot as store_category,
      min(oai.id) as sort_key
    from order_adjustment_items oai
    inner join order_adjustments oa on oa.id = oai.adjustment_id
    inner join orders o
      on o.id = oa.order_id
      and o.status in ('paid', 'delivered')
    where oai.base_order_item_id is null
      and oai.transaction_type = 'purchase'
    group by
      o.id,
      o.created_at,
      o.status,
      oai.product_id,
      oai.product_variant_id,
      oai.transaction_type,
      oai.store_category_snapshot,
      oai.unit_price_snapshot,
      oai.unit_cost_snapshot,
      oai.product_name_snapshot,
      oai.variant_label_snapshot
    having sum(oai.quantity_delta) > 0
  ),
  effective_lines as (
    select
      order_id,
      date,
      status,
      product,
      quantity,
      store_category,
      (quantity * unit_price)::numeric(12, 2) as revenue,
      case
        when unit_cost is null then null
        else (quantity * unit_cost)::numeric(12, 2)
      end as cost,
      case
        when unit_cost is null then null
        else (quantity * (unit_price - unit_cost))::numeric(12, 2)
      end as profit,
      sort_key
    from (
      select * from base_lines
      union all
      select * from added_lines
    ) lines
    where true
      ${fromPredicate}
      ${toPredicate}
      ${categoryPredicate}
  ),
  totals as (
    select
      coalesce(sum(revenue), 0)::numeric(12, 2) as gross_revenue,
      coalesce(sum(cost), 0)::numeric(12, 2) as product_cost,
      coalesce(
        sum(revenue) filter (where cost is not null),
        0
      )::numeric(12, 2) as known_cost_revenue,
      count(*)::int as line_count
    from effective_lines
  )
  select
    el.order_id,
    el.date,
    el.product,
    el.quantity,
    el.revenue,
    el.cost,
    el.profit,
    el.status,
    el.store_category,
    t.gross_revenue,
    t.product_cost,
    t.known_cost_revenue,
    t.line_count
  from totals t
  left join effective_lines el on true
  order by el.date desc, el.order_id desc, el.sort_key
`;
}

export function mapOrdersProfitabilityQuery(
  rows: readonly ProfitabilityQueryRow[],
): OrdersProfitability {
  const totals = rows[0];
  if (!totals) return emptyProfitability;

  const grossRevenue = toNumber(totals.gross_revenue);
  const productCost = toNumber(totals.product_cost);
  const knownCostRevenue = toNumber(totals.known_cost_revenue);

  return {
    grossRevenue,
    productCost,
    grossProfit: knownCostRevenue - productCost,
    knownCostRevenue,
    lineCount: toNumber(totals.line_count),
    rows: rows
      .filter((row) => row.order_id != null)
      .map((row) => ({
        orderId: toNumber(row.order_id),
        date: toDate(row.date),
        product: row.product ?? "",
        quantity: toNumber(row.quantity),
        revenue: toNumber(row.revenue),
        cost: toNullableNumber(row.cost),
        profit: toNullableNumber(row.profit),
        status: row.status ?? "",
        storeCategory: (row.store_category === "supplies"
          ? "supplies"
          : "merch") as StoreCategory,
      })),
  };
}
