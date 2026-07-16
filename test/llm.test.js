const test = require('node:test');
const assert = require('node:assert/strict');

const { validateLlmPlan } = require('../src/llm');

test('accepts an allowed semantic query from the LLM', () => {
  const plan = validateLlmPlan({
    supported: true,
    queryId: 'S2',
    confidence: 0.93,
    parameters: {},
    reason: 'The request asks for amount grouped by status.',
  }, '每种订单状态分别贡献了多少金额？', 'auto');

  assert.equal(plan.queryId, 'S2');
  assert.equal(plan.planner, 'llm');
  assert.deepEqual(plan.cubeQuery.dimensions, ['Orders.status']);
});

test('accepts a dynamic semantic query from the LLM', () => {
  const plan = validateLlmPlan({
    supported: true,
    strategy: 'dynamic',
    queryId: null,
    confidence: 0.96,
    cubeQuery: {
      measures: ['Orders.totalPrice'],
      timeDimensions: [{ dimension: 'Orders.orderDate', granularity: 'year' }],
      order: { 'Orders.orderDate': 'asc' },
    },
    reason: 'The user requests yearly sales.',
  }, '按年统计销售情况', 'auto');

  assert.equal(plan.queryId, 'DYNAMIC');
  assert.equal(plan.strategy, 'dynamic');
  assert.equal(plan.cubeQuery.timeDimensions[0].granularity, 'year');
});

test('validates and normalizes Q6 parameters from the LLM', () => {
  const plan = validateLlmPlan({
    supported: true,
    queryId: 'Q6',
    confidence: 0.9,
    parameters: { discountMin: 0.04, discountMax: 0.08, quantity: 20 },
  }, '计算折扣 4% 到 8%，数量 20 以下的收入', 'auto');

  assert.deepEqual(plan.parameters, {
    startDate: '1994-01-01',
    endDate: '1995-01-01',
    discountMin: 0.04,
    discountMax: 0.08,
    quantity: 20,
  });
});

test('rejects unknown IDs and mode violations from the LLM', () => {
  assert.throws(() => validateLlmPlan({ supported: true, queryId: 'FREE_SQL' }, 'anything', 'auto'));
  assert.throws(() => validateLlmPlan({ supported: true, queryId: 'Q6' }, 'Q6', 'semantic'));
});

test('preserves an LLM rejection', () => {
  const plan = validateLlmPlan({ supported: false, reason: 'No certified query matches.' }, '删除订单', 'auto');
  assert.equal(plan.supported, false);
  assert.equal(plan.planner, 'llm');
});
