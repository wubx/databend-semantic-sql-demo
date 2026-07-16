const YAML = require("yaml");

const { compileCubeModel, compileMemberCatalog } = require("../compiler");
const { queryDatabend } = require("../databend");
const { loadManifest } = require("../manifest");
const { requireCube } = require("./cube-dependencies");

class EmbeddedCompilerGateway {
  constructor({ manifest = loadManifest() } = {}) {
    this.name = "embedded";
    this.manifest = manifest;
    this.compilersPromise = null;
  }

  async health() {
    const compilers = await this.getCompilers();
    return {
      ok: true,
      gateway: this.name,
      cubes: compilers.cubeEvaluator.cubeNames(),
    };
  }

  async compile(cubeQuery) {
    const compilers = await this.getCompilers();
    const { DatabendQuery } = requireCube(
      "packages/cubejs-databend-driver/dist/src/DatabendQuery",
    );
    const query = new DatabendQuery(compilers, normalizeCubeQuery(cubeQuery));
    const [sql, values] = query.buildSqlAndParams();
    return {
      sql,
      values,
      gateway: this.name,
      metadata: {
        aliasNameToMember: query.aliasNameToMember,
      },
    };
  }

  async execute(cubeQuery) {
    const compiled = await this.compile(cubeQuery);
    const rows = await queryDatabend(compiled.sql, compiled.values);
    return {
      data: remapRows(rows, compiled.metadata.aliasNameToMember),
      annotation: null,
      requestId: null,
      gateway: this.name,
      source: "Embedded Cube compiler → Databend",
      sql: compiled.sql,
      sqlValues: compiled.values,
    };
  }

  async getCompilers() {
    if (!this.compilersPromise) {
      this.compilersPromise = this.createCompilers().catch((error) => {
        this.compilersPromise = null;
        throw error;
      });
    }
    return this.compilersPromise;
  }

  async createCompilers() {
    const { prepareCompiler } = requireCube(
      "packages/cubejs-schema-compiler/dist/src/compiler/PrepareCompiler",
    );
    const cubeModel = stripAiOnlyMeta(compileCubeModel(this.manifest));
    const content = YAML.stringify(cubeModel, { lineWidth: 120 });
    const repository = {
      localPath: () => process.cwd(),
      dataSchemaFiles: () =>
        Promise.resolve([
          { fileName: "embedded-semantic-model.yaml", content },
        ]),
    };
    const compilers = prepareCompiler(repository, {
      adapter: "postgres",
      standalone: true,
    });
    await compilers.compiler.compile();
    return compilers;
  }

  reset(manifest = loadManifest()) {
    this.manifest = manifest;
    this.compilersPromise = null;
  }

  meta() {
    return compileMemberCatalog(this.manifest);
  }
}

function normalizeCubeQuery(cubeQuery) {
  const order = Array.isArray(cubeQuery.order)
    ? cubeQuery.order
    : Object.entries(cubeQuery.order || {}).map(([id, direction]) => ({
        id,
        desc: direction === "desc",
      }));
  return {
    ...cubeQuery,
    measures: cubeQuery.measures || [],
    dimensions: cubeQuery.dimensions || [],
    timeDimensions: cubeQuery.timeDimensions || [],
    filters: cubeQuery.filters || [],
    segments: cubeQuery.segments || [],
    order,
    rowLimit: cubeQuery.limit ?? cubeQuery.rowLimit ?? 10000,
    timezone: cubeQuery.timezone || "UTC",
  };
}

function stripAiOnlyMeta(model) {
  const result = structuredClone(model);
  for (const cube of result.cubes || []) {
    delete cube.meta;
    for (const group of ["dimensions", "measures", "segments"]) {
      for (const member of cube[group] || []) delete member.meta;
    }
  }
  return result;
}

function remapRows(rows, aliases) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [
        aliases[column] || column,
        value,
      ]),
    ),
  );
}

module.exports = {
  EmbeddedCompilerGateway,
  normalizeCubeQuery,
  remapRows,
  stripAiOnlyMeta,
};
