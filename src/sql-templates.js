const tpchQueries = {
  Q1: {
    id: 'Q1', title: 'TPC-H Q1 定价汇总报表', route: 'tpch',
    description: '按退货标记和订单状态汇总 lineitem 定价信息。',
    question: '执行 TPC-H Q1 定价汇总报表。',
    examples: ['执行 TPC-H Q1', '运行 Q1 定价汇总报表', 'TPC-H Q1'],
    parameters: { days: 90 },
    buildSql: ({ days = 90 } = {}) => `
SELECT
  l_returnflag,
  l_linestatus,
  SUM(l_quantity) AS sum_qty,
  SUM(l_extendedprice) AS sum_base_price,
  SUM(l_extendedprice * (1 - l_discount)) AS sum_disc_price,
  SUM(l_extendedprice * (1 - l_discount) * (1 + l_tax)) AS sum_charge,
  AVG(l_quantity) AS avg_qty,
  AVG(l_extendedprice) AS avg_price,
  AVG(l_discount) AS avg_disc,
  COUNT(*) AS count_order
FROM tpch_100.lineitem
WHERE l_shipdate <= DATE_SUB(DAY, ${integer(days, 1, 3650)}, DATE '1998-12-01')
GROUP BY l_returnflag, l_linestatus
ORDER BY l_returnflag, l_linestatus`.trim(),
  },
  Q6: {
    id: 'Q6', title: 'TPC-H Q6 收入变化预测', route: 'tpch',
    description: '使用可控折扣范围、数量和日期参数计算折扣收入。',
    question: '执行 Q6，折扣在 5% 到 7% 之间，数量小于 24。',
    examples: ['执行 Q6，折扣在 5% 到 7% 之间，数量小于 24', '运行 TPC-H Q6', 'Q6 收入预测'],
    parameters: { startDate: '1994-01-01', endDate: '1995-01-01', discountMin: 0.05, discountMax: 0.07, quantity: 24 },
    buildSql: (params = {}) => {
      const startDate = date(params.startDate || '1994-01-01');
      const endDate = date(params.endDate || '1995-01-01');
      const discountMin = decimal(params.discountMin ?? 0.05, 0, 1);
      const discountMax = decimal(params.discountMax ?? 0.07, 0, 1);
      const quantity = decimal(params.quantity ?? 24, 0, 1000000);
      return `
SELECT SUM(l_extendedprice * l_discount) AS revenue
FROM tpch_100.lineitem
WHERE l_shipdate >= DATE '${startDate}'
  AND l_shipdate < DATE '${endDate}'
  AND l_discount BETWEEN ${discountMin} AND ${discountMax}
  AND l_quantity < ${quantity}`.trim();
    },
  },
  Q21: {
    id: 'Q21', title: 'TPC-H Q21 等待订单供应商', route: 'tpch',
    description: '使用 EXISTS 和 NOT EXISTS 查询导致已完成订单等待的供应商。',
    question: '查询沙特阿拉伯导致已完成订单等待的供应商。',
    examples: ['执行 TPC-H Q21', '查询沙特阿拉伯等待订单的供应商', '运行 Q21'],
    parameters: { nation: 'SAUDI ARABIA', limit: 100 },
    buildSql: (params = {}) => {
      const nation = string(params.nation || 'SAUDI ARABIA');
      const limit = integer(params.limit ?? 100, 1, 1000);
      return `
SELECT
  s_name,
  COUNT(*) AS numwait
FROM tpch_100.supplier
JOIN tpch_100.lineitem l1 ON s_suppkey = l1.l_suppkey
JOIN tpch_100.orders ON o_orderkey = l1.l_orderkey
JOIN tpch_100.nation ON s_nationkey = n_nationkey
WHERE o_orderstatus = 'F'
  AND l1.l_receiptdate > l1.l_commitdate
  AND EXISTS (
    SELECT 1 FROM tpch_100.lineitem l2
    WHERE l2.l_orderkey = l1.l_orderkey AND l2.l_suppkey <> l1.l_suppkey
  )
  AND NOT EXISTS (
    SELECT 1 FROM tpch_100.lineitem l3
    WHERE l3.l_orderkey = l1.l_orderkey
      AND l3.l_suppkey <> l1.l_suppkey
      AND l3.l_receiptdate > l3.l_commitdate
  )
  AND n_name = '${nation}'
GROUP BY s_name
ORDER BY numwait DESC, s_name
LIMIT ${limit}`.trim();
    },
  },
};

function integer(value, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`整数参数必须在 ${min} 到 ${max} 之间`);
  return result;
}
function decimal(value, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`数字参数必须在 ${min} 到 ${max} 之间`);
  return result;
}
function date(value) {
  const result = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('日期参数必须使用 YYYY-MM-DD 格式');
  return result;
}
function string(value) { return String(value).replace(/'/g, "''"); }
function getQuery(id) { return tpchQueries[id]; }

module.exports = { getQuery, tpchQueries };
