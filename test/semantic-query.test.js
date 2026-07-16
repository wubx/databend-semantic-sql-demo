const test = require('node:test');
const assert = require('node:assert/strict');

const { compileMemberCatalog } = require('../src/compiler');
const { loadManifest } = require('../src/manifest');
const { validateSemanticQuery } = require('../src/semantic-query');

const catalog = compileMemberCatalog(loadManifest());

test('accepts a yearly sales Cube query', () => {
  assert.deepEqual(validateSemanticQuery({
    measures: ['Orders.totalPrice'],
    timeDimensions: [{ dimension: 'Orders.orderDate', granularity: 'year' }],
    order: { 'Orders.orderDate': 'asc' },
  }, catalog), {
    measures: ['Orders.totalPrice'],
    timeDimensions: [{ dimension: 'Orders.orderDate', granularity: 'year' }],
    order: { 'Orders.orderDate': 'asc' },
    limit: 100,
    timezone: 'UTC',
  });
});

test('accepts a filtered monthly semantic query', () => {
  const query = validateSemanticQuery({
    measures: ['Orders.count', 'Orders.totalPrice'],
    timeDimensions: [{
      dimension: 'Orders.orderDate',
      granularity: 'month',
      dateRange: ['1994-01-01', '1994-12-31'],
    }],
    filters: [{ member: 'Orders.status', operator: 'equals', values: ['F'] }],
    limit: 10000,
  }, catalog);
  assert.equal(query.limit, 500);
  assert.deepEqual(query.filters[0].values, ['F']);
});

test('rejects unknown metrics and invalid time dimensions', () => {
  assert.throws(() => validateSemanticQuery({ measures: ['Orders.profit'] }, catalog), /Unknown or private/);
  assert.throws(() => validateSemanticQuery({
    measures: ['Orders.count'],
    timeDimensions: [{ dimension: 'Orders.status', granularity: 'year' }],
  }, catalog), /must be one of: time_dimension/);
});

test('rejects unsupported granularities and enum values', () => {
  assert.throws(() => validateSemanticQuery({
    measures: ['Orders.totalPrice'],
    timeDimensions: [{ dimension: 'Orders.orderDate', granularity: 'second' }],
  }, catalog), /Unsupported time granularity/);
  assert.throws(() => validateSemanticQuery({
    measures: ['Orders.count'],
    filters: [{ member: 'Orders.status', operator: 'equals', values: ['FINISHED'] }],
  }, catalog), /Invalid enum value/);
});
