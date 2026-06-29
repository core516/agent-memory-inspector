/**
 * quiet-sqlite.js — side-effect import that silences the one-time
 * "SQLite is an experimental feature" warning printed by `node:sqlite`.
 *
 * Must be imported BEFORE `node:sqlite`. ES module imports run in source
 * order, so importing this first installs the filter before the sqlite
 * module loads and emits its warning. We pass through every other warning.
 */
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (
    name === 'warning' &&
    data &&
    data.name === 'ExperimentalWarning' &&
    /SQLite/i.test(String(data.message))
  ) {
    return false;
  }
  return _emit.call(this, name, data, ...rest);
};
