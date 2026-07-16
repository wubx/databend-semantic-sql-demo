const fs = require('node:fs');
const path = require('node:path');

const { compileManifest, stringifyCubeModel } = require('./compiler');
const { loadManifest } = require('./manifest');

function build({ outputDirectory = path.join(__dirname, '..', 'generated') } = {}) {
  const manifest = loadManifest();
  const artifacts = compileManifest(manifest);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'cube-model.yaml'), stringifyCubeModel(artifacts.cubeModel));
  fs.writeFileSync(path.join(outputDirectory, 'member-catalog.json'), `${JSON.stringify(artifacts.memberCatalog, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'verified-queries.json'), `${JSON.stringify(artifacts.verifiedQueries, null, 2)}\n`);
  return artifacts;
}

if (require.main === module) {
  const artifacts = build();
  console.log(`Compiled ${artifacts.cubeModel.cubes.length} Cube model(s)`);
  console.log(`Compiled ${artifacts.memberCatalog.members.length} semantic catalog member(s)`);
  console.log(`Compiled ${artifacts.verifiedQueries.length} verified query/queries`);
}

module.exports = { build };
