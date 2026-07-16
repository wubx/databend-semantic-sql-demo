const test = require('node:test');
const assert = require('node:assert/strict');

const { compileManifest, stringifyCubeModel } = require('../src/compiler');
const { loadManifest, validateManifest } = require('../src/manifest');

test('loads and validates the portable semantic manifest', () => {
  const manifest = loadManifest();
  assert.equal(manifest.metadata.name, 'tpch_order_analytics');
  assert.equal(manifest.entities[0].name, 'Orders');
});

test('compiles Cube YAML with semantic metadata', () => {
  const artifacts = compileManifest(loadManifest());
  const orders = artifacts.cubeModel.cubes[0];
  assert.equal(orders.sql_table, 'tpch_100.orders');
  assert.equal(orders.dimensions.find((item) => item.name === 'orderKey').primary_key, true);
  assert.deepEqual(orders.dimensions.find((item) => item.name === 'status').meta.enum, ['F', 'O', 'P']);
  assert.deepEqual(orders.measures.find((item) => item.name === 'totalPrice').meta.synonyms, [
    'total order amount', 'sales amount', 'GMV', '订单金额', '订单总金额',
  ]);
  assert.match(stringifyCubeModel(artifacts.cubeModel), /sql_table: tpch_100\.orders/);
});

test('compiles AI member catalog and verified queries', () => {
  const artifacts = compileManifest(loadManifest());
  assert.equal(artifacts.memberCatalog.members.length, 9);
  assert.equal(artifacts.memberCatalog.members.find((item) => item.member === 'Orders.totalPrice').kind, 'measure');
  assert.deepEqual(artifacts.verifiedQueries.map((query) => query.id), ['S1', 'S2', 'S3']);
});

test('rejects verified queries with unknown members', () => {
  const manifest = structuredClone(loadManifest());
  manifest.verified_queries[0].cube_query.measures = ['Orders.unknownMetric'];
  assert.throws(() => validateManifest(manifest), /unknown member Orders\.unknownMetric/);
});

test('rejects an invalid primary key reference', () => {
  const manifest = structuredClone(loadManifest());
  manifest.entities[0].keys.primary = 'missingKey';
  assert.throws(() => validateManifest(manifest), /primary key missingKey does not exist/);
});
