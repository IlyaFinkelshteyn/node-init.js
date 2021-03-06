/* @flow */
'use strict';

const path = require('path');

const { safeDump, safeLoad } = require('js-yaml');
const readPkgUp = require('read-pkg-up');
const union = require('lodash.union');
const without = require('lodash.without');

const { ensureArrayTail } = require('../data.js');
const fs = require('../fs.js');
const { isPublicGitHubOrBitbucket } = require('../git.js');
const { fetchSupportedMajors } = require('../nodejs-versions.js');
const { GIT_REPO, PACKAGE_JSON } = require('../values.js');

const LABEL = '.gitlab-ci.yml initialised';

/* :: import type { TaskOptions } from '../types.js' */

function editConfig(
  cfg /* : Object */,
  { hasYarn, majors } /* : Object */
) /* : Object */ {
  cfg.before_script = union(cfg.before_script || [], [
    'apt-get update -qq',
    'apt-get install -qy libelf1',
    'npm install --global npm'
  ]);

  // install yarn if the project uses it
  if (hasYarn) {
    cfg.before_script = union(cfg.before_script || [], [
      'npm install --global yarn'
    ]);
  } else {
    cfg.before_script = without(
      cfg.before_script || [],
      'npm install --global yarn'
    );
  }

  cfg.before_script = ensureArrayTail(cfg.before_script || [], 'npm install');

  cfg.test = cfg.test || {};

  // test against the oldest supported major version of Node.js
  cfg.test.image = cfg.test.image || 'node:' + majors[0];

  cfg.test.script = union(cfg.test.script || [], ['npm test']);

  return cfg;
}
function fn({ cwd } /* : TaskOptions */) {
  const filePath = path.join(cwd, '.gitlab-ci.yml');
  return readPkgUp({ cwd })
    .then(({ pkg }) => fetchSupportedMajors((pkg.engines || {}).node))
    .then(majors => {
      return fs
        .touch(filePath)
        .then(() => fs.readFile(filePath, 'utf8'))
        .then(safeLoad)
        .then(cfg => {
          cfg = cfg || {};

          const hasYarn = require('has-yarn')(cwd);
          cfg = editConfig(cfg, { hasYarn, majors });

          return safeDump(cfg);
        })
        .then(data => fs.writeFile(filePath, data));
    });
}

function isNeeded({ cwd } /* : TaskOptions */) {
  // if not GitHub or Bitbucket, then assume GitLab
  return isPublicGitHubOrBitbucket(cwd).then(result => !result);
}

module.exports = {
  fn,
  id: path.basename(__filename),
  isNeeded,
  label: LABEL,
  lib: { editConfig },
  requires: [GIT_REPO, PACKAGE_JSON]
};
